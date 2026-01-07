import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ---- OPENAI SETUP ----
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

if (!process.env.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY not set in environment variables!");
}

// ---- SIMPLE RATE LIMIT ----
// Limits each IP to 1 request every 2 seconds
const rateLimitMap = new Map();
const RATE_LIMIT_MS = 2000;

function canSend(ip) {
  const last = rateLimitMap.get(ip) || 0;
  const now = Date.now();
  if (now - last < RATE_LIMIT_MS) return false;
  rateLimitMap.set(ip, now);
  return true;
}

// ---- HEALTH CHECK ----
app.get("/ping", (req, res) => {
  res.send("Backend is alive!");
});

// ---- AI CHAT ENDPOINT ----
app.post("/ai", async (req, res) => {
  const { message } = req.body;
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";

  if (!message) return res.status(400).json({ reply: "No message sent." });
  if (!canSend(ip)) return res.status(429).json({ reply: "Slow down, please!" });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // best model currently
      messages: [{ role: "user", content: message }],
      max_tokens: 500,
    });

    const reply = response?.choices?.[0]?.message?.content || "No response from AI.";
    res.json({ reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ reply: "Server error." });
  }
});

// ---- PORT ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AI server running on port ${PORT}`));
