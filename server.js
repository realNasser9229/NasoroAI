import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" })); 

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let conversationHistory = []; 

const getModelID = (nasoroModel) => {
  switch (nasoroModel) {
    case "nasoro-2-lite": return "gpt-3.5-turbo";
    case "nasoro-2-pro": return "gpt-4o"; 
    case "nasoro-2-chat": return "gpt-3.5-turbo-16k"; // Now using 16k for long memory
    default: return "gpt-4o-mini";
  }
};

app.post("/ai", async (req, res) => {
  const { message, images, model } = req.body;

  try {
    let targetModel = getModelID(model);
    
    let systemInstruction = "You are Nasoro, a chill AI created by Nas9229alt.";
    
    if (model === "nasoro-2-chat") {
      systemInstruction = `You are Nasoro 2 Chat, a master of Roleplay. 
      Stay in character and use asterisks *for actions*. 
      You have an extended memory (16k) to keep track of long stories.`;
    } 

    // Images require vision-capable models (gpt-4o variants)
    if (images?.length > 0) {
      targetModel = "gpt-4o-mini";
    }

    const messages = [
      { role: "system", content: systemInstruction },
      ...conversationHistory.slice(-30) // Increased memory for the 16k model
    ];

    const userContent = [];
    if (message) userContent.push({ type: "text", text: message });
    if (images?.length > 0) {
      images.forEach(img => userContent.push({ type: "image_url", image_url: { url: img } }));
    }

    messages.push({ role: "user", content: userContent });

    const response = await openai.chat.completions.create({
      model: targetModel,
      messages: messages,
      max_tokens: 1500 // Higher token limit for longer creative responses
    });

    const aiReply = response.choices[0].message.content;

    conversationHistory.push({ role: "user", content: message || "[Sent Image]" });
    conversationHistory.push({ role: "assistant", content: aiReply });
    if (conversationHistory.length > 40) conversationHistory.shift();

    res.json({ reply: aiReply });

  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "Connection lost. Please try again." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nasoro Backend Live on ${PORT}`));
