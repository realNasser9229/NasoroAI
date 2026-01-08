import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// =====================
// CONFIG
// =====================
const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OWNER_KEY = process.env.OWNER_KEY; // server-side only

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
// NASORO TIERS
// =====================
const NASORO_TIERS = {
  "1.2-fast": { model: "gemini-2.5-flash-lite", limit: 110, paid: false },
  "1.2-pro": { model: "gemini-2.5-pro", limit: 70, paid: false },
  "2-fast": { model: "gemini-3-flash-preview", limit: 50, paid: true },
  "2-pro": { model: "gemini-3-pro-preview", limit: 40, paid: true }
};

// =====================
// SIMPLE IN-MEMORY USAGE & PAYMENTS
// =====================
const usage = {};        // { ip: { tier: count } }
const paidUsers = {};    // { ip: [tiers paid] }

// =====================
// HELPER FUNCTIONS
// =====================
function getIP(req) {
  return req.headers["x-forwarded-for"] || req.socket.remoteAddress;
}

function isOwner(req) {
  // owner bypass via secret key sent internally
  return req.headers["x-owner-key"] === OWNER_KEY;
}

function checkLimit(ip, tier, owner) {
  if (owner) return true;

  if (!usage[ip]) usage[ip] = {};
  if (!usage[ip][tier]) usage[ip][tier] = 0;

  if (usage[ip][tier] >= NASORO_TIERS[tier].limit) return false;

  usage[ip][tier]++;
  return true;
}

function canAccessTier(ip, tier, owner) {
  if (owner) return true;

  if (NASORO_TIERS[tier].paid) {
    return paidUsers[ip]?.includes(tier) || false;
  }
  return true;
}

// =====================
// GEMINI CALL
// =====================
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
      body: JSON.stringify({
        contents: [{ role: "user", parts }]
      })
    }
  );

  const data = await res.json();

  if (!data?.candidates?.length) throw new Error("AI gave no response");
  return data.candidates[0].content.parts[0].text;
}

// =====================
// MAIN AI ENDPOINT
// =====================
app.post("/ai", async (req, res) => {
  try {
    const { message, images = [], tier = "1.2-fast" } = req.body;
    if (!message && images.length === 0) return res.json({ reply: "Say something to Nasoro." });

    if (!NASORO_TIERS[tier]) return res.json({ reply: "Invalid Nasoro tier." });

    const ip = getIP(req);
    const owner = isOwner(req);

    // check paid tier access
    if (!canAccessTier(ip, tier, owner)) {
      return res.json({ reply: "This is a paid tier. Please subscribe to access." });
    }

    // check usage limits
    if (!checkLimit(ip, tier, owner)) {
      return res.json({ reply: "Daily limit reached for this Nasoro tier." });
    }

    const reply = await callGemini(NASORO_TIERS[tier].model, message, images);
    res.json({ reply });

  } catch (err) {
    console.error("NASORO ERROR:", err.message);
    res.json({ reply: "Server error. Nasoro tripped over a wire." });
  }
});

// =====================
// SIMPLE PAYMENT SIMULATION
// =====================
app.post("/pay", (req, res) => {
  const { tier } = req.body;
  const ip = getIP(req);
  const owner = isOwner(req);
  if (owner) return res.json({ success: true, msg: "Owner bypass" });

  if (!NASORO_TIERS[tier] || !NASORO_TIERS[tier].paid)
    return res.json({ success: false, msg: "Invalid paid tier" });

  if (!paidUsers[ip]) paidUsers[ip] = [];
  paidUsers[ip].push(tier);

  res.json({ success: true, msg: `Payment registered for tier ${tier}` });
});

// =====================
app.get("/ping", (req, res) => res.send("Nasoro backend alive."));

app.listen(PORT, () => console.log("Nasoro server running on port", PORT));
