// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import Stripe from "stripe";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// --------------------
// ENV
// --------------------
const PORT = process.env.PORT || 3000;

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || null;

if (!GEMINI_KEY && !OPENAI_KEY) {
  console.error("❌ Need at least GEMINI_API_KEY or OPENAI_API_KEY");
  process.exit(1);
}

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// --------------------
// SYSTEM PROMPTS
// --------------------
const SYSTEM_PROMPT = `
You are Nasoro AI. Chill, witty, friendly chatbot by Nas9229alt.
Help users, roleplay, deny harmful instructions.
`;

const ROLEPLAY_PROMPT = `
You are Oro — Nasoro 2 Chat.
A dedicated roleplay AI. Stay in character.
No multimodal. Text only.
`;

// --------------------
// MODELS
// --------------------
const NASORO_MODELS = {
  "1.2-fast": { type: "gemini", model: "gemini-2.5-flash-lite", limit: 110 },
  "1.2-pro":  { type: "gemini", model: "gemini-2.5-pro", limit: 70 },
  "2-fast":   { type: "gpt",    model: "gpt-4o-mini", limit: 50, paid: true },
  "2-pro":    { type: "gpt",    model: "gpt-4o", limit: 40, paid: true },

  // Special
  "oro-chat": { type: "openrouter", model: "meta-llama/llama-3-70b-instruct" }
};

// --------------------
// USERS
// --------------------
const users = new Map(); // uid -> { tier }

// --------------------
// HELPERS
// --------------------
function newUID() {
  return crypto.randomBytes(16).toString("hex");
}

function getUser(req, res) {
  let uid = req.cookies.nasoro_uid;
  if (!uid) {
    uid = newUID();
    res.cookie("nasoro_uid", uid, { httpOnly: true, sameSite: "lax" });
    users.set(uid, { tier: "1.2-fast" });
  }
  if (!users.has(uid)) users.set(uid, { tier: "1.2-fast" });
  return uid;
}

// --------------------
// RATE LIMIT
// --------------------
const usage = {}; // ip -> { tier: count }

function checkLimit(ip, tier) {
  if (!usage[ip]) usage[ip] = {};
  if (!usage[ip][tier]) usage[ip][tier] = 0;

  const limit = NASORO_MODELS[tier]?.limit;
  if (!limit) return true;

  if (usage[ip][tier] >= limit) return false;
  usage[ip][tier]++;
  return true;
}

// --------------------
// AI CALLERS
// --------------------
async function callGemini(model, text, images = []) {
  const parts = [{ text: SYSTEM_PROMPT }, { text }];

  images.forEach(img => {
    parts.push({
      inline_data: {
        mime_type: "image/png",
        data: img.split(",")[1]
      }
    });
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
  if (!data?.candidates?.length) throw new Error("Gemini no response");
  return data.candidates[0].content.parts[0].text;
}

async function callOpenAI(model, text) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text }
      ]
    })
  });

  const data = await res.json();
  if (!data?.choices?.length) throw new Error("OpenAI no response");
  return data.choices[0].message.content;
}

async function callOpenRouter(model, text) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: ROLEPLAY_PROMPT },
        { role: "user", content: text }
      ]
    })
  });

  const data = await res.json();
  if (!data?.choices?.length) throw new Error("OpenRouter no response");
  return data.choices[0].message.content;
}

// --------------------
// AI ENDPOINT
// --------------------
app.post("/ai", async (req, res) => {
  try {
    const { message, images = [], tier = "1.2-fast" } = req.body;
    const uid = getUser(req, res);
    const userTier = users.get(uid).tier;

    if (!NASORO_MODELS[tier]) {
      return res.json({ reply: "Invalid model selected." });
    }

    // Paid tier check
    if (NASORO_MODELS[tier].paid && userTier !== tier) {
      return res.json({ reply: "Upgrade required for this model." });
    }

    if (!message && images.length === 0) {
      return res.json({ reply: "Say something to Nasoro." });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    if (!checkLimit(ip, tier)) {
      return res.json({ reply: "Daily limit reached." });
    }

    const cfg = NASORO_MODELS[tier];
    let reply;

    if (cfg.type === "gemini") {
      reply = await callGemini(cfg.model, message, images);
    } else if (cfg.type === "gpt") {
      reply = await callOpenAI(cfg.model, message);
    } else if (cfg.type === "openrouter") {
      reply = await callOpenRouter(cfg.model, message);
    }

    res.json({ reply });
  } catch (err) {
    console.error("NASORO ERROR:", err);
    res.json({ reply: "Server error. Nasoro tripped over a wire." });
  }
});

// --------------------
app.get("/ping", (_, res) => res.send("Nasoro backend alive."));

// --------------------
app.listen(PORT, () =>
  console.log("Nasoro server running on port", PORT)
);
