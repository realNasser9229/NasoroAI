import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;

// ===== Nasoro Tiers / Models =====
const nasoroTiers = {
  "1.2 Fast": { model: "gemini-2.5-flash-lite", price: 0 },
  "1.2 Pro": { model: "gemini-2.5-pro", price: 0 },
  "2 Fast": { model: "gemini-3-flash-preview", price: 49.99 },  // TRY per month
  "2 Pro": { model: "gemini-3-pro-preview", price: 209.99 }     // TRY per month
};

// ===== Simple user DB simulation =====
const users = {
  "user1": { hasPaid: false }, // update this manually / via payment system
  // Add more users here
};

// ===== Helper: Get Gemini model based on version =====
function getNasoroModel(version, userId) {
  const tier = nasoroTiers[version];
  if (!tier) throw new Error("Invalid Nasoro version");

  const user = users[userId] || { hasPaid: false };
  if (tier.price > 0 && !user.hasPaid) {
    throw new Error("This tier requires payment.");
  }

  return tier.model;
}

// ===== Endpoint to handle AI messages =====
app.post("/ai", async (req, res) => {
  try {
    const { message, images = [], version = "1.2 Fast", userId = "user1" } = req.body;

    if (!message && images.length === 0) {
      return res.status(400).json({ error: "Message or image required." });
    }

    // Determine Gemini model
    let model;
    try {
      model = getNasoroModel(version, userId);
    } catch (err) {
      return res.status(403).json({ error: err.message });
    }

    // Combine message + image placeholders
    let inputText = message;
    if (images.length > 0) {
      inputText += "\n\n[User sent " + images.length + " image(s)]";
    }

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateText`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GEMINI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ input: inputText })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({ error: "Gemini API error", details: text });
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content || "Nasoro could not respond.";

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ===== Endpoint to simulate payment =====
app.post("/pay", (req, res) => {
  const { userId = "user1" } = req.body;
  if (!users[userId]) users[userId] = {};
  users[userId].hasPaid = true;
  res.json({ success: true, message: "Payment successful! You can now use paid tiers." });
});

app.listen(PORT, () => {
  console.log(`Nasoro server running on port ${PORT}`);
});
