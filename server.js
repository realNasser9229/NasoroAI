import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch"; 

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const OPENAI_KEY = process.env.OPENAI_API_KEY; // Placeholder stays

/* ============================
   USER SESSIONS
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

const MAX_REQUESTS_PER_HOUR = 60; 
const RESET_TIME = 60 * 60 * 1000;

/* ============================
   MODEL MAPPING
============================ */
function getModelID(nasoroModel) {
  switch (nasoroModel) {
    case "nasoro-2-fast":     
      return "llama-3.1-8b-instant";
    case "nasoro-2":          
      return "llama-3.1-70b-versatile";
    case "nasoro-2-pro":      
      return "llama-3.3-70b-versatile"; 
    case "nasoro-2-chat":     
      return "llama3-70b-8192";      
    case "nasoro-2-coder":
      return "qwen3-32b";      
    case "nasoro-2-scientist":
      return "deepseek-r1-distill-llama-70b"; 
    case "nasoro-2-image":
      return "llama-3.1-8b-instant";     
    default:
      return "llama-3.1-8b-instant"; 
  }
}

/* ============================
   MAIN AI ROUTE
============================ */
app.post("/ai", async (req, res) => {
  const { message, images, model } = req.body;
  const userId = getUserId(req);
  const session = getSession(userId);

  if (Date.now() - session.lastReset > RESET_TIME) {
    session.requests = 0;
    session.lastReset = Date.now();
  }

  if (session.requests >= MAX_REQUESTS_PER_HOUR) {
    return res.status(429).json({
      reply: "Rate limit hit. Take a breather."
    });
  }
  session.requests++;

  try {
    let targetModel = getModelID(model);
    let systemInstruction = "You are Nasoro, a chill AI by OpenOro™ (Nas9229alt/RazNas). Be helpful and smart, never hallucinate. Keep replies short, casual slang.";
    let temperature = 0.7;

    if (model === "nasoro-2-chat") {
      systemInstruction = `You are Nasoro 2 Chat. Stay in character always. Use *asterisks* for actions.`;
    } else if (model === "nasoro-2-coder") {
      systemInstruction = `You are Nasoro Coder. You are an expert Software Engineer. Provide clean, optimized code. Explain logic briefly.`;
    } else if (model === "nasoro-2-scientist") {
      systemInstruction = `You are Nasoro Scientist. You are a PhD-level researcher. Focus on facts, scientific method, and deep analysis.`;
      temperature = 0.6;
    } else if (model === "nasoro-2-image") {
      systemInstruction = `You are the Oro 2 Image engine. 
      Your ONLY job is to create a high-quality Markdown image link based on user requests.
      OUTPUT FORMAT: 
      ![Image](https://image.pollinations.ai/prompt/{description}?width=1024&height=1024&nologo=true&seed={random})
      INSTRUCTIONS:
      1. Enhance user text with artistic details.
      2. Replace {description} with URL-encoded text.
      3. Replace {random} with random 5-digit number.
      4. ONLY output the markdown link.`;
      temperature = 1.0;
    }

    if (images?.length > 0) {
      targetModel = "llama-3.2-11b-vision-preview";
      if(model === "nasoro-2-coder") systemInstruction += " Analyze the code/diagram in this image.";
    }

    let historyLimit = 40;
    if (model === "nasoro-2-pro" || model === "nasoro-2-scientist") historyLimit = 15;
    if (model === "nasoro-2-image") historyLimit = 5;

    const messages = [
      { role: "system", content: systemInstruction },
      ...session.history.slice(-historyLimit)
    ];

    if (images?.length > 0) {
      const contentArray = [];
      if (message) contentArray.push({ type: "text", text: message });
      images.forEach(img => {
        contentArray.push({ type: "image_url", image_url: { url: img } });
      });
      messages.push({ role: "user", content: contentArray });
    } else {
      if (message) messages.push({ role: "user", content: message });
    }

    /* ============================
       OPENROUTER API REQUEST
    ============================ */
    const openRouterResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: targetModel,
        messages,
        max_tokens: model === "nasoro-2-coder" ? 2048 : 1600,
        temperature: temperature
      })
    });

    const data = await openRouterResp.json();

    if(data.error) {
       console.error("OpenRouter Error:", data.error);
       return res.status(500).json({ reply: "Model Error: " + data.error.message });
    }

    const aiReply = data.choices?.[0]?.message?.content || "No reply generated.";

    /* ============================
       SAVE MEMORY
    ============================ */
    session.history.push({ role: "user", content: message || "[Image Sent]" });
    session.history.push({ role: "assistant", content: aiReply });

    if (session.history.length > 40) {
      session.history.splice(0, session.history.length - 40);
    }

    res.json({ reply: aiReply });

  } catch (err) {
    console.error("NASORO BACKEND ERROR:", err);
    res.status(500).json({ reply: "Connection lost. Try again." });
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
app.listen(PORT, () => console.log(`Nasoro Backend Live on port ${PORT}`));
