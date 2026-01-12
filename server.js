import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch"; 

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const GROQ_KEY = process.env.OPENAI_API_KEY; 

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

const MAX_REQUESTS_PER_HOUR = 60; // Slightly increased for Pro usage
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
      return "llama-3.3-70b-versatile"; // Flagship
    case "nasoro-2-chat":     
      return "llama3-70b-8192";
      
    // --- NEW SPECIALIST MODELS ---
    case "nasoro-2-coder":
      // Using Qwen 2.5 32B (Alibaba) - Best for Code
      return "qwen-2.5-32b"; 
      
    case "nasoro-2-scientist":
      // Mapped to DeepSeek R1 (Reasoning) or Llama 3.3. 
      // Note: "gpt-oss-120b" is not a valid Groq ID, using best alternative.
      return "deepseek-r1-distill-llama-70b"; 
      
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
    let systemInstruction = "You are Nasoro, a chill AI by OpenOro™ (Nas9229alt/RazNas). Be helpful and smart.";

    // Custom System Prompts
    if (model === "nasoro-2-chat") {
      systemInstruction = `You are Nasoro 2 Chat. Stay in character always. Use *asterisks* for actions.`;
    } else if (model === "nasoro-2-coder") {
      systemInstruction = `You are Nasoro Coder. You are an expert Software Engineer. Provide clean, optimized code. Explain logic briefly.`;
    } else if (model === "nasoro-2-scientist") {
      systemInstruction = `You are Nasoro Scientist. You are a PhD-level researcher. Focus on facts, scientific method, and deep analysis.`;
    }

    // Vision Switch (Overrides textual models if image is present)
    if (images?.length > 0) {
      targetModel = "llama-3.2-11b-vision-preview";
      // Vision works best with standard prompt
      if(model === "nasoro-2-coder") systemInstruction += " Analyze the code/diagram in this image.";
    }

    /* ============================
       HISTORY LIMITS (The Update)
    ============================ */
    // Default limit
    let historyLimit = 40;
    
    // Strict limit for Pro and Scientist to save resources/tokens
    if (model === "nasoro-2-pro" || model === "nasoro-2-scientist") {
      historyLimit = 15;
    }

    /* ============================
       MESSAGE CONSTRUCTION
    ============================ */
    // 1. System Prompt
    const messages = [
      { role: "system", content: systemInstruction },
      ...session.history.slice(-historyLimit) // Apply the limit
    ];

    // 2. User Message (Handle Text + Vision)
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
        max_tokens: model === "nasoro-2-coder" ? 2048 : 1600, // Give coder more room
        temperature: model === "nasoro-2-scientist" ? 0.5 : 0.7 // Scientist needs to be more precise
      })
    });

    const data = await groqResponse.json();
    
    // Debugging if needed
    if(data.error) {
       console.error("Groq Error:", data.error);
       return res.status(500).json({ reply: "Model Error: " + data.error.message });
    }

    const aiReply = data.choices?.[0]?.message?.content || "No reply generated.";

    /* ============================
       SAVE MEMORY
    ============================ */
    // Save simpler version for history (no base64 images to save RAM)
    session.history.push({ role: "user", content: message || "[Image Sent]" });
    session.history.push({ role: "assistant", content: aiReply });

    // Enforce history limit in memory
    if (session.history.length > 40) {
      session.history.splice(0, session.history.length - 40);
    }

    res.json({ reply: aiReply });

  } catch (err) {
    console.error("NASORO BACKEND ERROR:", err);
    res.status(500).json({ reply: "Connection lost. Try again." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nasoro Backend Live on port ${PORT}`));
         
