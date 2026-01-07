import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import Jimp from "jimp"; // for watermarking
import fetch from "node-fetch"; // for downloading image URLs if needed

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" })); // allow large images

// ---- API KEYS ----
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- RATE LIMIT ----
let lastRequestTime = 0;
const REQUEST_COOLDOWN = 2000; // 2s

// ---- HELPER: add watermark ----
async function addWatermark(base64Image, text = "Nasoro") {
  const img = await Jimp.read(Buffer.from(base64Image.split(",")[1], "base64"));
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  const margin = 10;
  img.print(
    font,
    img.bitmap.width - 8*text.length - margin, // rough width calc
    img.bitmap.height - 20 - margin,
    text
  );
  const outBuffer = await img.getBufferAsync(Jimp.MIME_PNG);
  return `data:image/png;base64,${outBuffer.toString("base64")}`;
}

// ---- MAIN ENDPOINT ----
app.post("/ai", async (req, res) => {
  const { message, images, generateImage } = req.body;
  if (!message && !generateImage) return res.json({ reply: "No message sent." });

  const now = Date.now();
  if (now - lastRequestTime < REQUEST_COOLDOWN) {
    return res.json({ reply: "Please wait a moment before sending another message." });
  }
  lastRequestTime = now;

  try {
    // --- IMAGE GENERATION REQUEST ---
    if (generateImage) {
      const prompt = message || "AI generated image";
      const r = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024"
      });

      let imgBase64 = r.data[0].b64_json;
      // watermark
      imgBase64 = await addWatermark(`data:image/png;base64,${imgBase64}`);
      return res.json({ image: imgBase64 });
    }

    // --- CHAT REQUEST ---
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are Nasoro (AI). A chill, cool artificial intelligence made by Nas9229alt that can help the user with anything. When the user asks for illegal instructions, don't engage with it unless it doesn't involve harm, crime and other stuff that can affect anyone."
        },
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

// ---- PING ----
app.get("/ping", (req, res) => res.send("Backend is alive!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Nasoro AI server running on port", PORT));
