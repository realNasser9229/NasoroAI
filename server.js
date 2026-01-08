import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" })); // handle large image payloads

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Map Nasoro versions to OpenAI models
const nasoroVersions = {
  "1.5": "gpt-3.5-turbo",
  "2": "gpt-4o-mini",
  "2.5": "gpt-4.1-mini",
  "3": "gpt-5-mini",
  "4": "gpt-5.2-chat-latest", // LIMITED
  "4.5": "gpt-5.2-pro", // PAID
};

// Example placeholder for user payments (future integration)
const userCredits = {}; // { userId: credits }

app.get("/", (req, res) => {
  res.send("Nasoro AI server running.");
});

// Core chat endpoint
app.post("/ai", async (req, res) => {
  const { message, images, version = "1.5", userId } = req.body;

  // Check credits for paid versions
  if (version === "4.5" && (!userCredits[userId] || userCredits[userId] <= 0)) {
    return res.json({ reply: "You need credits to access Nasoro 4.5." });
  }

  const model = nasoroVersions[version];
  if (!model) {
    return res.json({ reply: "Invalid Nasoro version." });
  }

  try {
    // Combine message + image info
    let fullPrompt = message;
    if (images && images.length > 0) {
      fullPrompt += "\n\nUser uploaded images (base64 data hidden in server).";
    }

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "You are Nasoro AI, helpful and polite.",
        },
        {
          role: "user",
          content: fullPrompt,
        },
      ],
    });

    // Deduct 1 credit for paid version
    if (version === "4.5") userCredits[userId]--;

    res.json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.error("OpenAI error:", err.message);
    res.json({ reply: "Server encountered an error. Try again later." });
  }
});

// Placeholder payment endpoint
app.post("/pay", (req, res) => {
  const { userId, amount } = req.body;
  if (!userCredits[userId]) userCredits[userId] = 0;
  userCredits[userId] += amount; // amount in credits
  res.json({ success: true, credits: userCredits[userId] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nasoro server running on port ${PORT}`));
