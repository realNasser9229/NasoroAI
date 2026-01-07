import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import sharp from "sharp"; // for watermark

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // support images in Base64

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- RATE LIMIT ----
let lastRequestTime = 0;
const REQUEST_COOLDOWN = 2000; // 2 seconds

// ---- HELPER: WATERMARK IMAGE ----
async function watermarkImage(base64Buffer) {
  const watermarkText = "Nasoro";
  const imageBuffer = Buffer.from(base64Buffer, "base64");

  const imageWithWatermark = await sharp(imageBuffer)
    .composite([{
      input: Buffer.from(
        `<svg>
          <text x="95%" y="95%" font-size="36" fill="white" text-anchor="end" font-family="Arial" opacity="0.5">${watermarkText}</text>
        </svg>`
      ),
      gravity: "southeast"
    }])
    .png()
    .toBuffer();

  return imageWithWatermark.toString("base64");
}

// ---- MAIN ENDPOINT ----
app.post("/ai", async (req, res) => {
  const { message, images } = req.body;
  if (!message) return res.json({ reply: "No message sent." });

  const now = Date.now();
  if (now - lastRequestTime < REQUEST_COOLDOWN) {
    return res.json({ reply: "Please wait a moment before sending another message." });
  }
  lastRequestTime = now;

  try {
    // ---- IMAGE GENERATION COMMAND ----
    if (message.startsWith("/img ")) {
      const prompt = message.slice(5).trim();
      if (!prompt) return res.json({ reply: "Please provide a prompt after /img." });

      const result = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "512x512",
        n: 1
      });

      let imageBase64 = result.data[0].b64_json;
      imageBase64 = await watermarkImage(imageBase64);

      return res.json({ reply: null, image: imageBase64 });
    }

    // ---- NORMAL CHAT ----
    let context = [
      {
        role: "system",
        content: "You are Nasoro (AI). A chill, cool artificial intelligence made by Nas9229alt that can help the user with anything. When the user asks for illegal instructions, don't engage with it unless it doesn't involve harm, crime and other stuff that can affect anyone."
      },
      { role: "user", content: message }
    ];

    // Optional: include messages from uploaded images as text
    if (images && Array.isArray(images)) {
      images.forEach((img, i) => {
        context.push({ role: "user", content: `[Image ${i + 1} uploaded]` });
      });
    }

    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: context
    });

    const reply = r.choices[0].message.content;
    res.json({ reply });

  } catch (e) {
    console.error("AI error:", e);
    res.json({ reply: "Server error. Please try again." });
  }
});

// ---- PING ----
app.get("/ping", (req, res) => {
  res.send("Backend is alive!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Nasoro AI server running on port", PORT));
