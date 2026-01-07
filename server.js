import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // allow big image payloads

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- RATE LIMIT ----
let lastRequestTime = 0;
const REQUEST_COOLDOWN = 2000;

app.post("/ai", async (req, res) => {
  const { message, images } = req.body;

  if(!message && (!images || images.length===0)) 
    return res.json({ reply: "No message or images sent." });

  const now = Date.now();
  if(now - lastRequestTime < REQUEST_COOLDOWN)
    return res.json({ reply: "Please wait a moment before sending another message." });
  lastRequestTime = now;

  try {
    // ---- IMAGE GENERATION REQUEST ----
    if(message.toLowerCase().includes("generate image") || message.toLowerCase().includes("/img")) {
      const prompt = message.replace("/img","").replace("generate image","").trim() || "AI artwork";

      const imgRes = await openai.images.generate({
        model: "gpt-image-1",
        prompt: prompt + " with watermark 'Nasoro' on bottom right",
        size: "1024x1024"
      });

      const imgUrl = imgRes.data[0].url;
      return res.json({ reply: "Here's your image!", image: imgUrl });
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

  } catch(e) {
    console.error("AI error:", e);
    res.json({ reply: "Server error. Please try again." });
  }
});

app.get("/ping", (req,res)=>res.send("Backend is alive!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Nasoro AI server running on port", PORT));
