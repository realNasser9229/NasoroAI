import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fetch from "node-fetch";
import { createCanvas, loadImage } from "canvas";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // allow large images

// ---- API KEYS ----
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- RATE LIMIT / SPAM PROTECTION ----
let lastRequestTime = 0;
const REQUEST_COOLDOWN = 2000; // 2 seconds

// ---- IMAGE WATERMARK FUNCTION ----
async function addWatermark(base64Img) {
  const img = await loadImage(Buffer.from(base64Img.split(",")[1], "base64"));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");

  // Draw original image
  ctx.drawImage(img, 0, 0);

  // Watermark
  ctx.font = `${Math.floor(img.width/20)}px "Arial"`;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("Nasoro", img.width - 10, img.height - 10);

  return canvas.toDataURL();
}

// ---- MAIN ENDPOINT ----
app.post("/ai", async (req, res) => {
  const { message, images = [], generateImage } = req.body;

  const now = Date.now();
  if (now - lastRequestTime < REQUEST_COOLDOWN) {
    return res.json({ reply: "Please wait a moment before sending another request." });
  }
  lastRequestTime = now;

  try {
    // ---- IMAGE GENERATION MODE ----
    if (generateImage && message) {
      const imgResp = await openai.images.generate({
        model: "gpt-image-1",
        prompt: message,
        size: "1024x1024",
        n: 1
      });

      const base64Img = imgResp.data[0].b64_json;
      const watermarked = await addWatermark(`data:image/png;base64,${base64Img}`);
      return res.json({ image: watermarked });
    }

    // ---- TEXT MODE (with optional uploaded images) ----
    const systemPrompt = "You are Nasoro (AI). A chill, cool artificial intelligence made by Nas9229alt that can help the user with anything. When the user asks for illegal instructions, don't engage with it unless it doesn't involve harm, crime and other stuff that can affect anyone.";

    let userContent = message;
    if (images.length > 0) {
      userContent += `\n\nThe user sent ${images.length} image(s). Analyze them if needed.`;
    }

    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
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
