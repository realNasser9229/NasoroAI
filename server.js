import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch"; // npm i node-fetch@2
import bodyParser from "body-parser";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "25mb" }));

const PORT = process.env.PORT || 3000;

const NASORO_VERSIONS = {
  // OpenAI Tiers
  "1.5": { provider: "openai", model: "gpt-3.5-turbo" },
  "2": { provider: "openai", model: "gpt-4o-mini" },
  "3.5": { provider: "openai", model: "gpt-5-mini" },
  "4": { provider: "openai", model: "gpt-5.2-chat-latest" },
  "4.5": { provider: "openai", model: "gpt-5.2-pro" },

  // Gemini Tiers
  "G-1": { provider: "gemini", model: "gemini-2.5-flash-lite" },
  "G-2": { provider: "gemini", model: "gemini-2.5-flash" },
  "G-3": { provider: "gemini", model: "gemini-2.5-pro" },
  "G-4": { provider: "gemini", model: "gemini-3-flash-preview" },
  "G-5": { provider: "gemini", model: "gemini-3-pro-preview" }
};

// Helper to call OpenAI chat models
async function callOpenAI(message, model, images = []) {
  const payload = {
    model,
    messages: [{ role: "user", content: message }],
    temperature: 0.7
  };

  if (images.length > 0) {
    payload.messages.push({
      role: "user",
      content: `User uploaded images: ${images.join(", ")}`
    });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "No response from OpenAI.";
}

// Helper to call Gemini models
async function callGemini(message, model, images = []) {
  const payload = {
    model,
    input: message
  };

  if (images.length > 0) {
    payload.input += `\nUser uploaded images: ${images.join(", ")}`;
  }

  const res = await fetch("https://gemini.googleapis.com/v1/models/text:predict", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GEMINI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  return data?.candidates?.[0]?.content?.[0]?.text || "No response from Gemini.";
}

app.post("/ai", async (req, res) => {
  try {
    const { message, version = "1.5", images = [] } = req.body;

    if (!message && images.length === 0) {
      return res.status(400).json({ reply: "Message or images required." });
    }

    const v = NASORO_VERSIONS[version] || NASORO_VERSIONS["1.5"];
    let reply;

    if (v.provider === "openai") {
      reply = await callOpenAI(message, v.model, images);
    } else if (v.provider === "gemini") {
      reply = await callGemini(message, v.model, images);
    } else {
      reply = "No valid provider selected.";
    }

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "Server error. Please try again later." });
  }
});

app.listen(PORT, () => console.log(`Nasoro server running on port ${PORT}`));
