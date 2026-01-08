import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Define Nasoro versions and the corresponding Gemini model
const nasoroVersions = {
  "1.2 Fast": { model: "gemini-2.5-flash-lite", paid: false },
  "1.2 Pro": { model: "gemini-2.5-pro", paid: false },
  "2 Fast": { model: "gemini-3-flash-preview", paid: true, priceTRY: 49.99 },
  "2 Pro": { model: "gemini-3-pro-preview", paid: true, priceTRY: 209.99 },
};

// Simple in-memory storage for user sessions / paid access
let paidAccess = {}; // { sessionId: { tier: "2 Pro", expires: Date } }

// Utility to check if a tier is paid
function isPaidTier(tier, sessionId) {
  const tierInfo = nasoroVersions[tier];
  if (!tierInfo.paid) return true; // free tiers always allowed
  const access = paidAccess[sessionId];
  return access && access.tier === tier && new Date() < new Date(access.expires);
}

// Endpoint to chat with Nasoro
app.post("/ai", async (req, res) => {
  const { message, images = [], version = "1.2 Fast", sessionId } = req.body;

  if (!message && images.length === 0) {
    return res.status(400).json({ error: "Message or image required." });
  }

  const tierInfo = nasoroVersions[version];
  if (!tierInfo) return res.status(400).json({ error: "Invalid Nasoro version." });

  if (tierInfo.paid && !isPaidTier(version, sessionId)) {
    return res.status(402).json({
      error: `Payment required for ${version}.`,
      priceTRY: tierInfo.priceTRY,
    });
  }

  try {
    // Gemini API call
    const apiRes = await fetch("https://api.generativeai.google/v1beta2/models/" + tierInfo.model + ":generateMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: { text: message },
        // optional: you could send images as base64 if supported
        // images: images,
        temperature: 0.7,
        candidate_count: 1,
      }),
    });

    const data = await apiRes.json();

    // Gemini returns response in different structure
    const replyText = data?.candidates?.[0]?.content?.[0]?.text || "Gemini did not reply.";

    res.json({ reply: replyText });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gemini API error." });
  }
});

// Endpoint to simulate payment (demo)
app.post("/pay", (req, res) => {
  const { sessionId, tier } = req.body;
  const tierInfo = nasoroVersions[tier];
  if (!tierInfo || !tierInfo.paid) return res.status(400).json({ error: "Invalid paid tier." });

  // For demo, we just give 30 minutes access
  paidAccess[sessionId] = { tier, expires: new Date(Date.now() + 30 * 60 * 1000) };
  res.json({ success: true, expires: paidAccess[sessionId].expires });
});

app.listen(PORT, () => console.log(`Nasoro Gemini server running on port ${PORT}`));
