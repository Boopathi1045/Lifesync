import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai';
import axios from 'axios';

// Accessing the Vite env variable explicitly based on config mapping
const apiKey = process.env.GEMINI_API_KEY || '';
// Fallback logic could be implemented if OpenRouter is provided.
const openRouterApiKey = '';

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
            description: "The identified user intent. Examples: ADD_INCOME, ADD_EXPENSE, ADD_TRANSFER, DELETE_TRANSACTION, LIST_TRANSACTIONS, GET_FINANCE_OVERVIEW, LIST_ACCOUNTS, ADD_ACCOUNT, DELETE_ACCOUNT, MODIFY_BALANCE, ADD_REMINDER, EDIT_REMINDER, DELETE_REMINDER, LIST_REMINDERS, ADD_WATCH_LATER, ADD_PASSWORD, ADD_WATER, SET_WAKEUP, SET_SLEEP, START_NAP, END_NAP, UPDATE_HABIT_COUNT, VIEW_HABIT_COUNT, ADD_SUB, LIST_SUBS, DELETE_SUB, ADD_FRIEND, ADD_SPLIT, VIEW_SPLITS, UNKNOWN",
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
            description: "Details for habits routines (water, sleep, naps, custom counts)",
            properties: {
                glasses: { type: SchemaType.NUMBER, description: "Number of glasses of water" },
                time: { type: SchemaType.STRING, description: "Time in HH:MM format (24 hour)" },
                durationMins: { type: SchemaType.NUMBER, description: "Not used much now, use START_NAP and END_NAP primarily." },
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
You are LifeSync Web AI Assistant, an AI assistant built into a personal dashboard app.
Your job is to parse the user's text input and determine their intent to control the app.
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

export async function parseIntentFromText(text: string, history: ChatTurn[] = []) {
    if (!genAI) {
        return {
            intent: "UNKNOWN",
            replyText: "Gemini API key is not configured in the web environment."
        };
    }

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash", // We recommend 1.5-flash as the standard fast option
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: intentSchema,
            },
            systemInstruction: systemInstruction,
        });

        const contents: any[] = [...history, { role: "user", parts: [{ text }] }];

        const result = await model.generateContent({ contents });
        const responseText = result.response.text();
        return JSON.parse(responseText);
    } catch (error: any) {
        console.error("Gemini API Error (Text):", error.message);
        return {
            intent: "UNKNOWN",
            replyText: "Sorry, I am currently facing network issues connecting to Gemini."
        };
    }
}
