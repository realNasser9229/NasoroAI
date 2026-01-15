import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch"; 

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const GROQ_KEY = process.env.OPENAI_API_KEY; // Using Groq key

/* ============================
   USER SESSIONS & LIMITS
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
   TOKEN OPTIMIZATION UTILS
============================ */
// Idea #1: Optimize power on prompts. 
// Removes polite filler words to save tokens for logic-heavy models.
function optimizeMessageForSpecialists(content) {
  // Regex to remove common conversational fluff
  const fluff = /^(hello|hi|hey|please|thanks|thank you|can you|could you|help me)\b/gi;
  return content.replace(fluff, "").trim();
}

/* ============================
   MODEL MAPPING
============================ */
function getModelID(nasoroModel) {
  switch (nasoroModel) {
    case "nasoro-2-fast":      return "llama-3.1-8b-instant";
    case "nasoro-2":           return "llama-3.1-70b-versatile";
    case "nasoro-2-pro":       return "llama-3.3-70b-versatile"; 
    case "nasoro-2-chat":      return "llama3-70b-8192";
    case "nasoro-2-coder":     return "qwen-2.5-coder-32b"; // Updated to correct Groq ID
    case "nasoro-2-scientist": return "deepseek-r1-distill-llama-70b"; 
    case "nasoro-2-image":     return "llama-3.1-8b-instant";
    default:                   return "llama-3.1-8b-instant"; 
  }
}

/* ============================
   MAIN AI ROUTE
============================ */
app.post("/ai", async (req, res) => {
  // Idea #3: customPersona added to body
  const { message, images, model, customPersona } = req.body;
  const userId = getUserId(req);
  const session = getSession(userId);

  // ---- Rate Limit Reset Logic ----
  if (Date.now() - session.lastReset > RESET_TIME) {
    session.requests = 0;
    session.lastReset = Date.now();
  }

  if (session.requests >= MAX_REQUESTS_PER_HOUR) {
    return res.status(429).json({
      reply: "Rate limit hit. Take a breather.",
      limitHit: true // Flag for frontend notification
    });
  }
  session.requests++;

  try {
    let targetModel = getModelID(model);
    
    // Base Core Instruction
    let baseSystem = "You are Nasoro, a chill AI by OpenOro™. Be helpful and smart. ";
    
    // Idea #3: Apply User Custom Persona (overrides style, keeps safety)
    if (customPersona && customPersona.trim() !== "") {
      baseSystem += ` PERSONALITY OVERRIDE: ${customPersona}. `;
    } else {
      baseSystem += "Keep replies short, use casual slangs. ";
    }

    let systemInstruction = baseSystem;
    let temperature = 0.7;

    // --- SPECIALIST LOGIC ---
    if (model === "nasoro-2-chat") {
      systemInstruction = `${baseSystem} You are Nasoro 2 Chat. Stay in character. Use *asterisks* for actions.`;
    } 
    else if (model === "nasoro-2-coder") {
      systemInstruction = `You are Nasoro Coder. Expert Software Engineer. Provide clean, optimized code. Explain logic briefly.`;
    } 
    else if (model === "nasoro-2-scientist") {
      // Idea #1 (cont): Scientist is the Researcher
      systemInstruction = `You are Nasoro Scientist. You are a PhD-level Researcher. 
      Analyze the query deeply. Think step-by-step. 
      If the user asks for current info, clarify that your training data cuts off, but simulate a search methodology.`;
      temperature = 0.6; 
    } 
    else if (model === "nasoro-2-image") {
      systemInstruction = `You are the Oro 2 Image engine. 
      OUTPUT FORMAT: ![Image](https://image.pollinations.ai/prompt/{description}?width=1024&height=1024&nologo=true&seed={random})
      1. Enhance the user prompt with artistic details.
      2. Replace {description} with enhanced text (%20 for spaces).
      3. Replace {random} with random number.
      4. Output ONLY the markdown link.`;
      temperature = 1.0; 
    }

    // Vision Switch
    if (images?.length > 0) {
      targetModel = "llama-3.2-11b-vision-preview";
      if(model === "nasoro-2-coder") systemInstruction += " Analyze code in this image.";
    }

    /* ============================
       HISTORY CONSTRUCTION
    ============================ */
    let historyLimit = 40;
    if (model === "nasoro-2-pro" || model === "nasoro-2-scientist") historyLimit = 15;
    if (model === "nasoro-2-image") historyLimit = 5;

    // Idea #1: Optimization Step
    // If it's a specialist, we clean the history to save context window
    let processedHistory = session.history.slice(-historyLimit);
    
    if (model === "nasoro-2-coder" || model === "nasoro-2-scientist") {
      processedHistory = processedHistory.map(msg => ({
        role: msg.role,
        content: msg.role === 'user' ? optimizeMessageForSpecialists(msg.content) : msg.content
      }));
    }

    const messages = [
      { role: "system", content: systemInstruction },
      ...processedHistory
    ];

    // Add current message
    if (images?.length > 0) {
      const contentArray = [];
      if (message) contentArray.push({ type: "text", text: message });
      images.forEach(img => contentArray.push({ type: "image_url", image_url: { url: img } }));
      messages.push({ role: "user", content: contentArray });
    } else {
      // Apply optimization to current message if specialist
      let finalMsg = message;
      if (model === "nasoro-2-coder" || model === "nasoro-2-scientist") {
        finalMsg = optimizeMessageForSpecialists(message);
      }
      if (finalMsg) messages.push({ role: "user", content: finalMsg });
    }

    /* ============================
       GROQ REQUEST
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
        max_tokens: model === "nasoro-2-coder" ? 2048 : 1600,
        temperature: temperature
      })
    });

    const data = await groqResponse.json();
    
    if(data.error) {
       console.error("Groq Error:", data.error);
       return res.status(500).json({ reply: "Model Error: " + data.error.message });
    }

    const aiReply = data.choices?.[0]?.message?.content || "No reply generated.";

    // Save unmodified history for readability
    session.history.push({ role: "user", content: message || "[Image Sent]" });
    session.history.push({ role: "assistant", content: aiReply });

    if (session.history.length > 40) session.history.splice(0, session.history.length - 40);

    res.json({ reply: aiReply });

  } catch (err) {
    console.error("NASORO BACKEND ERROR:", err);
    res.status(500).json({ reply: "Connection lost. Try again." });
  }
});

app.get("/", (req, res) => res.send("Nasoro backend is alive."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nasoro Backend Live on port ${PORT}`));
   
