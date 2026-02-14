import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch"; 
import fs from "fs";
import path from "path";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import hpp from "hpp";

dotenv.config();

// --- PERSISTENCE CONFIG (Render-friendly) ---
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || "./data";

// Create the folder if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`📁 Created data directory at: ${DATA_DIR}`);
    } catch (err) {
        console.error("⚠️ Could not create data dir (might exist):", err);
    }
}

const BLACKLIST_FILE = path.join(DATA_DIR, "blacklist.txt");
const ACCESS_LOG = path.join(DATA_DIR, "access_logs.txt");

// Load Banned IPs into memory
let BANNED_IPS = new Set();
if (fs.existsSync(BLACKLIST_FILE)) {
    const fileContent = fs.readFileSync(BLACKLIST_FILE, "utf-8");
    BANNED_IPS = new Set(fileContent.split("\n").filter(line => line.trim() !== ""));
    console.log(`🛡️ Guardian loaded ${BANNED_IPS.size} banned IPs from ${BLACKLIST_FILE}`);
} else {
    fs.writeFileSync(BLACKLIST_FILE, ""); 
}

const app = express();

/* ============================
   LEVEL 1: GLOBAL ARMOR
============================ */
app.use(helmet()); 
app.use(hpp()); 
app.use(cors()); 
app.use(express.json({ limit: "50mb" })); 

const GROQ_KEY = process.env.OPENAI_API_KEY; 

// Track traffic for DDoS detection
const userTraffic = new Map();

/* ============================
   LEVEL 2: THE GUARDIAN (Middleware)
============================ */
const guardian = (req, res, next) => {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.headers["x-user-id"] || req.socket.remoteAddress;
    const now = Date.now();

    if (BANNED_IPS.has(ip)) {
        return res.status(403).json({ reply: "🚫 [SECURITY] Your IP is permanently banned from Nasoro Network." });
    }

    const logEntry = `[${new Date().toISOString()}] ${ip} | ${req.method} ${req.url}\n`;
    fs.appendFile(ACCESS_LOG, logEntry, (err) => { if(err) console.error(err); });

    const payloadStr = JSON.stringify(req.body);
    const dangerPatterns = /(<script|DROP TABLE|UNION SELECT|process\.env|eval\(|document\.cookie)/gi;
    if (dangerPatterns.test(payloadStr)) {
        return banUser(ip, "Malicious Payload Injection", res);
    }

    if (!userTraffic.has(ip)) userTraffic.set(ip, []);
    const history = userTraffic.get(ip);
    history.push(now);
    const recent = history.filter(ts => now - ts < 10000); 
    userTraffic.set(ip, recent);
    if (recent.length > 20) {
        return banUser(ip, "DDoS / Rapid Request Spam", res);
    }

    next();
};

function banUser(ip, reason, res) {
    if (!BANNED_IPS.has(ip)) {
        BANNED_IPS.add(ip);
        fs.appendFileSync(BLACKLIST_FILE, ip + "\n");
        console.log(`🔥 [AUTO-BAN] IP: ${ip} | Reason: ${reason}`);
    }
    return res.status(403).json({ reply: `🚨 SECURITY ALERT: ${reason}. You have been blacklisted.` });
}

/* ============================
   LEVEL 3: RATE LIMITER
============================ */
const spamLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 20, 
    message: { reply: "🧊 **Chill out.** You're typing too fast. Wait a minute." },
    standardHeaders: true,
    legacyHeaders: false,
});

/* ============================
   USER SESSIONS
============================ */
const userSessions = new Map();

function getSession(userId) {
    if (!userSessions.has(userId)) {
        userSessions.set(userId, { history: [], requests: 0, lastReset: Date.now() });
    }
    return userSessions.get(userId);
}

const MAX_REQUESTS_PER_HOUR = 200; 
const RESET_TIME = 60 * 60 * 1000;

/* ============================
   MODEL MAPPING
============================ */
function getModelID(nasoroModel) {
  switch (nasoroModel) {
    case "nasoro-3-fast":      return "llama-3.1-8b-instant";
    case "nasoro-3":           return "llama-3.3-70b-versatile"; 
    case "nasoro-3-pro":       return "llama-3.3-70b-specdec"; 
    case "nasoro-3-chat":      return "llama-3.3-70b-versatile"; 
    case "nasoro-3-coder":     return "llama-3.3-70b-versatile"; 
    case "nasoro-3-scientist": return "llama-3.1-70b-versatile"; 
    case "nasoro-3-image":     return "llama-3.1-8b-instant";
    default:                   return "llama-3.1-8b-instant"; 
  }
}

/* ============================
   MAIN ROUTE
============================ */
const PRODUCTION_API = "https://nasoronew.onrender.com"; // <-- updated from Railway

app.post("/chat", guardian, spamLimiter, async (req, res) => {
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
    
    let baseSystem = "You are Nasoro (AI), a chill and highly intelligent AI by OpenOro™, created by RazNas. Be professional.";
    
    if (customPersona && customPersona.trim() !== "") {
      baseSystem += ` [PERSONALITY OVERRIDE: ${customPersona}] `;
    } else {
      baseSystem += "Be up-to-date, concise and act cool. Use casual slang. Never hallucinate. ";
    }

    let systemInstruction = baseSystem;
    let temperature = 0.6;

    if (model === "nasoro-3-chat") {
      systemInstruction = `${baseSystem} MODE: UNFILTERED ROLEPLAY. Act human.`;
      temperature = 0.85;
    } else if (model === "nasoro-3-coder") {
      systemInstruction = "You are Nasoro Coder. High-quality code only. No yapping.";
      temperature = 0.1; 
    } else if (model === "nasoro-3-scientist") {
      systemInstruction = "You are Nasoro Scientist (PhD). Analyze facts deeply.";
      temperature = 0.3; 
    } else if (model === "nasoro-3-image") {
       systemInstruction = `You are Nasoro Image Engine.
       Output ONLY this URL format:
       ![Image](https://image.pollinations.ai/prompt/{PROMPT}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random()*99999)})
       Replace {PROMPT} with English description.`;
       temperature = 1.0;
    }

    if (images?.length > 0) {
      targetModel = "llama-3.2-11b-vision-preview"; 
      systemInstruction += " Analyze the attached image thoroughly.";
    }

    let historyLimit = 20;
    if (model === "nasoro-3-pro") historyLimit = 10;
    
    const messages = [
      { role: "system", content: systemInstruction },
      ...session.history.slice(-historyLimit)
    ];

    if (images?.length > 0) {
      const contentArray = [];
      if (message) contentArray.push({ type: "text", text: message });
      images.forEach(img => contentArray.push({ type: "image_url", image_url: { url: img } }));
      messages.push({ role: "user", content: contentArray });
    } else {
      messages.push({ role: "user", content: message });
    }

    // --- Updated PRODUCTION API call ---
    const groqResponse = await fetch(`${PRODUCTION_API}/api`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: targetModel,
        messages,
        max_tokens: 2048,
        temperature: temperature
      })
    });

    const data = await groqResponse.json();
    
    if(data.error) {
       console.error("Groq API Error:", data.error);
       return res.status(500).json({ reply: "Engine Error: " + data.error.message });
    }

    const aiReply = data.choices?.[0]?.message?.content || "No reply generated.";

    if(images.length === 0) {
        session.history.push({ role: "user", content: message });
        session.history.push({ role: "assistant", content: aiReply });
    }

    res.json({ reply: aiReply });

  } catch (err) {
    console.error("FATAL ERROR:", err);
    res.status(500).json({ reply: "Connection failed. Backend needs restart." });
  }
});

/* ============================
   ADMIN TOOLS
============================ */
app.get("/admin/clear-bans", (req, res) => {
    if (req.query.key !== process.env.ADMIN_KEY) return res.status(401).send("Unauthorized");
    fs.writeFileSync(BLACKLIST_FILE, "");
    BANNED_IPS.clear();
    res.send("✅ Blacklist purged.");
});

app.get("/", (req, res) => res.send("Nasoro 3 Neural Fortress is Active."));

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"; // needed for Render
app.listen(PORT, HOST, () => console.log(`Nasoro 3 Server running on ${HOST}:${PORT}`));
