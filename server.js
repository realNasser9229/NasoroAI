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
const REQUEST_COOLDOWN = 2000;

// ---- MAIN ENDPOINT ----
app.post("/ai", async (req, res) => {
  const { message, images } = req.body;

  if (!message && (!images || images.length === 0))
    return res.json({ reply: "No message or image sent." });

  const now = Date.now();
  if (now - lastRequestTime < REQUEST_COOLDOWN) {
    return res.json({ reply: "Please wait a moment before sending another message." });
  }
  lastRequestTime = now;

  try {
    // Only text chat (no image generation)
    let prompt = message || "";

    // Optional: include uploaded image info in prompt
    if (images && images.length > 0) {
      prompt += "\n[User uploaded images: " + images.map((_, i) => `Image${i + 1}`).join(", ") + "]";
    }

    const r = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are Nasoro (AI). A chill, cool artificial intelligence made by Nas9229alt that can help the user with anything. When the user asks for illegal instructions, don't engage with it unless it doesn't involve harm, crime and other stuff that can affect anyone."
        },
        { role: "user", content: prompt }
      ]
    });

    const reply = r.choices[0].message.content;
    res.json({ reply });

  } catch (err) {
    console.error("AI error:", err);
    res.json({ reply: "Server error. Please try again." });
  }
});

// ---- PING ----
app.get("/ping", (req, res) => res.send("Backend is alive!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Nasoro AI server running on port", PORT));
