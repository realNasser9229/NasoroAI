import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch"; 

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const GROQ_KEY = process.env.OPENAI_API_KEY; // Ensure this is your GROQ key in .env

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

const MAX_REQUESTS_PER_HOUR = 150; // Increased for better UX
const RESET_TIME = 60 * 60 * 1000;

/* ============================
   TOKEN OPTIMIZATION UTILS
============================ */
function optimizeMessageForSpecialists(content) {
  const fluff = /^(hello|hi|hey|please|thanks|thank you|can you|could you|help me)\b/gi;
  return content.replace(fluff, "").trim();
}

/* ============================
   MODEL MAPPING (CORRECTED IDs)
============================ */
function getModelID(nasoroModel) {
  switch (nasoroModel) {
    // 1. FAST MODELS
    case "nasoro-2-fast":      
      return "llama-3.1-8b-instant";
    
    // 2. LOGIC MODELS (Updated to Llama 3.3)
    case "nasoro-2":           
      return "llama-3.3-70b-versatile"; 
    case "nasoro-2-pro":       
      return "llama-3.3-70b-specdec"; // Fast inference for heavy logic
    
    // 3. ROLEPLAY MODEL (New Frontend Key)
    case "nasoro-3-chat":      
    case "nasoro-2-chat":      
      return "llama-3.3-70b-versatile"; // Best for creative writing
    
    // 4. CODER MODEL
    case "nasoro-2-coder":     
      // Llama 3.3 70B is currently more stable/smarter than Qwen on Groq free tier
      return "llama-3.3-70b-versatile"; 
    
    // 5. SCIENTIST MODEL
    case "nasoro-2-scientist": 
      // DeepSeek is great, but fallback to Llama 3.1 70B if it fails (using Llama here for stability)
      return "llama-3.1-70b-versatile"; 
      
    // 6. IMAGE (Text Gen for Pollinations)
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
  const { message, images, model, customPersona } = req.body;
  const userId = getUserId(req);
  const session = getSession(userId);

  // ---- Rate Limit ----
  if (Date.now() - session.lastReset > RESET_TIME) {
    session.requests = 0;
    session.lastReset = Date.now();
  }
  if (session.requests >= MAX_REQUESTS_PER_HOUR) {
    return res.status(429).json({ reply: "Rate limit hit. Nasoro needs a break." });
  }
  session.requests++;

  try {
    let targetModel = getModelID(model);
    
    // --- SYSTEM PROMPT ENGINEERING ---
    let baseSystem = "You are Nasoro, a chill and highly intelligent AI by OpenOro™. ";
    if (customPersona && customPersona.trim() !== "") {
      baseSystem += ` [PERSONALITY OVERRIDE: ${customPersona}] `;
    } else {
      baseSystem += "Be concise, helpful, and use a slight casual tone. ";
    }

    let systemInstruction = baseSystem;
    let temperature = 0.6;
    let maxTokens = 2048;

    // --- SPECIALIST BEHAVIORS ---
    
    // 1. Roleplay (Chat)
    if (model === "nasoro-3-chat" || model === "nasoro-2-chat") {
      systemInstruction = `${baseSystem} You are in UNFILTERED Roleplay Mode. 
      Fully embody the persona. Do not lecture. Use *actions* for movements. 
      If no persona is given, act as a witty companion.`;
      temperature = 0.85; // Higher creativity
    } 
    
    // 2. Coder
    else if (model === "nasoro-2-coder") {
      systemInstruction = `You are Nasoro Coder. 
      1. Provide ONLY the code unless explanation is requested. 
      2. Always use modern ES6+ Javascript or Python 3.10+. 
      3. Wrap code in markdown blocks.`;
      temperature = 0.1; // Low temp for precision
    } 
    
    // 3. Scientist (Researcher)
    else if (model === "nasoro-2-scientist") {
      systemInstruction = `You are Nasoro Scientist (PhD Researcher).
      Format: Use Headers, Bullet Points, and clean markdown.
      Methodology:
      1. Analyze the user's query for facts.
      2. If asking for recent events (2024-2025), acknowledge your knowledge cutoff but provide the most probable logical outcome or static data.
      3. Think step-by-step before answering.`;
      temperature = 0.3; 
    } 
    
    // 4. Image Generation Logic
    else if (model === "nasoro-2-image") {
      systemInstruction = `You are the Oro Image Engine.
      User request: "${message}"
      Task: Convert this into a detailed Stable Diffusion prompt.
      Output format: ONLY return the raw Pollinations URL below.
      
      URL Pattern: 
      ![Image](https://image.pollinations.ai/prompt/{PROMPT}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random()*10000)})
      
      Replace {PROMPT} with your enhanced English description (use %20 for spaces).`;
      temperature = 1.0;
    }

    // --- VISION (IMAGE INPUT) ---
    if (images?.length > 0) {
      targetModel = "llama-3.2-11b-vision-preview"; // The only Vision model on Groq
      systemInstruction += " The user has attached an image. Analyze it thoroughly.";
    }

    // --- HISTORY MANAGEMENT ---
    let historyLimit = 20;
    if (model === "nasoro-2-pro") historyLimit = 10; // Keep heavy models light on context
    
    let processedHistory = session.history.slice(-historyLimit);

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
      messages.push({ role: "user", content: message });
    }

    // --- GROQ API CALL ---
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: targetModel,
        messages,
        max_tokens: maxTokens,
        temperature: temperature,
        top_p: 1,
        stream: false // We are simulating stream in frontend, so false here for simplicity
      })
    });

    const data = await groqResponse.json();
    
    if(data.error) {
       console.error("Groq API Error:", data.error);
       // Fallback to small model if large model fails
       if(data.error.code === 'model_not_found' || data.error.code === 'rate_limit_exceeded') {
          return res.json({ reply: "⚠️ Server busy (Rate Limit). Trying lighter model...", model_fallback: true });
       }
       return res.status(500).json({ reply: "Engine Error: " + data.error.message });
    }

    const aiReply = data.choices?.[0]?.message?.content || "No reply generated.";

    // Save history (only text)
    if(images.length === 0) {
        session.history.push({ role: "user", content: message });
        session.history.push({ role: "assistant", content: aiReply });
    }

    res.json({ reply: aiReply });

  } catch (err) {
    console.error("BACKEND FATAL:", err);
    res.status(500).json({ reply: "Connection failed. Please restart the backend." });
  }
});

app.get("/", (req, res) => res.send("Nasoro V3 Backend is Active."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nasoro V3 Server running on port ${PORT}`));
        
