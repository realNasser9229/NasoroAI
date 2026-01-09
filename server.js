import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
// Increased limit to 50mb to handle multiple high-res images from the frontend tray
app.use(express.json({ limit: "50mb" })); 

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- MEMORY & RATE LIMIT ----
let lastRequestTime = 0;
const REQUEST_COOLDOWN = 1000;
// Global history to keep track of the conversation context
let conversationHistory = []; 

// ---- MODEL MAPPING ----
const getModelID = (nasoroModel) => {
  switch (nasoroModel) {
    case "nasoro-2-lite":
      return "gpt-3.5-turbo";
    case "nasoro-2-pro":
      return "gpt-4o"; 
    case "nasoro-2":
    default:
      return "gpt-4o-mini";
  }
};

// ---- MAIN ENDPOINT ----
app.post("/ai", async (req, res) => {
  const { message, images, model } = req.body;

  // Validation
  if (!message && (!images || images.length === 0)) {
    return res.json({ reply: "No message or image sent." });
  }

  // Rate Limiting
  const now = Date.now();
  if (now - lastRequestTime < REQUEST_COOLDOWN) {
    return res.json({ reply: "Slow down! Nasoro is thinking..." });
  }
  lastRequestTime = now;

  try {
    let targetModel = getModelID(model);

    // AUTO-UPGRADE: gpt-3.5-turbo cannot process images.
    // If images are detected, we force use gpt-4o-mini so the request doesn't fail.
    if (images && images.length > 0 && targetModel === "gpt-3.5-turbo") {
      targetModel = "gpt-4o-mini";
    }

    // Build the payload starting with the System Prompt
    const messages = [
      {
        role: "system",
        content: `You are Nasoro (AI), a chill and highly intelligent assistant created by Nas9229alt. 
        You are running on the ${model} engine. You should be helpful, witty, and concise. 
        If a user asks for something harmful, decline politely. 
        You have a memory of the current conversation.`
      },
      // Spread the last 8 messages of history into the current request for context
      ...conversationHistory.slice(-8) 
    ];

    // Construct the User's current message (Text + Images)
    const userContent = [];
    if (message) {
      userContent.push({ type: "text", text: message });
    }
    if (images && images.length > 0) {
      images.forEach((img) => {
        userContent.push({
          type: "image_url",
          image_url: { url: img }
        });
      });
    }

    messages.push({ role: "user", content: userContent });

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: targetModel,
      messages: messages,
      max_tokens: 1000
    });

    const aiReply = response.choices[0].message.content;

    // Save to History (We only save the text to history to keep it lightweight)
    conversationHistory.push({ role: "user", content: message || "[Sent an image]" });
    conversationHistory.push({ role: "assistant", content: aiReply });

    // Trim history so it doesn't grow infinitely (Max 20 messages)
    if (conversationHistory.length > 20) {
      conversationHistory.shift();
    }

    res.json({ reply: aiReply });

  } catch (err) {
    console.error("Nasoro Backend Error:", err);
    res.status(500).json({ reply: "My circuits got crossed. Please try again in a second!" });
  }
});

// ---- UTILITY ENDPOINTS ----
app.get("/ping", (req, res) => res.send("Nasoro AI Backend is Active."));

// Endpoint to manually clear memory if needed
app.post("/clear", (req, res) => {
  conversationHistory = [];
  res.json({ status: "Memory wiped." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Nasoro AI is live on port ${PORT}`);
});
