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

// Map Nasoro models to OpenAI models
const getModelID = (nasoroModel) => {
  switch (nasoroModel) {
    case "nasoro-2-lite": return "gpt-3.5-turbo";
    case "nasoro-2-pro": return "gpt-4o";
    case "nasoro-2-chat": return "gpt-3.5-turbo-16k"; // Use 16k tokens for long RP
    default: return "gpt-4o-mini";
  }
};

// Adjust max tokens based on model
const getMaxTokens = (nasoroModel) => {
  switch (nasoroModel) {
    case "nasoro-2-chat": return 4000; // More room for Roleplay responses
    case "nasoro-2-pro": return 1200;
    default: return 1200;
  }
};

app.post("/ai", async (req, res) => {
  const { message, images, model } = req.body;

  try {
    let targetModel = getModelID(model);
    const maxTokens = getMaxTokens(model);

    // System Personality
    let systemInstruction = "You are Nasoro, a chill AI created by Nas9229alt.";

    if (model === "nasoro-2-chat") {
      systemInstruction = `You are Nasoro 2 Chat, a master of Roleplay and creative storytelling.
      Stay in character, use descriptive language, and use asterisks for actions (e.g., *Leans back and smiles.*).
      Be immersive and witty. Be cool.`;
    } else if (model === "nasoro-2-pro") {
      systemInstruction = "You are Nasoro 2 Pro, an elite and highly sophisticated intelligence made by Nas9229alt.";
    }

    // Auto-upgrade for images if on Lite
    if (images?.length > 0 && targetModel === "gpt-3.5-turbo") {
      targetModel = "gpt-4o-mini";
    }

    // Build messages array
    const messages = [
      { role: "system", content: systemInstruction },
      ...conversationHistory.slice(-20) // Increase memory for RP
    ];

    const userContent = [];
    if (message) userContent.push({ type: "text", text: message });
    if (images?.length > 0) {
      images.forEach(img => userContent.push({ type: "image_url", image_url: { url: img } }));
    }

    messages.push({ role: "user", content: userContent });

    // Send request to OpenAI
    const response = await openai.chat.completions.create({
      model: targetModel,
      messages: messages,
      max_tokens: maxTokens
    });

    const aiReply = response.choices[0].message.content;

    // Save conversation history (Text only)
    conversationHistory.push({ role: "user", content: message || "[Sent Image]" });
    conversationHistory.push({ role: "assistant", content: aiReply });
    if (conversationHistory.length > 40) conversationHistory.shift(); // Keep RP memory longer

    res.json({ reply: aiReply });

  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "My circuits are fried. Try again!" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nasoro Backend Live on ${PORT}`));
