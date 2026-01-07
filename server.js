import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import Jimp from "jimp"; // for watermarking images
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // allow large base64 images

// ---- API KEY ----
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- RATE LIMIT / SPAM PROTECTION ----
let lastRequestTime = 0;
const REQUEST_COOLDOWN = 2000; // 2s

// ---- AI CHAT ENDPOINT ----
app.post("/ai", async (req, res) => {
  const { message, images, generate_image } = req.body;
  if (!message && !generate_image) return res.json({ reply: "No input sent." });

  const now = Date.now();
  if (now - lastRequestTime < REQUEST_COOLDOWN) {
    return res.json({ reply: "Please wait a moment before sending another message." });
  }
  lastRequestTime = now;

  try {
    let reply = "";
    let returnedImages = [];

    // ---- IMAGE GENERATION ----
    if (generate_image) {
      const prompt = message || "An abstract image";
      const g = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
      });

      for (let imgData of g.data) {
        const base64 = imgData.b64_json;
        const buffer = Buffer.from(base64, "base64");

        // Watermark with "Nasoro"
        const image = await Jimp.read(buffer);
        const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
        image.print(
          font,
          image.bitmap.width - 150,
          image.bitmap.height - 40,
          "Nasoro"
        );
        const watermarkedBase64 = await image.getBufferAsync(Jimp.MIME_PNG);
        returnedImages.push("data:image/png;base64," + watermarkedBase64.toString("base64"));
      }
      reply = "Generated image(s) below:";
    } else {
      // ---- CHAT WITH NASORO ----
      let promptText = message;
      if (images && images.length > 0) {
        promptText += `\n[User sent ${images.length} image(s)]`;
      }

      const r = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are Nasoro (AI). A chill, cool artificial intelligence made by Nas9229alt that can help the user with anything. When the user asks for illegal instructions, don't engage with it unless it doesn't involve harm, crime and other stuff that can affect anyone.",
          },
          { role: "user", content: promptText },
        ],
      });

      reply = r.choices[0].message.content;
    }

    res.json({ reply, images: returnedImages || images || [] });
  } catch (e) {
    console.error("AI error:", e);
    res.json({ reply: "Server error. Please try again." });
  }
});

// ---- PING ----
app.get("/ping", (req, res) => res.send("Backend is alive!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Nasoro AI server running on port", PORT));
