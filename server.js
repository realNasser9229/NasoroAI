import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";
import Stripe from "stripe";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// =====================
// ENV
// =====================
const PORT = process.env.PORT || 10000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const PRICE_2_FAST = process.env.NASORO_2_FAST_PRICE_ID;
const PRICE_2_PRO  = process.env.NASORO_2_PRO_PRICE_ID;
const PRICE_2_CHAT = process.env.NASORO_2_CHAT_PRICE_ID;

if (!GEMINI_KEY || !STRIPE_SECRET_KEY) {
  console.error("❌ Missing critical env vars");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

// =====================
// SYSTEM PROMPT
// =====================
const SYSTEM_PROMPT = `
You are Nasoro (AI). A chill, cool multimodal chatbot created by Nas9229alt.
Engage with roleplays, help the user, give only verified answers.
Deny illegal instructions that can harm anyone or a group.
Adult language allowed only with mutual consent.
Be friendly, witty, confident, relaxed.
`;

// =====================
// NASORO MODELS
// =====================
const NASORO_TIERS = {
  "Oro-1.2-fast": { model: "gemini-2.5-flash-lite", limit: 110, paid: false },
  "Oro-1.2-pro":  { model: "gemini-2.5-pro",       limit: 70,  paid: false },

  "Oro-2-fast":   { model: "gemini-3-flash-preview", limit: 50, paid: true, price: PRICE_2_FAST },
  "Oro-2-pro":    { model: "gemini-3-pro-preview",   limit: 40, paid: true, price: PRICE_2_PRO },

  // roleplay only, OpenRouter
  "Oro-2-chat":   { model: "openrouter-chat",        limit: 50, paid: true, price: PRICE_2_CHAT }
};

// =====================
// USER STORAGE (server only)
// =====================
const users = new Map();     // uid -> { tier }
const usage = {};           // ip -> { tier: count }

// =====================
// HELPERS
// =====================
function newUID() {
  return crypto.randomBytes(16).toString("hex");
}

function getUser(req, res) {
  let uid = req.cookies.nasoro_uid;

  if (!uid) {
    uid = newUID();
    res.cookie("nasoro_uid", uid, {
      httpOnly: true,
      sameSite: "lax",
      secure: true
    });
    users.set(uid, { tier: "Oro-1.2-fast" });
  }

  if (!users.has(uid)) {
    users.set(uid, { tier: "Oro-1.2-fast" });
  }

  return uid;
}

function checkLimit(ip, tier) {
  if (!usage[ip]) usage[ip] = {};
  if (!usage[ip][tier]) usage[ip][tier] = 0;

  if (usage[ip][tier] >= NASORO_TIERS[tier].limit) return false;
  usage[ip][tier]++;
  return true;
}

// =====================
// AI CALLERS
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
  if (!data?.candidates?.length) throw new Error("Gemini gave no reply");

  return data.candidates[0].content.parts[0].text;
}

async function callOpenRouter(text) {
  if (!OPENROUTER_KEY) throw new Error("Missing OpenRouter key");

  const res = await fetch("https://api.openrouter.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openrouter/auto",
      messages: [{ role: "user", content: text }]
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "No reply from Oro Chat";
}

// =====================
// MAIN AI ENDPOINT
// =====================
app.post("/ai", async (req, res) => {
  try {
    const { message, images = [], tier = "Oro-1.2-fast" } = req.body;

    if (!NASORO_TIERS[tier]) {
      return res.json({ reply: "Invalid Nasoro model." });
    }

    if (!message && images.length === 0) {
      return res.json({ reply: "Say something to Nasoro." });
    }

    const uid = getUser(req, res);
    const user = users.get(uid);

    // payment lock
    if (NASORO_TIERS[tier].paid && user.tier !== tier) {
      return res.json({ reply: "This model requires an active plan." });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    if (!checkLimit(ip, tier)) {
      return res.json({ reply: "Daily limit reached for this model." });
    }

    let reply;

    if (NASORO_TIERS[tier].model === "openrouter-chat") {
      reply = await callOpenRouter(message);
    } else {
      reply = await callGemini(NASORO_TIERS[tier].model, message, images);
    }

    res.json({ reply });
  } catch (err) {
    console.error("NASORO ERROR:", err);
    res.json({ reply: "Server error. Nasoro tripped over a wire." });
  }
});

// =====================
// STRIPE CHECKOUT
// =====================
app.post("/create-checkout", async (req, res) => {
  try {
    const { tier } = req.body;
    const config = NASORO_TIERS[tier];

    if (!config || !config.paid || !config.price) {
      return res.json({ error: "Invalid tier" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: config.price,
          quantity: 1
        }
      ],
      success_url: "https://your-site.com/success",
      cancel_url: "https://your-site.com/cancel",
      metadata: { tier }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("STRIPE ERROR:", err);
    res.json({ error: "Payment init failed" });
  }
});

// =====================
// STRIPE WEBHOOK
// =====================
app.post("/stripe-webhook", express.raw({ type: "application/json" }), (req, res) => {
  let event = req.body;

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const tier = session.metadata.tier;

      // grant user tier (cookie based users won’t match here,
      // this is for real accounts later)
      console.log("Payment completed for", tier);
    }
  } catch (err) {
    console.error("Webhook error", err);
  }

  res.json({ received: true });
});

// =====================
app.get("/ping", (req, res) => {
  res.send("Nasoro backend alive.");
});

app.listen(PORT, () => {
  console.log("🔥 Nasoro running on port", PORT);
});
