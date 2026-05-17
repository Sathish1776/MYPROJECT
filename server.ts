/// <reference types="node" />
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Serve LLM Council Sandbox
app.get("/council", (req, res) => {
  res.sendFile(path.join(process.cwd(), "avenora_llm_council.html"));
});

// Initialize Gemini
const apiKey = process.env.GEMINI_API_KEY || "";
const hasValidKey = apiKey && apiKey !== "YOUR_ACTUAL_GEMINI_API_KEY_HERE" && apiKey.trim() !== "";

if (!hasValidKey) {
  console.warn("\n⚠️  [MediVoice Warning]: GEMINI_API_KEY is not set or contains the placeholder in your .env file.");
  console.warn("👉 Please set a valid Gemini API Key from https://aistudio.google.com/ in your .env file to enable AI features.\n");
}

const ai = new GoogleGenAI({
  apiKey: hasValidKey ? apiKey : "TEMPORARY_PLACEHOLDER_KEY",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// AI Assistant Route (NLP + Intents)
app.post("/api/ai/assistant", async (req, res) => {
  try {
    if (!hasValidKey) {
      return res.status(400).json({ 
        text: "Hello! The Gemini AI service is not configured yet. Please create a .env file and add your valid GEMINI_API_KEY to start using the assistant.",
        intent: "error",
        action: "configure_api_key"
      });
    }

    const { message, language, userContext } = req.body;
    
    const systemInstruction = `
      You are MediVoice AI, a smart healthcare assistant.
      Your goal is to help patients manage their medicines.
      Supported languages: English, Tamil.
      You can detect intents like: medicine_taken, medicine_skipped, reminder_request, medicine_query, emergency_help, general_health_query.
      
      User context: ${JSON.stringify(userContext)}
      
      Respond in the requested language (${language}).
      Keep responses brief and helpful for elderly patients.
      If the user says they took their medicine, respond positively.
      If it's an emergency, provide clear immediate advice.
      
      Output JSON format:
      {
        "text": "Your spoken response",
        "intent": "identified_intent",
        "action": "optional_action_to_take"
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: message,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    res.json(JSON.parse(response.text || "{}"));
  } catch (error: any) {
    console.error("AI Assistant Error:", error);
    res.status(500).json({ error: "Failed to process AI request" });
  }
});

// OCR Medicine Scanner Route
app.post("/api/ai/scan-medicine", async (req, res) => {
  try {
    if (!hasValidKey) {
      return res.status(400).json({ 
        error: "Gemini API key is not configured. Please add a valid API key to your .env file." 
      });
    }

    const { image } = req.body; // base64 image
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: image,
          },
        },
        {
          text: "Extract medicine details from this image. Include name, dosage, expiry date, and instructions if visible. Output as JSON.",
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    res.json(JSON.parse(response.text || "{}"));
  } catch (error: any) {
    console.error("OCR Error:", error);
    res.status(500).json({ error: "Failed to scan medicine" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
