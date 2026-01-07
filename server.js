import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let lastRequestTime = 0;
const REQUEST_COOLDOWN = 2000;

app.post("/ai", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.json({ reply: "No message sent." });

  const now = Date.now();
  if (now - lastRequestTime < REQUEST_COOLDOWN) {
    return res.json({ reply: "Please wait a moment before sending another message." });
  }
  lastRequestTime = now;

  try {
    // IMAGE GENERATION COMMAND
    if (message.startsWith("/img ")) {
      const prompt = message.slice(5).trim();
      if (!prompt) return res.json({ reply: "Provide a prompt after /img." });

      const imgResult = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "512x512",
        n: 1
      });

      const imageBase64 = imgResult.data[0].b64_json;
      // For deployment, skip sharp watermark to prevent crashes
      return res.json({ reply: null, image: imageBase64 });
    }

    // NORMAL CHAT
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are Nasoro (AI). A chill, cool artificial intelligence made by Nas9229alt that can help the user with anything. When the user asks for illegal instructions, don't engage with it unless it doesn't involve harm, crime and other stuff that can affect anyone." },
        { role: "user", content: message }
      ]
    });

    const reply = r.choices[0].message.content;
    res.json({ reply });

  } catch (e) {
    console.error("AI error:", e);
    res.json({ reply: "Server error. Please try again." });
  }
});

app.get("/ping", (req, res) => res.send("Backend is alive!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Nasoro AI server running on port", PORT));
