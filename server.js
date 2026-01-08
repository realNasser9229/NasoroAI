// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const OPENAI_KEY = process.env.OPENAI_KEY;
if (!OPENAI_KEY) console.warn("⚠️ OPENAI_KEY not set! AI responses will fail.");

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Nasoro system prompt
const SYSTEM_PROMPT = "You are Nasoro AI. A chill multimodal AI made by Nas9229alt.";

// Fake tiers & payment links
const PAYMENT_LINKS = {
  "2-fast": "https://checkout.fake/2fast",
  "2-pro": "https://checkout.fake/2pro"
};

// AI endpoint
app.post("/ai", async (req,res)=>{
  try {
    const { message, tier } = req.body;

    const model = tier?.includes("pro") ? "gpt-4" : "gpt-3.5-turbo";

    // Minimal ChatGPT payload
    const payload = {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message }
      ],
      max_tokens: 1000
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "🤖 Nasoro couldn’t think of a reply.";

    res.json({ reply });
  } catch(e) {
    console.error(e);
    res.status(500).json({ reply: "❌ Sync failed. Check backend connection." });
  }
});

// Payment endpoint
app.post("/create-checkout", (req,res)=>{
  const { tier } = req.body;
  const url = PAYMENT_LINKS[tier];
  res.json({ url: url || null });
});

// Fallback
app.get("*", (req,res)=>{
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Start
app.listen(PORT, ()=>console.log(`🚀 Nasoro server running on port ${PORT}`));
