import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const GROQ_KEY = process.env.OPENAI_API_KEY;
if (!GROQ_KEY) console.warn("⚠️ OPENAI_API_KEY not set!");

const userSessions = new Map();
const MAX_REQUESTS_PER_HOUR = 200;
const RESET_TIME = 60 * 60 * 1000;

function getSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, { history: [], requests: 0, lastReset: Date.now() });
  }
  return userSessions.get(userId);
}

function getModelID(nasoroModel) {
  switch (nasoroModel) {
    case "nasoro-3-fast":      return "llama-3.1-8b-instant";
    case "nasoro-3":           return "llama-3.3-70b-versatile"; 
    case "nasoro-3-pro":       return "llama-3.3-70b-specdec"; 
    case "nasoro-3-chat":      return "llama-3.3-70b-versatile"; 
    case "nasoro-3-coder":     return "llama-3.3-70b-versatile"; 
    case "nasoro-3-scientist": return "llama-3.1-70b-versatile"; 
    case "nasoro-3-image":     return "llama-3.1-8b-instant";
    default: return "llama-3.1-8b-instant";
  }
}

app.post("/chat", async (req, res) => {
  const { message, images, model, customPersona } = req.body;
  const userId = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  
  const session = getSession(userId);
  if (Date.now() - session.lastReset > RESET_TIME) {
    session.requests = 0;
    session.lastReset = Date.now();
  }
  if (session.requests >= MAX_REQUESTS_PER_HOUR) {
    return res.status(429).json({ reply: "Daily limit reached. Come back later." });
  }
  session.requests++;

  try {
    let targetModel = getModelID(model);
    let baseSystem = "You are Nasoro (AI), a chill and highly intelligent AI.";

    if (customPersona?.trim()) baseSystem += ` [PERSONALITY OVERRIDE: ${customPersona}]`;
    else baseSystem += " Be concise and act cool.";

    let temperature = 0.6;
    if (model === "nasoro-3-chat") temperature = 0.85;
    if (model === "nasoro-3-coder") temperature = 0.1;
    if (model === "nasoro-3-scientist") temperature = 0.3;
    if (model === "nasoro-3-image") temperature = 1.0;

    const messages = [
      { role: "system", content: baseSystem },
      ...session.history.slice(-20),
      { role: "user", content: message }
    ];

    const apiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: targetModel,
        messages, 
        max_tokens: 2048,
        temperature
      })
    });

    const data = await apiRes.json();
    if (data.error) return res.status(500).json({ reply: "Engine Error: " + data.error.message });

    const aiReply = data.choices?.[0]?.message?.content || "No reply generated.";
    session.history.push({ role: "user", content: message });
    session.history.push({ role: "assistant", content: aiReply });

    res.json({ reply: aiReply });

  } catch (err) {
    console.error("FATAL ERROR:", err);
    res.status(500).json({ reply: "Connection failed. Try again later." });
  }
});

app.get("/", (req, res) => res.send("Nasoro AI Active!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server live on ${PORT}`));
