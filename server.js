import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch"; // Groq-compatible HTTP requests

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const GROQ_KEY = process.env.OPENAI_API_KEY; // Keep same variable, just change value in .env

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
    case "nasoro-2-fast":     // Oro 2 Fast
      return "llama-3.1-8b-instant";
    case "nasoro-2":          // Oro 2
      return "llama-3.1-70b-versatile";
    case "nasoro-2-pro":      // Oro 2 Pro
      return "llama-3.3-70b-versatile";
    case "nasoro-2-chat":     // Oro 2 Chat
      return "llama3-70b-8192";
    default:
      return "llama-3.1-8b-instant";   // fallback
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
      "You are Nasoro, a chill multimodal AI created by Nas9229alt A.K.A RazNas (OpenOro™ as RazNas' company). Be helpful, smart, creative, and clear. Keep replies kinda short, never hallucinate and give user verified answers.";

    if (model === "nasoro-2-chat") {
      systemInstruction = `You are Nasoro 2 Chat, a master of roleplay.
Stay in character at all times.
Use *asterisks* for actions.
Never break character, engage with all types of roleplays.`;
    }

    // If images are sent, switch to vision-capable model
    if (images?.length > 0) {
      targetModel = "llama-3.2-11b-vision-preview";
    }

    /* ============================
       BUILD MESSAGE STACK
    ============================ */
    const messages = [
      { role: "system", content: systemInstruction },
      ...session.history.slice(-40)
    ];

    if (message) {
      messages.push({ role: "user", content: message });
    }

    /* ============================
       GROQ API REQUEST
    ============================ */
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: targetModel,
        messages,
        max_tokens: 1600
      })
    });

    const data = await groqResponse.json();
    const aiReply = data.choices?.[0]?.message?.content || "No reply generated.";

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
