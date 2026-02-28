import axios from 'axios';

// Accessing the Vite env variable explicitly based on config mapping
const apiKey = process.env.GEMINI_API_KEY || '';
// Fallback logic could be implemented if OpenRouter is provided.
const openRouterApiKey = process.env.OPENROUTER_API_KEY || '';

const intentSchema = {
    type: "OBJECT",
    properties: {
        intent: {
            type: "STRING",
            description: "The identified user intent. Examples: ADD_INCOME, ADD_EXPENSE, ADD_TRANSFER, DELETE_TRANSACTION, LIST_TRANSACTIONS, GET_FINANCE_OVERVIEW, LIST_ACCOUNTS, ADD_ACCOUNT, DELETE_ACCOUNT, MODIFY_BALANCE, ADD_REMINDER, EDIT_REMINDER, DELETE_REMINDER, LIST_REMINDERS, ADD_WATCH_LATER, ADD_PASSWORD, ADD_WATER, SET_WAKEUP, SET_SLEEP, START_NAP, END_NAP, UPDATE_HABIT_COUNT, VIEW_HABIT_COUNT, ADD_SUB, LIST_SUBS, DELETE_SUB, ADD_FRIEND, ADD_SPLIT, VIEW_SPLITS, UNKNOWN",
        },
        actionId: {
            type: "STRING",
            description: "If the user wants to delete or edit something specific (e.g., 'delete the rent reminder', 'edit the first transaction'), extract an identifier or keyword to help find it."
        },
        transaction: {
            type: "OBJECT",
            description: "Details for finance transaction intents (income, expense, transfer, delete)",
            properties: {
                amount: { type: "NUMBER", description: "The amount of money" },
                purpose: { type: "STRING", description: "What the money was for" },
                accountHint: { type: "STRING", description: "Name of the account used (e.g., cash, bank). Optional if not mentioned." },
                toAccountHint: { type: "STRING", description: "For transfers, the destination account." }
            }
        },
        account: {
            type: "OBJECT",
            description: "Details for account intents (add, delete, modify)",
            properties: {
                name: { type: "STRING", description: "Account name" },
                balance: { type: "NUMBER", description: "Account balance" },
                type: { type: "STRING", description: "Account type (e.g., bank, wallet, cash)" }
            }
        },
        reminder: {
            type: "OBJECT",
            description: "Details for reminder intents",
            properties: {
                title: { type: "STRING", description: "Task or reminder title" },
                dateStr: { type: "STRING", description: "ISO Date string or a relative date/time like 'tomorrow at 5pm'" },
                newTitle: { type: "STRING", description: "For edits: The new title" },
                newDateStr: { type: "STRING", description: "For edits: The new date" }
            }
        },
        watchLater: {
            type: "OBJECT",
            description: "Details for watch later intents",
            properties: {
                url: { type: "STRING", description: "The URL link to save (if provided)" },
                title: { type: "STRING", description: "An optional custom title or context mentioned" }
            }
        },
        password: {
            type: "OBJECT",
            description: "Details for passwords",
            properties: {
                service: { type: "STRING", description: "The platform or service name" },
                username: { type: "STRING", description: "The username or email" },
                password: { type: "STRING", description: "The password itself" }
            }
        },
        habit: {
            type: "OBJECT",
            description: "Details for habits routines (water, sleep, naps, custom counts)",
            properties: {
                glasses: { type: "NUMBER", description: "Number of glasses of water" },
                time: { type: "STRING", description: "Time in HH:MM format (24 hour)" },
                durationMins: { type: "NUMBER", description: "Not used much now, use START_NAP and END_NAP primarily." },
                count: { type: "NUMBER", description: "General count to add/update for a habit" }
            }
        },
        subscription: {
            type: "OBJECT",
            description: "Details for subscriptions",
            properties: {
                name: { type: "STRING", description: "Subscription name" },
                amount: { type: "NUMBER", description: "Subscription cost" },
                frequency: { type: "STRING", description: "Frequency (e.g., 1 MONTH, 1 YEAR)" }
            }
        },
        split: {
            type: "OBJECT",
            description: "Details for friends and splits",
            properties: {
                friendName: { type: "STRING", description: "Name of the friend" },
                amount: { type: "NUMBER", description: "Amount owed or split" },
                description: { type: "STRING", description: "What the split was for" }
            }
        },
        replyText: {
            type: "STRING",
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

async function callOpenRouterFallback(prompt: string, history: ChatTurn[] = []): Promise<any> {
    if (!openRouterApiKey) {
        return {
            intent: "UNKNOWN",
            replyText: "Gemini API failed and OpenRouter fallback key is missing."
        };
    }

    const messages: any[] = [
        {
            role: "system",
            content: `${systemInstruction}\n\nIMPORTANT: You MUST respond ONLY with a valid JSON object matching the requested schema. No other text.`
        }
    ];

    for (const turn of history) {
        messages.push({
            role: turn.role === "model" ? "assistant" : "user",
            content: turn.parts[0]?.text || ""
        });
    }

    messages.push({
        role: "user",
        content: prompt
    });

    const payload = {
        model: "google/gemini-1.5-flash",
        messages: messages,
        response_format: { type: "json_object" }
    };

    try {
        console.log("Calling OpenRouter fallback from web...");
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', payload, {
            headers: {
                'Authorization': `Bearer ${openRouterApiKey}`,
                'HTTP-Referer': 'https://lifesync.app', // Required by OpenRouter
                'X-Title': 'LifeSync Web', // Required by OpenRouter
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
    if (apiKey) {
        try {
            console.log("Calling Gemini directly via REST API from web...");
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

            const contents = history.map(turn => ({
                role: turn.role,
                parts: turn.parts
            })).concat([{ role: 'user', parts: [{ text }] }]);

            const payload = {
                system_instruction: {
                    parts: [{ text: systemInstruction }]
                },
                contents: contents,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: intentSchema
                }
            };

            const response = await axios.post(url, payload, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const responseText = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText) throw new Error("Empty response from Gemini");

            return JSON.parse(responseText);
        } catch (error: any) {
            console.warn("Gemini REST API Error (Text):", error?.response?.data || error.message);
            console.log("Falling back to OpenRouter...");
            return await callOpenRouterFallback(text, history);
        }
    } else {
        console.log("Gemini API key not found in web env. Proceeding with OpenRouter directly.");
        return await callOpenRouterFallback(text, history);
    }
}
