import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

const FALLBACK_STRATEGIES = [
  "⚠ NETWORK SEVERED. Accessing local tactical cache: Cornering enemies is the most effective elimination method.",
  "⚠ UPLINK OFFLINE. Fallback Advice: Bomb timers are 3 seconds. Use this rhythm to trap opponents.",
  "⚠ SIGNAL LOST. Running heuristic analysis: Don't box yourself in. Always leave an escape route.",
  "⚠ SERVER UNREACHABLE. Local Tip: Power-ups persist until collected. You can leave them for later.",
  "⚠ OFFLINE MODE. Strategy: Chain reactions can clear vast areas but are unpredictable. Maintain distance.",
  "⚠ DISCONNECTED. Backup Protocol: If a Bull charges, side-step immediately. It cannot turn while charging.",
  "⚠ LOCAL DATA: The Shadow Phantom passes through soft walls. Destroy its cover to expose it.",
  "⚠ SYSTEM ALERT: Winged Boots allow you to kick bombs. Use this to send explosives into enemy clusters."
];

export const hasApiKey = (): boolean => {
  return !!process.env.API_KEY;
};

// Initialize client lazily
const getAiClient = () => {
  if (!aiClient && process.env.API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return aiClient;
};

export const askSage = async (question: string, context: string): Promise<string> => {
  const client = getAiClient();
  
  if (!client) {
    // Simulate a brief "processing" delay for realism even in offline mode
    await new Promise(resolve => setTimeout(resolve, 600));
    return FALLBACK_STRATEGIES[Math.floor(Math.random() * FALLBACK_STRATEGIES.length)];
  }

  try {
    const model = client.models;
    const systemInstruction = `
      You are the "Tactical AI", a strategic assistant for the game "Bomber Legends".
      The user is playing a classic bomberman-style arcade game.
      
      Your tone should be:
      - Computer-like, efficient, and slightly retro-futuristic.
      - Helpful and encouraging.
      - Brief (maximum 2-3 sentences).
      
      The user will ask for a hint or strategy.
      The context provided includes their current game status (lives, score, level).
      
      If the user is frustrated, tell them to stay cool and analyze the enemy patterns.
      If the user asks for strategy, give tips about bomb placement, trapping enemies, and conserving power-ups.
    `;

    const response = await model.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Context: ${context}\n\nUser's Question: ${question}`,
      config: {
        systemInstruction: systemInstruction,
        maxOutputTokens: 150,
      }
    });

    return response.text || "No data available.";
  } catch (error) {
    console.error("AI Error:", error);
    // Return a fallback if the API call actually fails despite having a key
    return "⚠ CONNECTION INTERRUPTED. Engaging emergency tactical protocols. Stay sharp.";
  }
};