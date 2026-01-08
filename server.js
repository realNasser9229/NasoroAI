import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

// =====================
// CONFIG
// =====================
const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const NASORO_SECRET = process.env.NASORO_SECRET;

// =====================
// SYSTEM PROMPT
// =====================
const SYSTEM_PROMPT = `
You are Nasoro (AI). A chill, cool multimodal chatbot created by Nas9229alt.
Engage with roleplays, help the user, give only verified answers.
Deny illegal instructions that can harm anyone or any group.
Adult language is allowed when both sides consent.
Be friendly, witty, confident, and relaxed.
`;

// =====================
// NASORO TIERS / MODELS
// =====================
const NASORO_TIERS = {
  "1.2-fast": { provider: "gemini", model: "gemini-2.5-flash-lite", limit: 110 },
  "1.2-pro":  { provider: "gemini", model: "gemini-2.5-pro", limit: 70 },
  "2-fast":   { provider: "gemini", model: "gemini-3-flash-preview", limit: 50, paid: true },
  "2-pro":    { provider: "gemini", model: "gemini-3-pro-preview", limit: 40, paid: true },
  "2-chat":   { provider: "openrouter", model: "or-nasoro-2-chat", limit: 100 }
};

// =====================
// USAGE TRACKER
// =====================
const usage = {}; // { ip: { tier: count } }

// =====================
// OWNER CHECK
// =====================
function isOwner(req) {
  const headerKey = req.headers["x-nasoro-owner"];
  return headerKey && headerKey === NASORO_SECRET;
}

// =====================
// RATE LIMIT CHECK
// =====================
function checkLimit(ip, tier, owner) {
  if (owner) return true;
  if (!usage[ip]) usage[ip] = {};
  if (!usage[ip][tier]) usage[ip][tier] = 0;

  const limit = NASORO_TIERS[tier].limit;
  if (usage[ip][tier] >= limit) return false;

  usage[ip][tier]++;
  return true;
}

// =====================
// GEMINI CALL
// =====================
async function callGemini(model, text, images = []) {
  const parts = [{ text: SYSTEM_PROMPT }, { text }];
  images.forEach(img => {
    parts.push({ inline_data: { mime_type: "image/png", data: img.split(",")[1] } });
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }] })
    }
  );
  const data = await res.json();
  if (!data?.candidates?.length) throw new Error("No response from Gemini");
  return data.candidates[0].content.parts[0].text;
}

// =====================
// OPENAI CALL
// =====================
async function callOpenAI(model, text) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: text }],
      max_tokens: 500
    })
  });
  const data = await res.json();
  if (!data?.choices?.length) throw new Error("No response from OpenAI");
  return data.choices[0].message.content;
}

// =====================
// OPENROUTERAI CALL
// =====================
async function callOpenRouter(model, text) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: text }],
      max_tokens: 500
    })
  });
  const data = await res.json();
  if (!data?.choices?.length) throw new Error("No response from OpenRouterAI");
  return data.choices[0].message.content;
}

// =====================
// MAIN AI ENDPOINT
// =====================
app.post("/ai", async (req, res) => {
  try {
    const { message, images = [], tier = "1.2-fast" } = req.body;
    if (!message && images.length === 0) return res.json({ reply: "Say something to Nasoro." });
    if (!NASORO_TIERS[tier]) return res.json({ reply: "Invalid Nasoro tier." });

    const ownerMode = isOwner(req);
    const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
    const allowed = checkLimit(ip, tier, ownerMode);
    if (!allowed) return res.json({ reply: "Daily limit reached for this tier." });

    const { provider, model } = NASORO_TIERS[tier];
    let reply;

    if (provider === "gemini") {
      reply = await callGemini(model, message, images);
    } else if (provider === "openai") {
      reply = await callOpenAI(model, message);
    } else if (provider === "openrouter") {
      reply = await callOpenRouter(model, message);
    } else {
      return res.json({ reply: "Unknown provider." });
    }

    res.json({ reply });
  } catch (err) {
    console.error("NASORO ERROR:", err);
    res.json({ reply: "Server error. Nasoro tripped over a wire." });
  }
});

// =====================
app.get("/ping", (req, res) => res.send("Nasoro backend alive."));

app.listen(PORT, () => console.log("Nasoro server running on port", PORT));
