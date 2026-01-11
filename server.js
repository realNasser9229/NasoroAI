import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ============================
   USER SESSIONS (PER USER)
============================ */
const userSessions = new Map();

function getUserId(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.headers["x-user-id"] ||
    req.socket.remoteAddress
  );
}

function getSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      history: [],
      requests: 0,
      lastReset: Date.now()
    });
  }
  return userSessions.get(userId);
}

/* ============================
   RATE LIMITS
============================ */
const MAX_REQUESTS_PER_HOUR = 40;
const RESET_TIME = 60 * 60 * 1000;

/* ============================
   MODEL MAPPING
============================ */
function getModelID(nasoroModel) {
  switch (nasoroModel) {
    case "nasoro-2-fast":
      return "gpt-4o-mini";
    case "nasoro-2":
      return "gpt-4o-mini";
    case "nasoro-2-pro":
      return "gpt-4o";
    case "nasoro-2-chat":
      return "gpt-3.5-turbo-16k";
    default:
      return "gpt-4o-mini";
  }
}

/* ============================
   MAIN AI ROUTE
============================ */
app.post("/ai", async (req, res) => {
  const { message, images, model } = req.body;

  const userId = getUserId(req);
  const session = getSession(userId);

  // ---- rate limit reset ----
  if (Date.now() - session.lastReset > RESET_TIME) {
    session.requests = 0;
    session.lastReset = Date.now();
  }

  if (session.requests >= MAX_REQUESTS_PER_HOUR) {
    return res.status(429).json({
      reply: "Rate limit hit. Take a breather and come back soon."
    });
  }

  session.requests++;

  try {
    let targetModel = getModelID(model);

    /* ============================
       SYSTEM PROMPTS
    ============================ */
    let systemInstruction =
      "You are Nasoro, a chill multimodal AI created by Nas9229alt. Be helpful, smart, creative, and clear.";

    if (model === "nasoro-2-chat") {
      systemInstruction = `You are Nasoro 2 Chat, a master of roleplay.
Stay in character at all times.
Use *asterisks* for actions.
Never break character.`;
    }

    // images need vision model
    if (images?.length > 0) {
      targetModel = "gpt-4o";
    }

    /* ============================
       BUILD MESSAGE STACK
    ============================ */
    const messages = [
      { role: "system", content: systemInstruction },
      ...session.history.slice(-40)
    ];

    const userContent = [];

    if (message) {
      userContent.push({ type: "text", text: message });
    }

    if (images?.length > 0) {
      images.forEach((img) =>
        userContent.push({
          type: "image_url",
          image_url: { url: img }
        })
      );
    }

    messages.push({ role: "user", content: userContent });

    /* ============================
       OPENAI REQUEST
    ============================ */
    const response = await openai.chat.completions.create({
      model: targetModel,
      messages,
      max_tokens: 1600
    });

    const aiReply = response.choices[0].message.content;

    /* ============================
       SAVE MEMORY (PER USER)
    ============================ */
    session.history.push({
      role: "user",
      content: message || "[Sent Image]"
    });

    session.history.push({
      role: "assistant",
      content: aiReply
    });

    if (session.history.length > 40) {
      session.history.splice(0, session.history.length - 40);
    }

    res.json({ reply: aiReply });

  } catch (err) {
    console.error("NASORO BACKEND ERROR:", err);
    res.status(500).json({
      reply: "Connection lost. Try again in a moment."
    });
  }
});

/* ============================
   HEALTH CHECK
============================ */
app.get("/", (req, res) => {
  res.send("Nasoro backend is alive.");
});

/* ============================
   SERVER START
============================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Nasoro Backend Live on port ${PORT}`)
);
