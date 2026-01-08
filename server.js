import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OWNER_KEY = process.env.OWNER_KEY;

/* ---------------- MODELS ---------------- */

const NASORO_MODELS = {
  "1.2-fast": "gemini-2.5-flash-lite",
  "1.2-thinking": "gemini-2.5-pro",
  "2-fast": "gemini-3-flash-preview",
  "2-pro": "gemini-3-pro-preview"
};

/* ---------------- LIMITS ---------------- */

const limits = {
  "1.2-fast": 9999,
  "1.2-thinking": 30,
  "2-fast": 20,
  "2-pro": 20
};

const userUsage = new Map();

/* ---------------- HELPERS ---------------- */

function isOwner(req) {
  return req.body.ownerKey === OWNER_KEY;
}

function canUse(userId, tier) {
  if (!userUsage.has(userId)) userUsage.set(userId, {});
  const data = userUsage.get(userId);
  if (!data[tier]) data[tier] = 0;

  if (data[tier] >= limits[tier]) return false;

  data[tier]++;
  return true;
}

/* ---------------- GEMINI CALL ---------------- */

async function callGemini(model, text, images = []) {
  const parts = [{ text }];

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
  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "I couldn't generate a response."
  );
}

/* ---------------- API ---------------- */

app.post("/ai", async (req, res) => {
  try {
    const { message, images = [], tier = "1.2-fast" } = req.body;
    const userId = req.ip;

    const isUserOwner = isOwner(req);

    const model = NASORO_MODELS[tier];
    if (!model) return res.status(400).json({ error: "Invalid tier." });

    if (!isUserOwner) {
      if (!canUse(userId, tier)) {
        return res.json({
          reply:
            "You reached the limit for this tier. Upgrade Nasoro to continue."
        });
      }
    }

    const reply = await callGemini(model, message, images);
    res.json({ reply });
  } catch (err) {
    console.error("AI ERROR:", err);
    res.status(500).json({ reply: "Server error. Try again later." });
  }
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log("Nasoro backend running on port", PORT);
});
