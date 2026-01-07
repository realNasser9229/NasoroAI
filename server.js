import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import Jimp from "jimp";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // for image uploads

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- RATE LIMIT ----
let lastRequestTime = 0;
const REQUEST_COOLDOWN = 2000;

// ---- MAIN ENDPOINT ----
app.post("/ai", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.json({ reply: "No message sent." });

  const now = Date.now();
  if (now - lastRequestTime < REQUEST_COOLDOWN) {
    return res.json({ reply: "Please wait a moment before sending another message." });
  }
  lastRequestTime = now;

  try {
    // IMAGE GENERATION
    if (message.startsWith("/image ")) {
      const prompt = message.replace("/image ", "").trim();
      if (!prompt) return res.json({ reply: "No prompt provided." });

      const imageResp = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024"
      });

      const imageBase64 = imageResp.data[0].b64_json;
      let buffer = Buffer.from(imageBase64, "base64");

      // Watermark
      const img = await Jimp.read(buffer);
      const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
      img.print(font, img.bitmap.width - 160, img.bitmap.height - 40, "Nasoro");
      const finalBuffer = await img.getBufferAsync(Jimp.MIME_PNG);

      return res.json({ image: finalBuffer.toString("base64") });
    }

    // ---- TEXT CHAT ----
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are Nasoro (AI). A chill, cool artificial intelligence made by Nas9229alt that can help the user with anything. When the user asks for illegal instructions, don't engage with it unless it doesn't involve harm, crime and other stuff that can affect anyone."
        },
        { role: "user", content: message }
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
