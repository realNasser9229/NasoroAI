// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // serve your index.html from /public

// ========== AI Endpoint ==========
app.post("/ai", async (req, res) => {
  const { message, images, tier } = req.body;

  // Mock AI response logic
  console.log(`Message: ${message}`);
  console.log(`Images: ${images?.length || 0}`);
  console.log(`Tier: ${tier}`);

  // Here you can integrate real AI API if you want later
  const reply = `Echo (${tier}): ${message || "(image sent)"}`;

  res.json({ reply });
});

// ========== Payments Endpoint ==========
app.post("/create-checkout", (req, res) => {
  const { tier } = req.body;

  console.log(`Creating checkout for tier: ${tier}`);

  // Mock URL for testing
  const url = "https://example.com/checkout";

  res.json({ url });
});

// Serve index.html fallback (for SPA routing)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`Nasoro backend running at http://localhost:${PORT}`);
});
