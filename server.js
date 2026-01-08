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
const NASORO_SECRET = process.env.NASORO_SECRET;

// =====================
// NASORO SYSTEM PROMPT
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
  "1.2-fast": { model: "gemini-2.5-flash-lite", limit: 110 },
  "1.2-pro":  { model: "gemini-2.5-pro",       limit: 70  },
  "2-fast":   { model: "gemini-3-flash-preview", limit: 50, paid: true },
  "2-pro":    { model: "gemini-3-pro-preview",   limit: 40, paid: true }
};

// =====================
// SIMPLE IN-MEMORY USAGE
// =====================
const usage = {}; // { ip: { tier: count } }

// =====================
// GEMINI CALL
// =====================
async function callGemini(model, text, images = []) {
  const parts = [
    { text: SYSTEM_PROMPT },
    { text }
  ];

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

  if (!data?.candidates?.length) {
    throw new Error("AI gave no response");
  }

  return data.candidates[0].content.parts[0].text;
}

// =====================
// LIMIT CHECK
// =====================
function checkLimit(ip, tier, isOwner) {
  if (isOwner) return true;

  if (!usage[ip]) usage[ip] = {};
  if (!usage[ip][tier]) usage[ip][tier] = 0;

  const limit = NASORO_TIERS[tier].limit;
  if (usage[ip][tier] >= limit) return false;

  usage[ip][tier]++;
  return true;
}

// =====================
// OWNER CHECK (SINGLE SECRET)
// =====================
function isOwner(req) {
  const headerKey = req.headers["x-nasoro-owner"];
  return headerKey && headerKey === NASORO_SECRET;
}

// =====================
// MAIN ENDPOINT
// =====================
app.post("/ai", async (req, res) => {
  try {
    const { message, images = [], tier = "1.2-fast" } = req.body;

    if (!message && images.length === 0) {
      return res.json({ reply: "Say something to Nasoro." });
    }

    if (!NASORO_TIERS[tier]) {
      return res.json({ reply: "Invalid Nasoro model selected." });
    }

    const ownerMode = isOwner(req);
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    const allowed = checkLimit(ip, tier, ownerMode);
    if (!allowed) {
      return res.json({
        reply: "Daily limit reached for this Nasoro model."
      });
    }

    const model = NASORO_TIERS[tier].model;
    const reply = await callGemini(model, message, images);

    res.json({ reply });
  } catch (err) {
    console.error("NASORO ERROR:", err);
    res.json({ reply: "Server error. Nasoro tripped over a wire." });
  }
});

// =====================
app.get("/ping", (req, res) => {
  res.send("Nasoro backend alive.");
});

app.listen(PORT, () =>
  console.log("Nasoro server running on port", PORT)
);
