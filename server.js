import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import OpenAI from "openai";

dotenv.config();

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// ----------------------
// Config
// ----------------------
const PORT = process.env.PORT || 3000;

// ----------------------
// System Prompt
// ----------------------
const SYSTEM_PROMPT = "You are Nasoro AI. A chill multimodal AI made by Nas9229alt.";

// ----------------------
// Tier config (OpenAI models)
// ----------------------
const NASORO_TIERS = {
  "Oro-1.2-fast": { model: "gpt-3.5-turbo", limit: 110, paid: false },
  "Oro-1.2-pro": { model: "gpt-3.5-turbo-16k", limit: 70, paid: false },
  "Oro-2-fast": { model: "gpt-4", limit: 50, paid: false },
  "Oro-2-pro": { model: "gpt-4-32k", limit: 40, paid: false },
  "Oro-2-chat": { model: "gpt-3.5-turbo", limit: 50, paid: false }
};

// ----------------------
// In-memory users
// ----------------------
const users = new Map(); // uid -> { tier: "Oro-1.2-fast" ... }

// ----------------------
// Helpers
// ----------------------
function newUID() {
  return crypto.randomBytes(16).toString("hex");
}

function getUser(req, res) {
  let uid = req.cookies.nasoro_uid;
  if (!uid) {
    uid = newUID();
    res.cookie("nasoro_uid", uid, { httpOnly: true, sameSite: "lax", secure: true });
    users.set(uid, { tier: "Oro-1.2-fast" });
  }
  if (!users.has(uid)) users.set(uid, { tier: "Oro-1.2-fast" });
  return uid;
}

// ----------------------
// Rate limit
// ----------------------
const usage = {}; // ip -> { tier: count }
function checkLimit(ip, tier) {
  if (!usage[ip]) usage[ip] = {};
  if (!usage[ip][tier]) usage[ip][tier] = 0;
  if (usage[ip][tier] >= NASORO_TIERS[tier].limit) return false;
  usage[ip][tier]++;
  return true;
}

// ----------------------
// AI endpoint
// ----------------------
app.post("/ai", async (req, res) => {
  try {
    const { message, images = [], tier = "Oro-1.2-fast" } = req.body;
    const uid = getUser(req, res);
    const userTier = users.get(uid).tier;

    // Enforce paid tiers (now everything is free)
    if (NASORO_TIERS[tier].paid && userTier !== tier) {
      return res.json({ reply: "Upgrade required for this tier." });
    }

    if (!message && images.length === 0) return res.json({ reply: "Say something to Nasoro." });

    const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
    if (!checkLimit(ip, tier)) return res.json({ reply: "Daily limit reached for this tier." });

    // Call OpenAI GPT
    const response = await openai.chat.completions.create({
      model: NASORO_TIERS[tier].model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message }
      ]
    });

    const reply = response.choices?.[0]?.message?.content || "Nasoro had a hiccup!";
    res.json({ reply, tier: userTier });

  } catch (err) {
    console.error(err);
    res.json({ reply: "Server error. Nasoro tripped over a wire." });
  }
});

// ----------------------
app.get("/ping", (req, res) => res.send("Nasoro backend alive."));
app.listen(PORT, () => console.log(`Nasoro server running on port ${PORT}`));
