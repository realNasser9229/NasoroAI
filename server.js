// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch"; // Node 22 has fetch built-in, remove this line if using native
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ========== CONFIGURATION ==========
const OPENAI_KEY = process.env.OPENAI_KEY; // Your ChatGPT API key
if (!OPENAI_KEY) {
  console.warn("⚠️ OPENAI_KEY not set! AI responses will fail.");
}

// Fake payment URLs (replace with Stripe/PayPal integration if needed)
const PAYMENT_LINKS = {
  "2-fast": "https://checkout.fake/2fast",
  "2-pro": "https://checkout.fake/2pro",
};

// Nasoro Tiers
const NASORO_TIERS = [
  { name: "1.2 Fast", tier: "1.2-fast", paid: false, model: "gpt-3.5-turbo" },
  { name: "1.2 Pro", tier: "1.2-pro", paid: false, model: "gpt-4" },
  { name: "2 Fast", tier: "2-fast", paid: true, model: "gpt-4" },
  { name: "2 Pro", tier: "2-pro", paid: true, model: "gpt-4" },
];

// System prompt
const SYSTEM_PROMPT = "You are Nasoro AI. A chill multimodal AI made by Nas9229alt.";

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // serve index.html from public/

// ========== ROUTES ==========

// Health check
app.get("/health", (req,res)=>{
  res.json({status:"ok"});
});

// AI chat endpoint
app.post("/ai", async (req,res)=>{
  try {
    const { message, images, tier } = req.body;

    const tierData = NASORO_TIERS.find(t=>t.tier===tier);
    const model = tierData ? tierData.model : "gpt-3.5-turbo";

    // Basic payload for ChatGPT
    const payload = {
      model: model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 1000
    };

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "🤖 Nasoro couldn't think of a reply.";

    res.json({ reply });

  } catch (err) {
    console.error("AI ERROR:", err);
    res.status(500).json({ reply: "❌ Sync failed. Check backend connection." });
  }
});

// Payment endpoint
app.post("/create-checkout", (req,res)=>{
  const { tier } = req.body;
  const url = PAYMENT_LINKS[tier];
  if(url) res.json({url});
  else res.json({error:"Payment not available"});
});

// Fallback for frontend routing
app.get("*", (req,res)=>{
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Start server
app.listen(PORT, ()=>console.log(`🚀 Nasoro server running on port ${PORT}`));
