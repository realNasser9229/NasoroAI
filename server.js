import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";
import Stripe from "stripe";

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// ----------------------
// Config
// ----------------------
const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error("❌ Missing GEMINI_API_KEY");
  process.exit(1);
}

// ----------------------
// System Prompt
// ----------------------
const SYSTEM_PROMPT = `
You are Nasoro AI. Chill, witty, friendly chatbot by Nas9229alt.
Engage roleplays, help the user, deny harmful instructions.
`;

// ----------------------
// Tier config
// ----------------------
const NASORO_TIERS = {
  "1.2-fast": { model: "gemini-2.5-flash-lite", limit: 110 },
  "1.2-pro":  { model: "gemini-2.5-pro", limit: 70 },
  "2-fast":   { model: "gemini-3-flash-preview", limit: 50, paid: true },
  "2-pro":    { model: "gemini-3-pro-preview", limit: 40, paid: true }
};

// ----------------------
// In-memory users
// ----------------------
const users = new Map(); // uid -> { tier: "free"|"2-fast"|"2-pro" }

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
    users.set(uid, { tier: "1.2-fast" });
  }
  if (!users.has(uid)) users.set(uid, { tier: "1.2-fast" });
  return uid;
}

// ----------------------
// Gemini call
// ----------------------
async function callGemini(model, text, images=[]) {
  const parts = [{ text: SYSTEM_PROMPT }, { text }];
  images.forEach(img => {
    parts.push({ inline_data: { mime_type: "image/png", data: img.split(",")[1] }});
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents:[{ role:"user", parts }] }) }
  );

  const data = await res.json();
  if (!data?.candidates?.length) throw new Error("No AI reply");
  return data.candidates[0].content.parts[0].text;
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
    const { message, images=[], tier="1.2-fast" } = req.body;
    const uid = getUser(req, res);
    const userTier = users.get(uid).tier;

    // Enforce paid tiers
    if (NASORO_TIERS[tier].paid && userTier !== tier) {
      return res.json({ reply: "Upgrade required for this tier." });
    }

    if (!message && images.length === 0) return res.json({ reply: "Say something to Nasoro." });

    const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
    if (!checkLimit(ip, tier)) return res.json({ reply: "Daily limit reached for this tier." });

    const reply = await callGemini(NASORO_TIERS[tier].model, message, images);
    res.json({ reply, tier: userTier });
  } catch (err) {
    console.error(err);
    res.json({ reply: "Server error. Nasoro tripped over a wire." });
  }
});

// ----------------------
// Stripe checkout
// ----------------------
app.post("/create-checkout", async (req, res) => {
  const uid = getUser(req, res);
  const { tier } = req.body;

  if (!["2-fast","2-pro"].includes(tier)) return res.status(400).json({ error: "Invalid tier" });

  const priceId = tier === "2-fast" ? process.env.STRIPE_PRICE_FAST : process.env.STRIPE_PRICE_PRO;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: "https://your-site.com/success",
    cancel_url: "https://your-site.com/cancel",
    metadata: { uid, tier }
  });

  res.json({ url: session.url });
});

// ----------------------
// Stripe webhook
// ----------------------
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch { return res.status(400).send("Webhook error"); }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { uid, tier } = session.metadata;
    if (users.has(uid)) users.get(uid).tier = tier;
  }

  res.json({ received: true });
});

// ----------------------
app.get("/ping", (req, res) => res.send("Nasoro backend alive."));
app.listen(PORT, () => console.log("Nasoro server running on port", PORT));
