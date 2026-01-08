import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "25mb" }));

const PORT = process.env.PORT || 3000;

// ---------- NASORO VERSION SETTINGS ----------
const NASORO_VERSIONS = {
  "1.5": { provider: "openai", model: "gpt-3.5-turbo" },
  "2":   { provider: "openai", model: "gpt-4o-mini" },
  // Add more versions here safely later
};

// ---------- HELPER FUNCTIONS ----------

async function callOpenAI(message, model, images = []) {
  const prompt = `You are Nasoro AI. User sent: ${message}. Images: ${images.length}`;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices?.[0]?.message?.content || "No reply from OpenAI";
  } catch (err) {
    console.error("OpenAI Error:", err.message);
    return "OpenAI provider failed. Try again later.";
  }
}

async function callGemini(message, model, images = []) {
  if (!process.env.GEMINI_API_KEY) return "Gemini provider not configured.";
  // Placeholder example, adapt to actual Gemini endpoint
  try {
    const res = await fetch("https://gemini.googleapis.com/v1/models/text:predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GEMINI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        prompt: message,
        images
      }),
    });
    const data = await res.json();
    return data?.prediction || "Gemini replied nothing";
  } catch (err) {
    console.error("Gemini Error:", err.message);
    return "Gemini provider failed. Try again later.";
  }
}

// ---------- ROUTES ----------
app.get("/", (req, res) => res.send("Nasoro AI Server is running."));

app.post("/ai", async (req, res) => {
  const { message, images = [], version = "1.5", provider } = req.body;

  if (!message && images.length === 0) return res.json({ reply: "No input provided." });

  const v = NASORO_VERSIONS[version] || { provider: "openai", model: "gpt-3.5-turbo" };

  let reply = "No reply.";
  try {
    if (v.provider === "openai") {
      reply = await callOpenAI(message, v.model, images);
    } else if (v.provider === "gemini") {
      reply = await callGemini(message, v.model, images);
    } else {
      reply = "Invalid provider.";
    }
  } catch (err) {
    console.error("Server Error:", err.message);
    reply = "Server encountered an error. Try again later.";
  }

  res.json({ reply });
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`Nasoro AI server running on port ${PORT}`);
});
