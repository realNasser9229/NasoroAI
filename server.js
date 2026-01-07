import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import Jimp from "jimp";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // allow image payloads

// ---- API KEYS ----
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- RATE LIMIT ----
let lastRequestTime = 0;
const REQUEST_COOLDOWN = 2000; // 2 seconds between messages

// ---- HELPER: ADD WATERMARK ----
async function addWatermark(buffer) {
  const image = await Jimp.read(buffer);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  const text = "Nasoro";
  const margin = 10;
  image.print(
    font,
    image.bitmap.width - margin - Jimp.measureText(font, text),
    image.bitmap.height - margin - Jimp.measureTextHeight(font, text, image.bitmap.width),
    text
  );
  return await image.getBufferAsync(Jimp.MIME_PNG);
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
    let replyText = "";
    let replyImages = [];

    // ---- IMAGE GENERATION ----
    if (generateImage) {
      const imgRes = await openai.images.generate({
        model: "gpt-image-1",
        prompt: message,
        size: "1024x1024",
        n: 1
      });

      const imgUrl = imgRes.data[0].url;
      // Fetch image, add watermark
      const imgBuffer = Buffer.from(await (await fetch(imgUrl)).arrayBuffer());
      const watermarked = await addWatermark(imgBuffer);
      const base64Img = "data:image/png;base64," + watermarked.toString("base64");
      replyImages.push(base64Img);
      replyText = "Here's your image:";
    }

    // ---- TEXT RESPONSE ----
    if (!generateImage || message) {
      const r = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are Nasoro (AI). A chill, cool artificial intelligence made by Nas9229alt that can help the user with anything. When the user asks for illegal instructions, don't engage with it unless it doesn't involve harm, crime and other stuff that can affect anyone."
          },
          {
            role: "user",
            content: message
          }
        ]
      });
      replyText = r.choices[0].message.content;
    }

    res.json({ reply: replyText, images: replyImages });
  } catch (e) {
    console.error("AI error:", e);
    res.json({ reply: "Server error. Please try again." });
  }
});

// ---- PING ENDPOINT ----
app.get("/ping", (req, res) => {
  res.send("Backend is alive!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Nasoro AI server running on port", PORT));
