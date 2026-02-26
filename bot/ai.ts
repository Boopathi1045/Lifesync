import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
if (apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
}

// Define the schema for the AI's response so it always returns structured data
const intentSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        intent: {
            type: SchemaType.STRING,
            description: "The identified user intent. Must be one of: ADD_TRANSACTION, ADD_REMINDER, ADD_WATCH_LATER, ADD_PASSWORD, ADD_WATER, SET_WAKEUP, SET_SLEEP, UNKNOWN",
            nullable: false,
        },
        transaction: {
            type: SchemaType.OBJECT,
            description: "Details if intent is ADD_TRANSACTION",
            properties: {
                amount: { type: SchemaType.NUMBER, description: "The amount of money" },
                purpose: { type: SchemaType.STRING, description: "What the money was for" },
                type: { type: SchemaType.STRING, description: "Either 'EXPENSE' or 'INCOME'" },
                accountHint: { type: SchemaType.STRING, description: "Name of the account used (e.g., cash, bank, credit card, hdfc). Optional if not mentioned." }
            }
        },
        reminder: {
            type: SchemaType.OBJECT,
            description: "Details if intent is ADD_REMINDER",
            properties: {
                title: { type: SchemaType.STRING, description: "Task or reminder title" },
                dateStr: { type: SchemaType.STRING, description: "ISO Date string or a relative date/time like 'tomorrow at 5pm'" }
            }
        },
        watchLater: {
            type: SchemaType.OBJECT,
            description: "Details if intent is ADD_WATCH_LATER",
            properties: {
                url: { type: SchemaType.STRING, description: "The URL link to save" }
            }
        },
        password: {
            type: SchemaType.OBJECT,
            description: "Details if intent is ADD_PASSWORD",
            properties: {
                service: { type: SchemaType.STRING, description: "The platform or service name (e.g., Netflix, Gmail)" },
                username: { type: SchemaType.STRING, description: "The username or email" },
                password: { type: SchemaType.STRING, description: "The password itself" }
            }
        },
        habit: {
            type: SchemaType.OBJECT,
            description: "Details if intent is ADD_WATER, SET_WAKEUP, or SET_SLEEP",
            properties: {
                glasses: { type: SchemaType.NUMBER, description: "Number of glasses of water to add" },
                time: { type: SchemaType.STRING, description: "Time in HH:MM format (24 hour)" }
            }
        },
        replyText: {
            type: SchemaType.STRING,
            description: "A conversational reply to send back to the user. For UNKNOWN intents, this should answer their question or ask for clarification. For valid commands, you can leave this blank or provide a short acknowledgment."
        }
    },
    required: ["intent"]
};

const systemInstruction = `
You are LifeSync Bot, an AI assistant for a personal dashboard app.
Your job is to parse the user's input (text or transcribed voice) and determine their intent.
The user's local timezone is IST (UTC+5:30). The current time is ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}.

Identify the intent and extract relevant parameters into the JSON structure.
If the input contains a URL and nothing else, it's ADD_WATCH_LATER.
If the input lists an amount spent/earned, it's ADD_TRANSACTION.
If the input says "remind me to...", it's ADD_REMINDER.
If the user is just chatting or asking a general question, use the UNKNOWN intent and provide a helpful 'replyText'.
Always respond in the structured JSON format exactly as requested.
`;

export async function parseIntentFromText(text: string) {
    if (!genAI) {
        throw new Error("GEMINI_API_KEY is not configured.");
    }

    const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: intentSchema,
        },
        systemInstruction: systemInstruction,
    });

    const result = await model.generateContent(text);
    const responseText = result.response.text();
    return JSON.parse(responseText);
}

// Function to convert telegram OGG voice to base64
async function getAudioBase64(fileUrl: string): Promise<string> {
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    return Buffer.from(response.data).toString('base64');
}

export async function parseIntentFromAudio(fileUrl: string) {
    if (!genAI) {
        throw new Error("GEMINI_API_KEY is not configured.");
    }

    const base64Audio = await getAudioBase64(fileUrl);

    const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: intentSchema,
        },
        systemInstruction: systemInstruction,
    });

    const result = await model.generateContent([
        {
            inlineData: {
                mimeType: "audio/ogg",
                data: base64Audio
            }
        },
        { text: "Please process this voice message." }
    ]);

    const responseText = result.response.text();
    return JSON.parse(responseText);
}
