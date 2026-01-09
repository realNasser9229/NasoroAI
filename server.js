import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // for uploaded images

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- RATE LIMIT ----
let lastRequestTime = 0;
const REQUEST_COOLDOWN = 1000; // Reduced slightly for better UX

// ---- MODEL MAPPING ----
const getModelID = (nasoroModel) => {
  switch (nasoroModel) {
    case "nasoro-2-lite":
      return "gpt-3.5-turbo"; // Legacy/Lite
    case "nasoro-2-pro":
      return "gpt-4o"; // The flagship (Pro)
    case "nasoro-2":
    default:
      return "gpt-4o-mini"; // The standard efficient model
  }
};

// ---- MAIN ENDPOINT ----
app.post("/ai", async (req, res) => {
  const { message, images, model } = req.body;

  if (!message && (!images || images.length === 0))
    return res.json({ reply: "No message or image sent." });

  const now = Date.now();
  if (now - lastRequestTime < REQUEST_COOLDOWN) {
    return res.json({ reply: "Please wait a moment before sending another message." });
  }
  lastRequestTime = now;

  try {
    // Determine which OpenAI model to use based on frontend selection
    const targetModel = getModelID(model);

    // Prepare content for GPT-4o style vision structure
    let messages = [
      {
        role: "system",
        content: `You are Nasoro (AI) running on the ${model || "Nasoro 2"} engine. A chill, cool artificial intelligence made by Nas9229alt. When the user asks for illegal instructions, don't engage with it unless it doesn't involve harm, crime and other stuff that can affect anyone.`
      }
    ];

    let userContent = [];
    
    // Add text
    if (message) {
      userContent.push({ type: "text", text: message });
    }

    // Add images (OpenAI Vision format)
    if (images && images.length > 0) {
      images.forEach(base64Img => {
        userContent.push({
          type: "image_url",
          image_url: {
            url: base64Img // Ensure base64 string includes 'data:image/jpeg;base64,...' from frontend
          }
        });
      });
    }

    messages.push({ role: "user", content: userContent });

    const r = await openai.chat.completions.create({
      model: targetModel,
      messages: messages,
      max_tokens: 1000 // Cap output to save cost/time
    });

    const reply = r.choices[0].message.content;
    res.json({ reply });

  } catch (err) {
    console.error("AI error:", err);
    res.json({ reply: "Server error or Model overloaded. Please try again." });
  }
});

// ---- PING ----
app.get("/ping", (req, res) => res.send("Backend is alive!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Nasoro AI server running on port", PORT));
    
