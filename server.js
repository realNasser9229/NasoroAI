import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" })); // Increased limit for high-res images

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let lastRequestTime = 0;
const REQUEST_COOLDOWN = 1000;

const getModelID = (nasoroModel) => {
  switch (nasoroModel) {
    case "nasoro-2-lite": return "gpt-3.5-turbo";
    case "nasoro-2-pro": return "gpt-4o"; 
    case "nasoro-2": default: return "gpt-4o-mini";
  }
};

app.post("/ai", async (req, res) => {
  const { message, images, model } = req.body;

  if (!message && (!images || images.length === 0))
    return res.json({ reply: "No message or image sent." });

  // Rate Limit
  const now = Date.now();
  if (now - lastRequestTime < REQUEST_COOLDOWN) {
    return res.json({ reply: "Please wait a moment." });
  }
  lastRequestTime = now;

  try {
    let targetModel = getModelID(model);

    // AUTO-FIX: GPT-3.5 cannot see images. 
    // If images are present, force switch to GPT-4o-mini (Nasoro 2)
    if (images && images.length > 0 && targetModel === "gpt-3.5-turbo") {
      targetModel = "gpt-4o-mini"; 
      console.log("Auto-switched to Vision model");
    }

    let messages = [
      {
        role: "system",
        content: `You are Nasoro (AI) running on ${model}. Made by Nas9229alt. Helpful, cool, and intelligent.`
      }
    ];

    let userContent = [];

    // Add Text
    if (message) userContent.push({ type: "text", text: message });

    // Add Images
    if (images && images.length > 0) {
      images.forEach(base64Img => {
        userContent.push({
          type: "image_url",
          image_url: { url: base64Img }
        });
      });
    }

    messages.push({ role: "user", content: userContent });

    const r = await openai.chat.completions.create({
      model: targetModel,
      messages: messages,
      max_tokens: 1000
    });

    res.json({ reply: r.choices[0].message.content });

  } catch (err) {
    console.error("AI Error:", err);
    res.json({ reply: "I couldn't process that. (Server Error)" });
  }
});

app.get("/ping", (req, res) => res.send("Alive"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Nasoro AI running on port", PORT));
      
