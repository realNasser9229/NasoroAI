import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import Jimp from "jimp";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// ---- API KEYS ----
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- RATE LIMIT / SPAM PROTECTION ----
let lastRequestTime = 0;
const REQUEST_COOLDOWN = 2000; // 2s between messages

// ---- HELPER: Add watermark to image buffer ----
async function addWatermark(base64Data) {
  const image = await Jimp.read(Buffer.from(base64Data.split(",")[1], "base64"));
  const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  image.print(
    font,
    image.bitmap.width - 120,
    image.bitmap.height - 40,
    "Nasoro"
  );
  const outBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
  return "data:image/png;base64," + outBuffer.toString("base64");
}

// ---- MAIN ENDPOINT ----
app.post("/ai", async (req, res) => {
  const { message, images = [], generate_image = false } = req.body;

  if (!message && !generate_image) return res.json({ reply: "No message sent." });

  const now = Date.now();
  if (now - lastRequestTime < REQUEST_COOLDOWN) {
    return res.json({ reply: "Please wait a moment before sending another message." });
  }
  lastRequestTime = now;

  try {
    if (generate_image) {
      // --- IMAGE GENERATION ---
      const prompt = message || "No prompt provided.";
      const result = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024"
      });
      const generatedImages = [];

      for (const img of result.data) {
        const watermarked = await addWatermark(img.b64_json ? "data:image/png;base64," + img.b64_json : img.url);
        generatedImages.push(watermarked);
      }

      return res.json({ reply: `Generated ${generatedImages.length} image(s).`, images: generatedImages });
    } else {
      // --- NORMAL CHAT ---
      let promptText = message;
      if (images.length > 0) promptText += `\n[User sent ${images.length} image(s)]`;

      const r = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are Nasoro (AI). A chill, cool artificial intelligence made by Nas9229alt that can help the user with anything. When the user asks for illegal instructions, don't engage with it unless it doesn't involve harm, crime and other stuff that can affect anyone."
          },
          { role: "user", content: promptText }
        ]
      });

      return res.json({ reply: r.choices[0].message.content, images: [] });
    }
  } catch (e) {
    console.error("AI error:", e);
    return res.json({ reply: "Server error. Please try again.", images: [] });
  }
});

// ---- PING ----
app.get("/ping", (req, res) => res.send("Backend is alive!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Nasoro AI server running on port", PORT));
