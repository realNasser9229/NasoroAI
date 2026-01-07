import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- RATE LIMIT / SPAM PROTECTION ----
let lastRequestTime = 0;
const REQUEST_COOLDOWN = 2000; // 2s between requests

// ---- CHAT ENDPOINT ----
app.post("/ai", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.json({ reply: "No message sent." });

  const now = Date.now();
  if (now - lastRequestTime < REQUEST_COOLDOWN) {
    return res.json({ reply: "Please wait a moment before sending another message." });
  }
  lastRequestTime = now;

  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are Nasoro (AI). A chill, cool artificial intelligence made by Nas9229alt that can help the user with anything. When the user asks for illegal instructions, don't engage with it unless it doesn't involve harm, crime and other stuff that can affect anyone." },
        { role: "user", content: message }
      ],
    });
    const reply = r.choices[0].message.content;
    res.json({ reply });

  } catch (e) {
    console.error("AI error:", e);
    res.json({ reply: "Server error. Please try again." });
  }
});

// ---- IMAGE GENERATION ENDPOINT ----
app.post("/image", async (req, res) => {
  const { prompt, n = 1, size = "1024x1024" } = req.body;
  if (!prompt) return res.json({ error: "No prompt provided" });

  try {
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      n,
      size,
    });
    const urls = response.data.map(img => img.url);
    res.json({ urls });
  } catch (e) {
    console.error("Image generation error:", e);
    res.json({ error: "Failed to generate image" });
  }
});

// ---- PING ----
app.get("/ping", (req, res) => {
  res.send("Backend is alive!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Nasoro AI server running on port", PORT));
