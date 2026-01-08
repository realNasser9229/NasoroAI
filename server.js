import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch"; // Node 22 ESM import

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public")); // serve your index.html from /public

// Environment variable for OpenAI API Key
const OPENAI_KEY = process.env.OPENAI_KEY;
if(!OPENAI_KEY) console.error("Warning: OPENAI_KEY not set!");

// Chat endpoint
app.post("/ai", async (req, res) => {
  const { message, images, tier } = req.body;

  if(!message) return res.json({ reply: "No message received." });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are Nasoro AI. Prefix all messages with Oro." },
          { role: "user", content: message }
        ],
        max_tokens: 500
      })
    });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "No reply.";
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.json({ reply: "Error connecting to AI backend." });
  }
});

// Optional Stripe payment endpoint (if you use paid tiers)
app.post("/create-checkout", (req, res) => {
  const { tier } = req.body;
  // Fake response for now, or integrate Stripe if needed
  res.json({ url: "" });
});

// Start server
app.listen(PORT, () => console.log(`Nasoro AI server running on port ${PORT}`));
