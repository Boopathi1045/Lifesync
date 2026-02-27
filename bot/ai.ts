import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const geminiApiKey = process.env.GEMINI_API_KEY;
const openRouterApiKey = process.env.OPENROUTER_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
}

// Define the schema for the AI's response so it always returns structured data
const intentSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        intent: {
            type: SchemaType.STRING,
            description: "The identified user intent. Examples: ADD_INCOME, ADD_EXPENSE, ADD_TRANSFER, DELETE_TRANSACTION, LIST_TRANSACTIONS, GET_FINANCE_OVERVIEW, LIST_ACCOUNTS, ADD_ACCOUNT, DELETE_ACCOUNT, MODIFY_BALANCE, ADD_REMINDER, EDIT_REMINDER, DELETE_REMINDER, LIST_REMINDERS, ADD_WATCH_LATER, ADD_PASSWORD, ADD_WATER, SET_WAKEUP, SET_SLEEP, UPDATE_HABIT_COUNT, VIEW_HABIT_COUNT, ADD_SUB, LIST_SUBS, DELETE_SUB, ADD_FRIEND, ADD_SPLIT, VIEW_SPLITS, UNKNOWN",
            nullable: false,
        },
        actionId: {
            type: SchemaType.STRING,
            description: "If the user wants to delete or edit something specific (e.g., 'delete the rent reminder', 'edit the first transaction'), extract an identifier or keyword to help find it."
        },
        transaction: {
            type: SchemaType.OBJECT,
            description: "Details for finance transaction intents (income, expense, transfer, delete)",
            properties: {
                amount: { type: SchemaType.NUMBER, description: "The amount of money" },
                purpose: { type: SchemaType.STRING, description: "What the money was for" },
                accountHint: { type: SchemaType.STRING, description: "Name of the account used (e.g., cash, bank). Optional if not mentioned." },
                toAccountHint: { type: SchemaType.STRING, description: "For transfers, the destination account." }
            }
        },
        account: {
            type: SchemaType.OBJECT,
            description: "Details for account intents (add, delete, modify)",
            properties: {
                name: { type: SchemaType.STRING, description: "Account name" },
                balance: { type: SchemaType.NUMBER, description: "Account balance" },
                type: { type: SchemaType.STRING, description: "Account type (e.g., bank, wallet, cash)" }
            }
        },
        reminder: {
            type: SchemaType.OBJECT,
            description: "Details for reminder intents",
            properties: {
                title: { type: SchemaType.STRING, description: "Task or reminder title" },
                dateStr: { type: SchemaType.STRING, description: "ISO Date string or a relative date/time like 'tomorrow at 5pm'" },
                newTitle: { type: SchemaType.STRING, description: "For edits: The new title" },
                newDateStr: { type: SchemaType.STRING, description: "For edits: The new date" }
            }
        },
        watchLater: {
            type: SchemaType.OBJECT,
            description: "Details for watch later intents",
            properties: {
                url: { type: SchemaType.STRING, description: "The URL link to save (if provided)" },
                title: { type: SchemaType.STRING, description: "An optional custom title or context mentioned" }
            }
        },
        password: {
            type: SchemaType.OBJECT,
            description: "Details for passwords",
            properties: {
                service: { type: SchemaType.STRING, description: "The platform or service name" },
                username: { type: SchemaType.STRING, description: "The username or email" },
                password: { type: SchemaType.STRING, description: "The password itself" }
            }
        },
        habit: {
            type: SchemaType.OBJECT,
            description: "Details for habits routines (water, sleep, custom counts)",
            properties: {
                glasses: { type: SchemaType.NUMBER, description: "Number of glasses of water" },
                time: { type: SchemaType.STRING, description: "Time in HH:MM format (24 hour)" },
                count: { type: SchemaType.NUMBER, description: "General count to add/update for a habit" }
            }
        },
        subscription: {
            type: SchemaType.OBJECT,
            description: "Details for subscriptions",
            properties: {
                name: { type: SchemaType.STRING, description: "Subscription name" },
                amount: { type: SchemaType.NUMBER, description: "Subscription cost" },
                frequency: { type: SchemaType.STRING, description: "Frequency (e.g., 1 MONTH, 1 YEAR)" }
            }
        },
        split: {
            type: SchemaType.OBJECT,
            description: "Details for friends and splits",
            properties: {
                friendName: { type: SchemaType.STRING, description: "Name of the friend" },
                amount: { type: SchemaType.NUMBER, description: "Amount owed or split" },
                description: { type: SchemaType.STRING, description: "What the split was for" }
            }
        },
        replyText: {
            type: SchemaType.STRING,
            description: "A conversational reply to send back to the user based on their intent."
        }
    },
    required: ["intent"]
};

const systemInstruction = `
You are LifeSync Bot, an AI assistant for a personal dashboard app.
Your job is to parse the user's input (text or transcribed voice) and determine their intent.
The user's local timezone is IST (UTC+5:30). The current time is ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}.

Identify the intent and extract relevant parameters into the JSON structure.
Use the conversation history context to resolve references like "delete the first one" or "edit that transaction".
If the input contains a URL and nothing else, it's ADD_WATCH_LATER.
Always respond in the structured JSON format exactly as requested.
`;

export type ChatTurn = {
    role: "user" | "model";
    parts: { text: string }[];
};

async function callOpenRouterFallback(prompt: string, history: ChatTurn[] = [], base64Audio?: string): Promise<any> {
    if (!openRouterApiKey) {
        throw new Error("OPENROUTER_API_KEY is not configured.");
    }

    const messages: any[] = [
        {
            role: "system",
            content: `${systemInstruction}\n\nIMPORTANT: You MUST respond ONLY with a valid JSON object matching the requested schema. No other text.`
        }
    ];

    // Add history mapping structure to open router format
    for (const turn of history) {
        messages.push({
            role: turn.role === "model" ? "assistant" : "user",
            content: turn.parts[0]?.text || ""
        });
    }

    // Add current user prompt
    if (base64Audio) {
        console.log("Adding audio data to OpenRouter fallback payload...");
        messages.push({
            role: "user",
            content: [
                {
                    type: "text",
                    text: prompt
                },
                {
                    // OpenRouter maps image_url with an audio data URI to the native multimodal audio block
                    type: "image_url",
                    image_url: {
                        url: `data:audio/ogg;base64,${base64Audio}`
                    }
                }
            ]
        });
    } else {
        messages.push({
            role: "user",
            content: prompt
        });
    }

    const payload = {
        // Using google/gemini-1.5-flash as the most consistent backup model that supports audio natively
        model: "google/gemini-1.5-flash",
        messages: messages,
        response_format: { type: "json_object" }
    };

    try {
        console.log("Calling OpenRouter fallback...");
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', payload, {
            headers: {
                'Authorization': `Bearer ${openRouterApiKey}`,
                'HTTP-Referer': 'https://lifesync.app', // Required by OpenRouter
                'X-Title': 'LifeSync Bot', // Required by OpenRouter
                'Content-Type': 'application/json'
            }
        });

        const responseText = response.data.choices[0].message.content;
        return JSON.parse(responseText);
    } catch (error: any) {
        console.error("OpenRouter API Error:", error?.response?.data || error.message);
        return { intent: "UNKNOWN", replyText: "Sorry, I am currently facing network issues on both my primary and backup servers." };
    }
}

export async function parseIntentFromText(text: string, history: ChatTurn[] = []) {
    if (genAI) {
        try {
            console.log("Attempting Gemini API for text processing...");
            const model = genAI.getGenerativeModel({
                model: "gemini-3-flash-preview",
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: intentSchema,
                },
                systemInstruction: systemInstruction,
            });

            // Pass history + current message
            const contents: any[] = [...history, { role: "user", parts: [{ text }] }];

            const result = await model.generateContent({ contents });
            const responseText = result.response.text();
            return JSON.parse(responseText);
        } catch (error: any) {
            console.warn("Gemini API Error (Text):", error.message);
            console.log("Falling back to OpenRouter...");
            return await callOpenRouterFallback(text, history);
        }
    } else {
        console.log("Gemini API key not found. Proceeding with OpenRouter directly.");
        return await callOpenRouterFallback(text, history);
    }
}

// Function to convert telegram OGG voice to base64
async function getAudioBase64(fileUrl: string): Promise<string> {
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    return Buffer.from(response.data).toString('base64');
}

export async function parseIntentFromAudio(fileUrl: string, history: ChatTurn[] = []) {
    const base64Audio = await getAudioBase64(fileUrl);

    if (genAI) {
        try {
            console.log("Attempting Gemini API for audio processing...");
            const model = genAI.getGenerativeModel({
                model: "gemini-3-flash-preview",
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: intentSchema,
                },
                systemInstruction: systemInstruction,
            });

            const currentContent = {
                role: "user",
                parts: [
                    { inlineData: { mimeType: "audio/ogg", data: base64Audio } },
                    { text: "Please process this voice message." }
                ]
            };

            const contents: any[] = [...history, currentContent];

            const result = await model.generateContent({ contents });
            const responseText = result.response.text();
            return JSON.parse(responseText);
        } catch (error: any) {
            console.warn("Gemini API Error (Audio):", error.message);
            console.log("Falling back to OpenRouter...");
            return await callOpenRouterFallback("Please process this voice message.", history, base64Audio);
        }
    } else {
        console.log("Gemini API key not found. Proceeding with OpenRouter directly.");
        return await callOpenRouterFallback("Please process this voice message.", history, base64Audio);
    }
}
