import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch"; // for OpenAI/Gemini requests
import Stripe from "stripe";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({limit:'10mb'}));
app.use(express.static('public')); // serve index.html

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// USERS & TIER SYSTEM (demo in memory)
let userUsage = {}; 

const nasoroVersions = {
  "1.5": { openai: "gpt-3.5-turbo", gemini: "gemini-2" },
  "2": { openai: "gpt-4o-mini", gemini: "gemini-3" },
  "2.5": { openai: "gpt-4.1-mini", gemini: "gemini-3-pro" },
  "3": { openai: "o3-nano", gemini: "gemini-4" },
  "3.5": { openai: "gpt-5-mini", gemini: "gemini-4-pro" },
  "4": { openai: "gpt-5.2-chat-latest", gemini: "gemini-5" },
  "4.5": { openai: "gpt-5.2-pro", gemini: "gemini-5-pro" }
};

function getUserTier(userId){ 
  return userUsage[userId]?.tier || "3.5"; 
}

// AI ENDPOINT
app.post("/ai", async (req,res)=>{
  const {message, images, userId} = req.body;
  const tier = getUserTier(userId);
  const model = nasoroVersions[tier].openai;

  // construct system prompt
  let prompt = `You are Nasoro AI (${tier}). User sent: "${message}"`;
  if(images?.length) prompt += `\nUser also sent ${images.length} images.`;

  try{
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`
      },
      body:JSON.stringify({
        model,
        messages:[{role:"system",content:prompt},{role:"user",content:message}],
        max_tokens:500
      })
    });
    const aiData = await aiRes.json();
    res.json({reply:aiData.choices?.[0]?.message?.content||"Thinking...",images});
  }catch(err){ res.status(500).json({error:err.message}); }
});

// CREATE STRIPE PAYMENT
app.post("/create-payment-session", async(req,res)=>{
  const {userId,tier}=req.body;
  if(!userId||!tier) return res.status(400).json({error:"Missing userId/tier"});
  const priceMap={"4.5":1999,"4":999};
  const session = await stripe.checkout.sessions.create({
    payment_method_types:['card'],
    line_items:[{
      price_data:{
        currency:'usd',
        product_data:{name:`Nasoro Tier ${tier} Unlock`},
        unit_amount:priceMap[tier]
      },
      quantity:1
    }],
    mode:'payment',
    success_url:`${process.env.FRONTEND_URL}/payment-success?userId=${userId}&tier=${tier}`,
    cancel_url:`${process.env.FRONTEND_URL}/payment-cancel`,
    client_reference_id:userId,
    metadata:{tier}
  });
  res.json({url:session.url});
});

// PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log(`Nasoro server running on port ${PORT}`));
