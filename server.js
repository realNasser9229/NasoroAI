import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ---- API KEYS ----
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MISTRAL_KEY = process.env.MISTRAL_API_KEY;

// ---- MAIN ENDPOINT ----
app.post("/ai", async (req, res) => {
  const { message, provider } = req.body;
  if (!message) return res.json({ reply: "No message sent." });

  try {
    let reply = "No provider response.";

    // -------- OPENAI --------
    if (!provider || provider === "openai") {
      const r = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: message }],
      });
      reply = r.choices[0].message.content;
    }

    // -------- ANTHROPIC --------
    else if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ANTHROPIC_KEY}`,
        },
        body: JSON.stringify({
          model: "claude-v1",
          prompt: message,
          max_tokens_to_sample: 300,
        }),
      });
      const data = await r.json();
      reply = data.completion;
    }

    // -------- MISTRAL --------
    else if (provider === "mistral") {
      const r = await fetch("https://api.mistral.ai/v1/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${MISTRAL_KEY}`,
        },
        body: JSON.stringify({ input: message }),
      });
      const data = await r.json();
      reply = data.output_text || "No reply from Mistral.";
    }

    res.json({ reply });

  } catch (e) {
    console.error(e);
    res.json({ reply: "Server error." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("AI server running on", PORT));
