import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import axios from 'axios';
import { Reminder, ReminderCategory } from '../types';

// Load environment variables
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const ownerId = process.env.TELEGRAM_USER_ID;

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is missing in .env');
    process.exit(1);
}

if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL or SUPABASE_ANON_KEY is missing in .env');
    process.exit(1);
}

// Initialize Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

// Create a simple dummy server so cloud providers (like Render) have a port to bind to
import http from 'http';
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Bot is alive and running!');
    res.end();
}).listen(port as number, '0.0.0.0', () => {
    console.log(`Dummy server listening on port ${port} at 0.0.0.0`);
});

console.log('Bot is running...');

// Simple in-memory state for conversational flows
interface UserState {
    step: string;
    action: string;
    amount?: number;
    accountId?: string;
    toAccountId?: string;
    purpose?: string;
    title?: string;
    service?: string;
    username?: string;
    password?: string;
    dateObj?: Date;
    dateStr?: string;
    reminderId?: string;
    actionId?: string;
    payload?: any;
    napStartTime?: number;
}
const userStates: Record<string, UserState> = {};
const activeMenus: Record<string, number> = {};
const activeMenuTimeouts: Record<string, NodeJS.Timeout> = {};

// Helper to get consistent IST current date/time
function getISTDateInfo() {
    const now = new Date();
    // Get the localized date/time string in IST
    const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istDate = new Date(istString);

    // YYYY-MM-DD padded explicitly for reliable DB dates
    const year = istDate.getFullYear();
    const month = String(istDate.getMonth() + 1).padStart(2, '0');
    const day = String(istDate.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    return {
        istDate,  // Date object representing exact local IST time (note: JS Date behaves like local if we construct it this way)
        todayStr, // YYYY-MM-DD
        hour: istDate.getHours(),
        minute: istDate.getMinutes()
    };
}

// Import AI parsers
import { parseIntentFromText, parseIntentFromAudio, ChatTurn } from './ai';

const chatMemory: Record<string, ChatTurn[]> = {};

function addMemory(chatId: string, role: "user" | "model", text: string) {
    if (!text) return;
    if (!chatMemory[chatId]) chatMemory[chatId] = [];
    chatMemory[chatId].push({ role, parts: [{ text }] });
    // Keep only last 4 turns (2 user, 2 bot) to manage tokens
    if (chatMemory[chatId].length > 4) {
        chatMemory[chatId].shift();
    }
}

async function executeConfirmedAction(chatId: string | number, state: UserState, botInstance: any, messageId: any) {
    try {
        if (state.action === 'delete_reminder') {
            await supabase.from('reminders').delete().eq('id', state.actionId);
            botInstance.editMessageText('✅ Reminder deleted.', { chat_id: chatId, message_id: messageId });
        } else if (state.action === 'delete_transaction') {
            await supabase.from('transactions').delete().eq('id', state.actionId);
            botInstance.editMessageText('✅ Transaction deleted.', { chat_id: chatId, message_id: messageId });
        } else if (state.action === 'delete_account') {
            await supabase.from('accounts').delete().eq('id', state.actionId);
            botInstance.editMessageText('✅ Account deleted.', { chat_id: chatId, message_id: messageId });
        } else if (state.action === 'delete_sub') {
            await supabase.from('subscriptions').delete().eq('id', state.actionId);
            botInstance.editMessageText('✅ Subscription deleted.', { chat_id: chatId, message_id: messageId });
        } else if (state.action === 'modify_balance') {
            await supabase.from('accounts').update({ balance: state.payload?.balance }).eq('id', state.actionId);
            botInstance.editMessageText(`✅ Account balance updated to ₹${state.payload?.balance}.`, { chat_id: chatId, message_id: messageId });
        }
    } catch (error) {
        console.error("Execute confirmation error", error);
        botInstance.editMessageText('❌ Failed to execute action.', { chat_id: chatId, message_id: messageId });
    }
}

// Middleware to check if the user is authorized
const isAuthorized = (msg: TelegramBot.Message): boolean => {
    if (!ownerId) {
        // If ownerId is not set, allow and log the ID so user can add it to .env
        console.log(`Received message from ID: ${msg.chat.id}. You can add this to TELEGRAM_USER_ID in .env`);
        return true; // Wait for the first message to capture ID
    }
    return msg.chat.id.toString() === ownerId;
};

// Helper to resolve an account from a hint
async function resolveAccount(hint: string | undefined): Promise<string | null> {
    const { data: accounts } = await supabase.from('accounts').select('id, name');
    if (!accounts || accounts.length === 0) return null;

    if (!hint) {
        // If no hint, just use the first account as default
        return accounts[0].id;
    }

    // Try to match hint
    const match = accounts.find(a => a.name.toLowerCase().includes(hint.toLowerCase()));
    if (match) return match.id;

    return accounts[0].id;
}

// Catch-all message handler for conversational flows and AI
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return; // Ignore commands
    if (!isAuthorized(msg)) return;

    const chatId = msg.chat.id.toString();
    const state = userStates[chatId];

    // If user is not in a specific menu state, route to AI
    if (!state) {
        let inputType: 'text' | 'voice' | 'none' = 'none';
        let inputText = '';
        let fileId = '';

        if (msg.text) {
            inputType = 'text';
            inputText = msg.text;
        } else if (msg.voice) {
            inputType = 'voice';
            fileId = msg.voice.file_id;
        }

        if (inputType === 'none') {
            bot.sendMessage(chatId, 'Type a message or send a voice note, or use /menu to see options.');
            return;
        }

        bot.sendChatAction(chatId, inputType === 'voice' ? 'record_voice' : 'typing');

        try {
            let aiResult: any;

            if (inputType === 'voice') {
                const fileLink = await bot.getFileLink(fileId);
                aiResult = await parseIntentFromAudio(fileLink, chatMemory[chatId]);
                addMemory(chatId, "user", "[Voice Message]");
            } else {
                aiResult = await parseIntentFromText(inputText, chatMemory[chatId]);
                addMemory(chatId, "user", inputText);
            }

            if (aiResult.replyText) {
                addMemory(chatId, "model", aiResult.replyText);
            }

            const intent = aiResult.intent;

            if ((intent === 'ADD_TRANSACTION' || intent === 'ADD_INCOME' || intent === 'ADD_EXPENSE') && aiResult.transaction) {
                const tx = aiResult.transaction;
                if (!tx.amount || !tx.purpose) {
                    bot.sendMessage(chatId, "Please specify the exact amount and purpose for the transaction.", { reply_markup: { remove_keyboard: true } });
                    return;
                }
                const accountId = await resolveAccount(tx.accountHint);
                if (!accountId) { bot.sendMessage(chatId, "You need to create at least one account in the web app first."); return; }
                const { todayStr } = getISTDateInfo();
                const txType = intent === 'ADD_INCOME' ? 'INCOME' : (intent === 'ADD_EXPENSE' ? 'EXPENSE' : (tx.type === 'INCOME' ? 'INCOME' : 'EXPENSE'));
                const newTx = { id: crypto.randomUUID(), amount: tx.amount, purpose: tx.purpose, date: todayStr, type: txType, accountId: accountId };
                await supabase.from('transactions').insert([newTx]);

                const { data: acc } = await supabase.from('accounts').select('*').eq('id', accountId).single();
                if (acc) {
                    const newBalance = txType === 'EXPENSE' ? Number(acc.balance) - Number(tx.amount) : Number(acc.balance) + Number(tx.amount);
                    const flowUpdate = txType === 'EXPENSE' ? { balance: newBalance, totalOutflow: Number(acc.totalOutflow) + Number(tx.amount) } : { balance: newBalance, totalInflow: Number(acc.totalInflow) + Number(tx.amount) };
                    await supabase.from('accounts').update(flowUpdate).eq('id', accountId);
                }

                bot.sendMessage(chatId, `✅ Logged ${txType} of ₹${tx.amount} for "${tx.purpose}".`);
            }
            else if (intent === 'ADD_TRANSFER' && aiResult.transaction) {
                const tx = aiResult.transaction;
                if (!tx.amount || !tx.toAccountHint) { bot.sendMessage(chatId, "I need both an amount and a destination account for a transfer."); return; }
                const fromAccountId = await resolveAccount(tx.accountHint);
                const toAccountId = await resolveAccount(tx.toAccountHint);

                if (!fromAccountId || !toAccountId) { bot.sendMessage(chatId, "I couldn't confidently identify both accounts. Please verify your account names."); return; }
                const { todayStr } = getISTDateInfo();
                const newTx = { id: crypto.randomUUID(), amount: tx.amount, purpose: tx.purpose || 'Transfer', date: todayStr, type: 'TRANSFER', accountId: fromAccountId, toAccountId: toAccountId };
                await supabase.from('transactions').insert([newTx]);

                const { data: fromAcc } = await supabase.from('accounts').select('balance, totalOutflow').eq('id', fromAccountId).single();
                if (fromAcc) await supabase.from('accounts').update({ balance: Number(fromAcc.balance) - Number(tx.amount), totalOutflow: Number(fromAcc.totalOutflow) + Number(tx.amount) }).eq('id', fromAccountId);

                const { data: toAcc } = await supabase.from('accounts').select('balance, totalInflow').eq('id', toAccountId).single();
                if (toAcc) await supabase.from('accounts').update({ balance: Number(toAcc.balance) + Number(tx.amount), totalInflow: Number(toAcc.totalInflow) + Number(tx.amount) }).eq('id', toAccountId);

                bot.sendMessage(chatId, `✅ Transferred ₹${tx.amount}.`);
            }
            else if (intent === 'DELETE_TRANSACTION' && aiResult.actionId) {
                const keyword = aiResult.actionId.toLowerCase();
                const { data: txs } = await supabase.from('transactions').select('*').order('date', { ascending: false }).limit(20);
                const match = txs?.find(t => t.purpose.toLowerCase().includes(keyword));
                if (!match) { bot.sendMessage(chatId, `Couldn't find a matching transaction recently for '${aiResult.actionId}'.`); return; }

                userStates[chatId] = { step: 'pending_confirmation', action: 'delete_transaction', actionId: match.id };
                bot.sendMessage(chatId, `⚠️ Delete transaction: *${match.purpose}* (₹${match.amount})?`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: 'Yes, Delete', callback_data: 'confirm_action_yes' }, { text: 'No, Cancel', callback_data: 'confirm_action_no' }]] }
                });
            }
            else if (intent === 'LIST_TRANSACTIONS') {
                const { data: txs } = await supabase.from('transactions').select('*').order('date', { ascending: false }).limit(5);
                if (!txs || txs.length === 0) { bot.sendMessage(chatId, "No recent transactions found."); return; }
                let msg = '📋 *Recent Transactions*\n\n';
                txs.forEach(t => { msg += `${t.type === 'EXPENSE' ? '📉' : (t.type === 'INCOME' ? '📈' : '🔄')} *${t.purpose}*\nAmount: ₹${t.amount} | Date: ${new Date(t.date).toLocaleDateString()}\n\n`; });
                bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            }
            else if (intent === 'GET_FINANCE_OVERVIEW') {
                const { data: accs } = await supabase.from('accounts').select('*');
                let totalBal = 0; accs?.forEach(a => totalBal += Number(a.balance));
                bot.sendMessage(chatId, `💰 *Finance Overview*\n\nTotal Balance: ₹${totalBal.toFixed(2)}\nTotal Accounts: ${accs?.length || 0}`, { parse_mode: 'Markdown' });
            }
            else if (intent === 'LIST_ACCOUNTS') {
                const { data: accs } = await supabase.from('accounts').select('*').order('name');
                if (!accs || accs.length === 0) { bot.sendMessage(chatId, "No accounts found."); return; }
                let msg = '🏦 *Your Accounts*\n\n';
                accs.forEach(a => { msg += `• *${a.name}* (${a.type}): ₹${a.balance}\n`; });
                bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            }
            else if (intent === 'ADD_ACCOUNT' && aiResult.account) {
                const a = aiResult.account;
                if (!a.name || a.balance === undefined) { bot.sendMessage(chatId, "Please provide the account name and initial balance."); return; }
                const newAcc = { id: crypto.randomUUID(), name: a.name, type: a.type || 'Bank Account', balance: a.balance, totalInflow: 0, totalOutflow: 0 };
                await supabase.from('accounts').insert([newAcc]);
                bot.sendMessage(chatId, `✅ Account *${a.name}* created with ₹${a.balance}.`, { parse_mode: 'Markdown' });
            }
            else if (intent === 'DELETE_ACCOUNT' && aiResult.actionId) {
                const keyword = aiResult.actionId.toLowerCase();
                const { data: accs } = await supabase.from('accounts').select('*');
                const match = accs?.find(a => a.name.toLowerCase().includes(keyword));
                if (!match) { bot.sendMessage(chatId, `Couldn't find an account matching '${aiResult.actionId}'.`); return; }

                userStates[chatId] = { step: 'pending_confirmation', action: 'delete_account', actionId: match.id };
                bot.sendMessage(chatId, `⚠️ Delete account: *${match.name}*? All its transactions might be affected.`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: 'Yes, Delete', callback_data: 'confirm_action_yes' }, { text: 'No, Cancel', callback_data: 'confirm_action_no' }]] }
                });
            }
            else if (intent === 'MODIFY_BALANCE' && aiResult.account && aiResult.actionId) {
                const keyword = aiResult.actionId.toLowerCase();
                const { data: accs } = await supabase.from('accounts').select('*');
                const match = accs?.find(a => a.name.toLowerCase().includes(keyword));
                if (!match) { bot.sendMessage(chatId, `Couldn't find an account matching '${aiResult.actionId}'.`); return; }
                const newBal = aiResult.account.balance !== undefined ? aiResult.account.balance : 0;

                userStates[chatId] = { step: 'pending_confirmation', action: 'modify_balance', actionId: match.id, payload: { balance: newBal } };
                bot.sendMessage(chatId, `⚠️ Update balance of *${match.name}* from ₹${match.balance} to ₹${newBal}?`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: 'Yes, Update', callback_data: 'confirm_action_yes' }, { text: 'No, Cancel', callback_data: 'confirm_action_no' }]] }
                });
            }
            else if (intent === 'ADD_REMINDER' && aiResult.reminder) {
                const r = aiResult.reminder;
                if (!r.title) { bot.sendMessage(chatId, "I caught the reminder intent, but what exactly should I remind you about?"); return; }

                let finalDate = new Date();
                if (r.dateStr) {
                    const parsed = new Date(r.dateStr);
                    if (!isNaN(parsed.getTime())) finalDate = parsed;
                } else {
                    finalDate.setHours(23, 59, 59, 999);
                }

                const newReminder = { id: crypto.randomUUID(), title: r.title, description: 'Added via AI Assistant', dueDate: finalDate.toISOString(), category: 'GENERAL', isDone: false };
                await supabase.from('reminders').insert([newReminder]);
                bot.sendMessage(chatId, `✅ Set reminder: *${r.title}* for ${finalDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`, { parse_mode: 'Markdown' });
            }
            else if (intent === 'LIST_REMINDERS') {
                const { data: rems } = await supabase.from('reminders').select('*').eq('isDone', false).order('dueDate', { ascending: true }).limit(5);
                if (!rems || rems.length === 0) { bot.sendMessage(chatId, "You have no pending reminders."); return; }
                let msg = '🔔 *Upcoming Reminders*\n\n';
                rems.forEach(r => { msg += `• *${r.title}* - ${new Date(r.dueDate).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}\n`; });
                bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            }
            else if (intent === 'DELETE_REMINDER' && aiResult.actionId) {
                const keyword = aiResult.actionId.toLowerCase();
                const { data: rems } = await supabase.from('reminders').select('*').eq('isDone', false).order('dueDate', { ascending: true }).limit(20);
                const match = rems?.find(r => r.title.toLowerCase().includes(keyword));
                if (!match) { bot.sendMessage(chatId, `Couldn't find a pending reminder matching '${aiResult.actionId}'.`); return; }

                userStates[chatId] = { step: 'pending_confirmation', action: 'delete_reminder', actionId: match.id };
                bot.sendMessage(chatId, `⚠️ Delete reminder: *${match.title}*?`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: 'Yes, Delete', callback_data: 'confirm_action_yes' }, { text: 'No, Cancel', callback_data: 'confirm_action_no' }]] }
                });
            }
            else if (intent === 'EDIT_REMINDER' && aiResult.reminder && aiResult.actionId) {
                const keyword = aiResult.actionId.toLowerCase();
                const { data: rems } = await supabase.from('reminders').select('*').eq('isDone', false).order('dueDate', { ascending: true }).limit(20);
                const match = rems?.find(r => r.title.toLowerCase().includes(keyword));
                if (!match) { bot.sendMessage(chatId, `Couldn't find a pending reminder matching '${aiResult.actionId}'.`); return; }

                const updates: any = {};
                if (aiResult.reminder.newTitle) updates.title = aiResult.reminder.newTitle;
                if (aiResult.reminder.newDateStr) {
                    const parsed = new Date(aiResult.reminder.newDateStr);
                    if (!isNaN(parsed.getTime())) updates.dueDate = parsed.toISOString();
                }

                if (Object.keys(updates).length > 0) {
                    await supabase.from('reminders').update(updates).eq('id', match.id);
                    bot.sendMessage(chatId, `✅ Updated reminder: *${updates.title || match.title}*`);
                } else {
                    bot.sendMessage(chatId, `I found the reminder but didn't catch what you wanted to change.`);
                }
            }
            else if (intent === 'ADD_WATCH_LATER' && aiResult.watchLater) {
                const url = aiResult.watchLater.url || inputText;
                if (!url.startsWith('http')) { bot.sendMessage(chatId, "I didn't find a valid URL to save."); return; }
                const { istDate } = getISTDateInfo();

                let extractedTitle = aiResult.watchLater.title || 'Saved via AI';
                // Attempt to fetch title if the AI couldn't confidently capture one
                if (extractedTitle === 'Saved via AI') {
                    try {
                        const response = await axios.get(url, { timeout: 3000 });
                        const match = response.data.match(/<title>(.*?)<\/title>/i);
                        if (match && match[1]) extractedTitle = match[1].trim();
                    } catch (e) {
                        // gracefully fail and leave as 'Saved via AI'
                    }
                }

                const newItem = { id: crypto.randomUUID(), title: extractedTitle, link: url, isWatched: false, dateAdded: istDate.toISOString() };
                await supabase.from('media_items').insert([newItem]);
                bot.sendMessage(chatId, `✅ Saved to Watch Later: *${extractedTitle}*`, { parse_mode: 'Markdown' });
            }
            else if (intent === 'ADD_PASSWORD' && aiResult.password) {
                const p = aiResult.password;
                if (!p.service || (!p.username && !p.password)) { bot.sendMessage(chatId, "I need at least the service name and either the username or password."); return; }

                const newPwd = { id: crypto.randomUUID(), service: p.service, username: p.username || 'Unknown', passwordString: p.password || 'Unknown', notes: 'Added via AI' };
                await supabase.from('passwords').insert([newPwd]);
                bot.sendMessage(chatId, `✅ Saved credentials for *${p.service}*!`, { parse_mode: 'Markdown' });
            }
            else if (intent === 'ADD_WATER' && aiResult.habit) {
                const glasses = aiResult.habit.glasses || 1;
                const { todayStr } = getISTDateInfo();
                const { data: habit } = await supabase.from('daily_habits').select('*').eq('date', todayStr).single();
                const newIntake = (habit ? habit.water_intake : 0) + glasses;

                await supabase.from('daily_habits').upsert({ date: todayStr, water_intake: newIntake });
                bot.sendMessage(chatId, `💧 Added ${glasses} glass(es). Total today: ${newIntake}/8 glasses.`);
            }
            else if (intent === 'SET_WAKEUP' && aiResult.habit?.time) {
                const timeStr = aiResult.habit.time;
                const { todayStr } = getISTDateInfo();
                await supabase.from('daily_habits').upsert({ date: todayStr, wake_up_time: timeStr }, { onConflict: 'date' });
                bot.sendMessage(chatId, `🌅 Got it! Wake up time set to ${timeStr}.`);
            }
            else if (intent === 'SET_SLEEP' && aiResult.habit?.time) {
                const timeStr = aiResult.habit.time;
                const { todayStr } = getISTDateInfo();
                await supabase.from('daily_habits').upsert({ date: todayStr, sleep_time: timeStr }, { onConflict: 'date' });
                bot.sendMessage(chatId, `🌙 Sleep well! Logged sleep time as ${timeStr}.`);
            }
            else if (intent === 'START_NAP') {
                if (!userStates[chatId]) {
                    userStates[chatId] = { step: '', action: '', napStartTime: Date.now() };
                } else {
                    userStates[chatId].napStartTime = Date.now();
                }
                bot.sendMessage(chatId, `Nap started... sleep well! 💤`);
            }
            else if (intent === 'END_NAP') {
                const napStartTime = userStates[chatId]?.napStartTime;
                if (!napStartTime) {
                    bot.sendMessage(chatId, `I don't see an ongoing nap. You can start one by saying "Start nap".`);
                    return;
                }

                const now = Date.now();
                let durationMins = Math.floor((now - napStartTime) / 60000);
                if (durationMins < 1) durationMins = 1;

                // On cloud environments, Date methods might return UTC. Force IST string formatting explicitly.
                const formatISTClockTime = (epochMs: number) => {
                    const d = new Date(epochMs);
                    const timeString = d.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit' });
                    // Handle edge cases where 24:00 is returned instead of 00:00
                    return timeString.replace('24:', '00:');
                };

                const startStr = formatISTClockTime(napStartTime);
                const endStr = formatISTClockTime(now);

                const newNapRecord = {
                    start: startStr,
                    end: endStr,
                    duration: durationMins
                };

                const { todayStr } = getISTDateInfo();
                const { data: habit } = await supabase.from('daily_habits').select('*').eq('date', todayStr).single();
                const currentNaps = habit?.naps || [];
                const newNaps = [...currentNaps, newNapRecord];

                await supabase.from('daily_habits').upsert({ date: todayStr, naps: newNaps }, { onConflict: 'date' });

                delete userStates[chatId].napStartTime;
                bot.sendMessage(chatId, `✅ Ended your nap. Logged ${durationMins} minutes (${startStr} - ${endStr}).`);
            }
            else if (intent === 'ADD_NAP') {
                bot.sendMessage(chatId, `Please use the explicit /menu -> Habit Tracker to start and end your naps, so the exact times are logged accurately.`);
            }
            else if (intent === 'UPDATE_HABIT_COUNT') {
                const count = aiResult.habit?.count || 1;
                const { todayStr } = getISTDateInfo();
                const { data: habit } = await supabase.from('daily_habits').select('*').eq('date', todayStr).single();
                const newIntake = (habit ? habit.water_intake : 0) + count;
                await supabase.from('daily_habits').upsert({ date: todayStr, water_intake: newIntake });
                bot.sendMessage(chatId, `✅ Updated habit count. Total today: ${newIntake}.`);
            }
            else if (intent === 'VIEW_HABIT_COUNT') {
                const { todayStr } = getISTDateInfo();
                const { data: habit } = await supabase.from('daily_habits').select('*').eq('date', todayStr).single();
                bot.sendMessage(chatId, `💧 You've had ${habit?.water_intake || 0}/8 glasses of water today.`);
            }
            else if (intent === 'ADD_SUB' && aiResult.subscription) {
                const s = aiResult.subscription;
                if (!s.name || !s.amount) { bot.sendMessage(chatId, "Please specify the subscription name and amount."); return; }
                const newSub = { id: crypto.randomUUID(), name: s.name, cost: s.amount, frequency: s.frequency || '1 MONTH', nextBillingDate: new Date().toISOString() };
                await supabase.from('subscriptions').insert([newSub]);
                bot.sendMessage(chatId, `✅ Added subscription: *${s.name}* (₹${s.amount})`, { parse_mode: 'Markdown' });
            }
            else if (intent === 'LIST_SUBS') {
                const { data: subs } = await supabase.from('subscriptions').select('*');
                if (!subs || subs.length === 0) { bot.sendMessage(chatId, "No active subscriptions."); return; }
                let msg = '💳 *Subscriptions*\n\n';
                subs.forEach(s => msg += `• *${s.name}* - ₹${s.cost} (${s.frequency})\n`);
                bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            }
            else if (intent === 'DELETE_SUB' && aiResult.actionId) {
                const keyword = aiResult.actionId.toLowerCase();
                const { data: subs } = await supabase.from('subscriptions').select('*');
                const match = subs?.find(s => s.name.toLowerCase().includes(keyword));
                if (!match) { bot.sendMessage(chatId, `Couldn't find subscription matching '${aiResult.actionId}'.`); return; }
                userStates[chatId] = { step: 'pending_confirmation', action: 'delete_sub', actionId: match.id };
                bot.sendMessage(chatId, `⚠️ Delete subscription: *${match.name}*?`, { reply_markup: { inline_keyboard: [[{ text: 'Yes', callback_data: 'confirm_action_yes' }, { text: 'No', callback_data: 'confirm_action_no' }]] } });
            }
            else if (intent === 'ADD_FRIEND' && aiResult.split?.friendName) {
                const newFriend = { id: crypto.randomUUID(), name: aiResult.split.friendName, totalOwed: 0 };
                await supabase.from('friends').insert([newFriend]);
                bot.sendMessage(chatId, `✅ Added friend: *${newFriend.name}*`, { parse_mode: 'Markdown' });
            }
            else if (intent === 'ADD_SPLIT' && aiResult.split) {
                const s = aiResult.split;
                if (!s.friendName || !s.amount) { bot.sendMessage(chatId, "Please specify the friend name and amount."); return; }
                const { data: friends } = await supabase.from('friends').select('*');
                const match = friends?.find(f => f.name.toLowerCase().includes(s.friendName.toLowerCase()));
                if (!match) { bot.sendMessage(chatId, `Couldn't find friend '${s.friendName}'. Please add them first.`); return; }

                const newSplit = { id: crypto.randomUUID(), friendId: match.id, description: s.description || 'Split via AI', amount: s.amount, isPaid: false };
                await supabase.from('splits').insert([newSplit]);
                await supabase.from('friends').update({ totalOwed: Number(match.totalOwed) + Number(s.amount) }).eq('id', match.id);
                bot.sendMessage(chatId, `✅ Logged split: ₹${s.amount} with *${match.name}* for "${newSplit.description}".`, { parse_mode: 'Markdown' });
            }
            else if (intent === 'VIEW_SPLITS') {
                const { data: friends } = await supabase.from('friends').select('*');
                if (!friends || friends.length === 0) { bot.sendMessage(chatId, "No friends or splits found."); return; }
                let msg = '👥 *Friends & Splits*\n\n';
                friends.forEach(f => msg += `• *${f.name}*: owes ₹${f.totalOwed}\n`);
                bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            }
            else {
                // UNKNOWN intent or missing details
                if (aiResult.replyText) {
                    bot.sendMessage(chatId, aiResult.replyText);
                } else {
                    bot.sendMessage(chatId, "I'm not exactly sure what to do with that. You can tell me to add a transaction, save a reminder, etc.", getMainMenuKeyboard());
                }
            }
        } catch (error: any) {
            console.error("AI Error:", error?.response?.data || error.message);
            bot.sendMessage(chatId, "⚠️ Sorry, I encountered an issue processing your request. Please ensure the API keys are correct, or try again later.");
        }
        return;
    }

    // Handle Finance: Amount Input
    if (state.step === 'wait_amount') {
        const amount = parseFloat(msg.text);
        if (isNaN(amount) || amount <= 0) {
            bot.sendMessage(chatId, 'Please enter a valid positive number for the amount.');
            return;
        }
        state.amount = amount;

        // Next step: Ask for Account
        const { data: accounts } = await supabase.from('accounts').select('id, name').order('name');
        if (!accounts || accounts.length === 0) {
            bot.sendMessage(chatId, 'No accounts found. Please create one on the website first.');
            delete userStates[chatId];
            return;
        }

        const keyboard = accounts.map(a => [{ text: a.name, callback_data: `sel_acc_${a.id}` }]);
        keyboard.push([{ text: '❌ Cancel', callback_data: 'cancel_action' }]);

        state.step = state.action === 'transfer' ? 'wait_from_account' : 'wait_account';
        const prompt = state.action === 'transfer' ? 'Select the account to transfer FROM:' : 'Which account did you use?';

        bot.sendMessage(chatId, `Amount: ₹${amount}\n\n${prompt}`, {
            reply_markup: { inline_keyboard: keyboard }
        });
    }
    // Handle Finance: Purpose Input
    else if (state.step === 'wait_purpose') {
        state.purpose = msg.text.trim();

        // Execute the transaction
        const { todayStr } = getISTDateInfo();
        const newTx = {
            id: crypto.randomUUID(),
            amount: state.amount,
            purpose: state.purpose,
            date: todayStr,
            type: state.action === 'expense' ? 'EXPENSE' : 'INCOME',
            accountId: state.accountId
        };

        try {
            // 1. Insert Transaction
            await supabase.from('transactions').insert([newTx]);

            // 2. Update Account
            const { data: acc } = await supabase.from('accounts').select('*').eq('id', state.accountId).single();
            if (acc) {
                const newBalance = state.action === 'expense'
                    ? Number(acc.balance) - Number(state.amount)
                    : Number(acc.balance) + Number(state.amount);

                const flowUpdate = state.action === 'expense'
                    ? { balance: newBalance, totalOutflow: Number(acc.totalOutflow) + Number(state.amount) }
                    : { balance: newBalance, totalInflow: Number(acc.totalInflow) + Number(state.amount) };

                await supabase.from('accounts').update(flowUpdate).eq('id', state.accountId);
            }

            bot.sendMessage(chatId, `✅ Successfully logged ${state.action.toUpperCase()} of ₹${state.amount} for "${state.purpose}"!`, {
                reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Finance Menu', callback_data: 'menu_finance' }]] }
            });
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, 'Error saving transaction.');
        }

        delete userStates[chatId];
    }
    // Handle Reminders
    else if (state.step === 'wait_reminder_title') {
        state.title = msg.text.trim();
        state.step = 'wait_reminder_date';
        bot.sendMessage(chatId, `Title: *${state.title}*\n\nNow enter the due date (YYYY-MM-DD).\nAlternatively, type "today" or "none" to set it for today:`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_action' }]] }
        });
    }
    else if (state.step === 'wait_reminder_date') {
        const dateStr = msg.text.trim().toLowerCase();
        let finalDate = new Date();

        if (dateStr !== 'none' && dateStr !== 'today') {
            finalDate = new Date(dateStr);
            if (isNaN(finalDate.getTime())) {
                bot.sendMessage(chatId, 'Invalid date format. Please use YYYY-MM-DD or type "today" or "none".');
                return;
            }
        }

        // Store intermediate date string instead of object to avoid timezone issues
        userStates[chatId].dateObj = finalDate;

        let dayFormat = '';
        if (dateStr !== 'none' && dateStr !== 'today') {
            dayFormat = dateStr;
        } else {
            const { todayStr } = getISTDateInfo();
            dayFormat = todayStr;
        }

        userStates[chatId].dateStr = dayFormat;
        state.step = 'wait_reminder_time';
        bot.sendMessage(chatId, `Date set to ${userStates[chatId].dateStr}.\n\nNow enter the time (HH:MM AM/PM) or in 24-hour format.\nAlternatively, type "none" to set it for the end of the day:`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_action' }]] }
        });
    }
    else if (state.step === 'wait_reminder_time') {
        const timeStr = msg.text.trim().toLowerCase();
        let finalDate = userStates[chatId].dateObj as Date;

        if (timeStr === 'none') {
            finalDate.setHours(23, 59, 59, 999);
        } else {
            // Very basic time parsing (e.g., 14:30 or 2:30 PM)
            const match = timeStr.match(/(\d+):(\d+)\s*(am|pm)?/);
            if (match) {
                let hours = parseInt(match[1]);
                const mins = parseInt(match[2]);
                const ampm = match[3];

                if (ampm === 'pm' && hours < 12) hours += 12;
                // Construct IST string and parse it properly
                const istDateString = `${(state as any).dateStr}T${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00+05:30`;
                finalDate = new Date(istDateString);

                if (isNaN(finalDate.getTime())) {
                    bot.sendMessage(chatId, 'Error parsing the combined date and time.');
                    return;
                }
            } else {
                bot.sendMessage(chatId, 'Invalid time format. Please use HH:MM. Example: 14:30 or 2:30 PM');
                return;
            }

            const newReminder = {
                id: crypto.randomUUID(),
                title: state.title,
                description: 'Added via Telegram Bot',
                dueDate: finalDate.toISOString(),
                category: 'GENERAL',
                isDone: false
            };

            try {
                await supabase.from('reminders').insert([newReminder]);
                bot.sendMessage(chatId, `✅ Reminder added successfully!\n*${state.title}* due on ${finalDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]] }
                });

                // Notification will be handled by the polling mechanism
            } catch (error) {
                console.error(error);
                bot.sendMessage(chatId, 'Error saving reminder.');
            }
            delete userStates[chatId];
        }
    } else if (state.step === 'wait_snooze_custom') {
        const hours = parseFloat(msg.text);
        if (isNaN(hours) || hours <= 0) {
            bot.sendMessage(chatId, 'Please enter a valid number of hours (e.g., 2 or 1.5).');
            return;
        }

        const reminderId = state.reminderId;
        if (reminderId) {
            const { data: rem } = await supabase.from('reminders').select('*').eq('id', reminderId).single();
            if (rem) {
                const newDueDate = new Date();
                newDueDate.setMinutes(newDueDate.getMinutes() + Math.round(hours * 60));

                await supabase.from('reminders').update({ dueDate: newDueDate.toISOString() }).eq('id', reminderId);

                bot.sendMessage(chatId, `💤 Snoozed *${rem.title}* for ${hours} hour(s)!`, { parse_mode: 'Markdown' });

                // Notification will be handled by the polling mechanism
            }
        }
        delete userStates[chatId];
    }
    // Handle Watch Later
    else if (state.step === 'wait_wl_url') {
        const url = msg.text.trim();
        if (!url.startsWith('http')) {
            bot.sendMessage(chatId, 'Please enter a valid URL (starting with http:// or https://).');
            return;
        }

        const { istDate } = getISTDateInfo();
        const newItem = {
            id: crypto.randomUUID(),
            title: 'Saved from Telegram',
            link: url,
            isWatched: false,
            dateAdded: istDate.toISOString()
        };

        try {
            await supabase.from('media_items').insert([newItem]);
            bot.sendMessage(chatId, `✅ Watch Later link saved!`, {
                reply_markup: { inline_keyboard: [[{ text: '🔙 View Watch Later', callback_data: 'menu_watchlater' }]] }
            });
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, 'Error saving link.');
        }
        delete userStates[chatId];
    }
    // Handle Passwords
    else if (state.step === 'wait_pwd_service') {
        state.service = msg.text.trim();
        state.step = 'wait_pwd_username';
        bot.sendMessage(chatId, `Service: *${state.service}*\n\nPlease enter the Username/Email:`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_action' }]] }
        });
    }
    else if (state.step === 'wait_pwd_username') {
        state.username = msg.text.trim();
        state.step = 'wait_pwd_password';
        bot.sendMessage(chatId, `Username: \`${state.username}\`\n\nPlease enter the Password:`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_action' }]] }
        });
    }
    else if (state.step === 'wait_pwd_password') {
        state.password = msg.text.trim();

        const newPwd = {
            id: crypto.randomUUID(),
            service: state.service,
            username: state.username,
            passwordString: state.password,
            notes: 'Added via Telegram Bot'
        };

        try {
            await supabase.from('passwords').insert([newPwd]);
            bot.sendMessage(chatId, `✅ Password for *${state.service}* saved securely!`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Passwords', callback_data: 'menu_passwords' }]] }
            });
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, 'Error saving password.');
        }
        delete userStates[chatId];
    }
});

const getMainMenuKeyboard = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: '🏠 Dashboard', callback_data: 'menu_dashboard' }],
            [{ text: '✅ Reminders', callback_data: 'menu_reminders' }, { text: '💧 Habit Tracker', callback_data: 'menu_habits' }],
            [{ text: '📺 Watch Later', callback_data: 'menu_watchlater' }, { text: '🔐 Passwords', callback_data: 'menu_passwords' }],
            [{ text: '💰 Finance Manager', callback_data: 'menu_finance' }]
        ]
    }
});

// Start & Menu command
bot.onText(/\/(start|menu)/, (msg) => {
    const chatId = msg.chat.id.toString(); // Ensure chatId is a string for userStates
    const state = userStates[chatId];

    // If user is not in a specific menu state, route to AI
    if (!state) {
        if (ownerId && chatId !== ownerId) {
            bot.sendMessage(chatId, 'Sorry, you are not authorized to use this bot.');
            return;
        }

        // Display the main menu when /start or /menu is used and no state is active
        const welcomeMessage = `
Welcome to LifeSync Bot! 🚀

🌐 *Web App URL:* https://lifesync-sand.vercel.app/
Please select a module below to get started:
`;

        bot.sendMessage(chatId, welcomeMessage, getMainMenuKeyboard());
    }
});

// Help command
bot.onText(/\/help/, (msg) => {
    if (!isAuthorized(msg)) return;
    bot.sendMessage(msg.chat.id, 'Use /menu or /start to open the interactive menu!');
});

// Handle button clicks
bot.on('callback_query', async (query) => {
    if (!query.message || !query.data) return;
    const chatId = query.message.chat.id.toString();

    // Clear any active menu timeout if user clicked a button
    if (activeMenuTimeouts[chatId]) {
        clearTimeout(activeMenuTimeouts[chatId]);
        delete activeMenuTimeouts[chatId];
    }

    // Acknowledge the callback immediately so the button stops loading
    bot.answerCallbackQuery(query.id).catch(console.error);

    const data = query.data;

    try {
        if (data === 'main_menu') {
            await bot.editMessageText('Please select a module below:', {
                chat_id: chatId,
                message_id: query.message.message_id,
                ...getMainMenuKeyboard()
            });
        } else if (data === 'menu_dashboard') {
            bot.editMessageText('Gathering your Dashboard summary...', {
                chat_id: chatId,
                message_id: query.message.message_id
            });

            // Fetch reminders
            const { data: reminders } = await supabase
                .from('reminders')
                .select('*')
                .eq('isDone', false);

            // Fetch today's habit
            const { todayStr } = getISTDateInfo();
            const { data: habit } = await supabase
                .from('daily_habits')
                .select('*')
                .eq('date', todayStr)
                .single();

            // Fetch accounts balance
            const { data: accounts } = await supabase
                .from('accounts')
                .select('balance');

            let totalBalance = 0;
            if (accounts) {
                totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance), 0);
            }

            const waterIntake = habit ? habit.water_intake : 0;
            const pendingReminders = reminders ? reminders.length : 0;

            const summaryMsg = `
🏠 *Your LifeSync Dashboard*

✅ *Pending Reminders:* ${pendingReminders} tasks
💧 *Water Intake:* ${waterIntake} / 8 glasses
💰 *Total Net Worth:* ₹${totalBalance.toFixed(2)}
            `;

            await bot.editMessageText(summaryMsg, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        } else if (data === 'menu_reminders') {
            bot.editMessageText('Fetching your reminders...', { chat_id: chatId, message_id: query.message.message_id });

            const { data: reminders, error } = await supabase
                .from('reminders')
                .select('*')
                .eq('isDone', false)
                .order('dueDate', { ascending: true });

            if (error || !reminders || reminders.length === 0) {
                await bot.editMessageText('✅ *Pending Reminders*\n\nYou have no pending reminders! 🎉', {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '➕ Add Reminder', callback_data: 'rem_add' }],
                            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
                        ]
                    }
                });
                return;
            }

            let msg = '✅ *Pending Reminders*\n\n';
            const inlineKeyboard = [];

            reminders.forEach((rem, index) => {
                const date = new Date(rem.dueDate);
                const isOverdue = date < new Date() && rem.dueDate;
                const dateStr = isOverdue ? `⚠️ _Overdue: ${date.toLocaleDateString()}_` : date.toLocaleDateString();

                msg += `${index + 1}. *${rem.title}*\n   📅 ${dateStr}\n\n`;
                inlineKeyboard.push([
                    { text: `✔️ Done #${index + 1}`, callback_data: `action_done_${rem.id}` }
                ]);
            });

            inlineKeyboard.push([{ text: '➕ Add Reminder', callback_data: 'rem_add' }]);
            inlineKeyboard.push([{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]);

            await bot.editMessageText(msg, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: inlineKeyboard }
            });
        } else if (data === 'rem_add') {
            userStates[chatId] = { step: 'wait_reminder_title', action: 'add_reminder' };
            bot.editMessageText('✅ *Add Reminder*\n\nPlease enter the Title or Task description:', {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_action' }]] }
            });
        } else if (data.startsWith('action_done_')) {
            const reminderId = data.replace('action_done_', '');

            await supabase
                .from('reminders')
                .update({ isDone: true })
                .eq('id', reminderId);

            bot.answerCallbackQuery(query.id, { text: 'Marked as complete! ✅' }).catch(console.error);

            // Re-render the menu OR modify the notification msg
            if (query.message.text && query.message.text.includes('REMINDER')) {
                bot.editMessageText(`✅ *DONE*\n\n~${query.message.text.replace('🔔 REMINDER\n\n', '')}~`, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown'
                });
            } else {
                bot.sendMessage(chatId, 'Item marked as complete.', getMainMenuKeyboard());
            }
        } else if (data.startsWith('action_snooze_')) {
            // format: action_snooze_{id}_{minutes}
            const parts = data.replace('action_snooze_', '').split('_');
            const reminderId = parts[0];
            const minutes = parseInt(parts[1]);

            if (reminderId && !isNaN(minutes)) {
                const { data: rem } = await supabase.from('reminders').select('*').eq('id', reminderId).single();
                if (rem) {
                    const newDueDate = new Date();
                    newDueDate.setMinutes(newDueDate.getMinutes() + minutes);

                    await supabase
                        .from('reminders')
                        .update({ dueDate: newDueDate.toISOString() })
                        .eq('id', reminderId);

                    const timeLabel = minutes >= 60 ? (minutes % 60 === 0 ? `${minutes / 60} hr` : `${(minutes / 60).toFixed(1)} hr`) : `${minutes} min`;
                    bot.answerCallbackQuery(query.id, { text: `Snoozed for ${timeLabel}! 💤` }).catch(console.error);

                    bot.editMessageText(`💤 *SNOOZED*\n\n${rem.title}\n(Snoozed for ${timeLabel})`, {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'Markdown'
                    });

                    // Notification will be handled by the polling mechanism
                }
            }
        } else if (data.startsWith('action_customsnooze_')) {
            const reminderId = data.replace('action_customsnooze_', '');
            userStates[chatId] = { step: 'wait_snooze_custom', action: 'snooze', reminderId };
            bot.editMessageText('💤 *Custom Snooze*\n\nHow many hours would you like to snooze this reminder for? (e.g., 2, 0.5, 24)', {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_action' }]] }
            });
        } else if (data === 'menu_habits') {
            bot.editMessageText('Loading Habit Tracker...', { chat_id: chatId, message_id: query.message.message_id });

            const { todayStr } = getISTDateInfo();
            const { data: habit } = await supabase
                .from('daily_habits')
                .select('*')
                .eq('date', todayStr)
                .single();

            const waterIntake = habit ? habit.water_intake : 0;
            const progress = '💧'.repeat(waterIntake) + '⚪'.repeat(Math.max(0, 8 - waterIntake));

            const totalNapMins = (habit?.naps || []).reduce((a: number, b: any) => {
                if (typeof b === 'number') return a + b;
                if (b && typeof b === 'object' && typeof b.duration === 'number') return a + b.duration;
                return a;
            }, 0);
            const formatDuration = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
            const napDisplay = totalNapMins > 0 ? formatDuration(totalNapMins) : '0m';

            const currentState = userStates[chatId] || { step: '' } as UserState;
            const isNapOngoing = !!currentState.napStartTime;

            const habitMsg = `
💧 *Habit Tracker (Today)*

*Water Intake:* ${waterIntake} / 8 glasses
${progress}

😴 *Naps Today:* ${napDisplay}
            `;

            await bot.editMessageText(habitMsg, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '➕ Add 1 Water', callback_data: 'action_add_water' }, { text: '➖ Skip', callback_data: 'action_skip_water' }],
                        isNapOngoing
                            ? [{ text: '🛑 End Nap', callback_data: 'action_end_nap' }]
                            : [{ text: '😴 Start Nap', callback_data: 'action_start_nap' }],
                        [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        } else if (data === 'action_start_nap') {
            if (!userStates[chatId]) userStates[chatId] = { step: '', action: '' };
            userStates[chatId].napStartTime = Date.now();

            bot.answerCallbackQuery(query.id, { text: 'Nap started... sleep well! 💤', show_alert: false }).catch(console.error);

            // Re-render menu to show End Nap
            bot.editMessageText(`Nap started at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}...`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🛑 End Nap', callback_data: 'action_end_nap' }],
                        [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        } else if (data === 'action_end_nap') {
            const napStartTime = userStates[chatId]?.napStartTime;
            if (!napStartTime) {
                bot.answerCallbackQuery(query.id, { text: "No nap was running.", show_alert: true });
                return;
            }

            const now = Date.now();
            let durationMins = Math.floor((now - napStartTime) / 60000);
            if (durationMins < 1) durationMins = 1;

            const startObj = new Date(napStartTime);
            const endObj = new Date(now);
            const startStr = `${startObj.getHours().toString().padStart(2, '0')}:${startObj.getMinutes().toString().padStart(2, '0')}`;
            const endStr = `${endObj.getHours().toString().padStart(2, '0')}:${endObj.getMinutes().toString().padStart(2, '0')}`;

            const newNapRecord = {
                start: startStr,
                end: endStr,
                duration: durationMins
            };

            const { todayStr } = getISTDateInfo();
            const { data: habit } = await supabase.from('daily_habits').select('*').eq('date', todayStr).single();
            const currentNaps = habit?.naps || [];
            const newNaps = [...currentNaps, newNapRecord];

            await supabase.from('daily_habits').upsert({ date: todayStr, naps: newNaps }, { onConflict: 'date' });

            delete userStates[chatId].napStartTime;

            bot.answerCallbackQuery(query.id, { text: `Logged ${durationMins}m nap! 😴`, show_alert: false }).catch(console.error);

            bot.editMessageText(`✅ Logged a ${durationMins} minute nap (${startStr} - ${endStr}).`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: { inline_keyboard: [[{ text: '🔙 Check Habits', callback_data: 'menu_habits' }]] }
            });
        } else if (data === 'action_add_water' || data === 'action_skip_water') {
            const { todayStr } = getISTDateInfo();
            const { data: habit } = await supabase
                .from('daily_habits')
                .select('*')
                .eq('date', todayStr)
                .single();

            let newIntake = habit ? habit.water_intake : 0;
            if (data === 'action_add_water') newIntake += 1;

            await supabase
                .from('daily_habits')
                .upsert({ date: todayStr, water_intake: newIntake });

            // Answer query with alert
            bot.answerCallbackQuery(query.id, {
                text: data === 'action_add_water' ? `Added! Total: ${newIntake} glasses 💧` : 'Skipped for now.',
                show_alert: false
            }).catch(console.error);

            // Change the message text instead of rendering the menu again
            bot.editMessageText(data === 'action_add_water' ? `✅ Hydrated! Total today: ${newIntake}/8 glasses.` : `⏭️ Skipped this water reminder.`, {
                chat_id: chatId,
                message_id: query.message.message_id
            });
        } else if (data === 'action_wake_up_now' || data.startsWith('action_wake_up_')) {
            let timeVal = '';
            const { todayStr, hour, minute } = getISTDateInfo();

            if (data === 'action_wake_up_now') {
                timeVal = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            } else {
                timeVal = data.replace('action_wake_up_', '');
            }

            await supabase
                .from('daily_habits')
                .upsert({ date: todayStr, wake_up_time: timeVal }, { onConflict: 'date' });

            bot.editMessageText(`🌅 Good morning! Wake up time set to ${timeVal}. I'll remind you to drink water exactly every 2 hours.`, {
                chat_id: chatId,
                message_id: query.message.message_id
            });
        } else if (data === 'action_sleep_now') {
            const { todayStr, hour, minute } = getISTDateInfo();
            const timeVal = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

            await supabase
                .from('daily_habits')
                .upsert({ date: todayStr, sleep_time: timeVal }, { onConflict: 'date' });

            bot.editMessageText(`🌙 Good night! Sleep time logged at ${timeVal}. Water reminders paused for today.`, {
                chat_id: chatId,
                message_id: query.message.message_id
            });
        } else if (data === 'action_sleep_not_yet') {
            bot.editMessageText(`Got it, you're still awake. I'll ask again later or you can use the web app.`, {
                chat_id: chatId,
                message_id: query.message.message_id
            });
        } else if (data === 'menu_watchlater') {
            bot.editMessageText('Fetching your Watch Later list...', { chat_id: chatId, message_id: query.message.message_id });

            const { data: items, error } = await supabase
                .from('media_items')
                .select('*')
                .eq('isWatched', false)
                .order('dateAdded', { ascending: false });

            if (error || !items || items.length === 0) {
                await bot.editMessageText('📺 *Watch Later*\n\nYour list is empty! 🎉', {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '➕ Add Watch Later', callback_data: 'wl_add' }],
                            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
                        ]
                    }
                });
                return;
            }

            let msg = '📺 *Watch Later List*\n\n';
            const inlineKeyboard = [];

            items.forEach((item, index) => {
                msg += `${index + 1}. [${item.title}](${item.link || 'https://example.com'})\n`;
                inlineKeyboard.push([{ text: `✔️ Mark #${index + 1} Watched`, callback_data: `action_watched_${item.id}` }]);
            });

            inlineKeyboard.push([{ text: '➕ Add Watch Later', callback_data: 'wl_add' }]);
            inlineKeyboard.push([{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]);

            await bot.editMessageText(msg, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: inlineKeyboard }
            });
        } else if (data.startsWith('action_watched_')) {
            const itemId = data.replace('action_watched_', '');

            await supabase
                .from('media_items')
                .update({ isWatched: true })
                .eq('id', itemId);

            bot.answerCallbackQuery(query.id, { text: 'Marked as watched! ✅' }).catch(console.error);

            // Re-render the watch later menu
            bot.sendMessage(chatId, 'Item marked as watched.', getMainMenuKeyboard());
        } else if (data === 'wl_add') {
            userStates[chatId] = { step: 'wait_wl_url', action: 'add_wl' };
            bot.editMessageText('📺 *Add Watch Later*\n\nPlease paste the URL/Link:', {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_action' }]] }
            });
        } else if (data === 'menu_passwords') {
            bot.editMessageText('Loading your saved platforms...', { chat_id: chatId, message_id: query.message.message_id });

            const { data: passwords, error } = await supabase
                .from('passwords')
                .select('id, service, username')
                .order('service', { ascending: true });

            if (error || !passwords || passwords.length === 0) {
                await bot.editMessageText('🔐 *Passwords*\n\nYou haven\'t saved any passwords yet.', {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '➕ Add Password', callback_data: 'pwd_add' }],
                            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
                        ]
                    }
                });
                return;
            }

            const inlineKeyboard = [];

            // Create two columns of buttons for services
            for (let i = 0; i < passwords.length; i += 2) {
                const row = [];
                row.push({ text: `🔑 ${passwords[i].service}`, callback_data: `pwd_${passwords[i].id}` });
                if (i + 1 < passwords.length) {
                    row.push({ text: `🔑 ${passwords[i + 1].service}`, callback_data: `pwd_${passwords[i + 1].id}` });
                }
                inlineKeyboard.push(row);
            }

            inlineKeyboard.push([{ text: '➕ Add Password', callback_data: 'pwd_add' }]);
            inlineKeyboard.push([{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]);

            await bot.editMessageText('🔐 *Select a platform to view details:*', {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: inlineKeyboard }
            });
        } else if (data.startsWith('pwd_') && data !== 'pwd_add') {
            const pwdId = data.replace('pwd_', '');

            const { data: pwd, error } = await supabase
                .from('passwords')
                .select('*')
                .eq('id', pwdId)
                .single();

            if (error || !pwd) {
                bot.sendMessage(chatId, 'Could not load password details.');
                return;
            }

            const msg = `
🔐 *${pwd.service}*

*Username:* \`${pwd.username}\`
*Password:* \`${pwd.passwordString}\`

*Notes:* ${pwd.notes || 'None'}

⚠️ *This message will automatically delete in 30 seconds for security!*
            `.trim();

            const sentMsg = await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });

            // Auto-delete password after 30 seconds
            setTimeout(() => {
                bot.deleteMessage(chatId, sentMsg.message_id).catch(console.error);
            }, 30000);

            bot.answerCallbackQuery(query.id).catch(console.error);
        } else if (data === 'pwd_add') {
            userStates[chatId] = { step: 'wait_pwd_service', action: 'add_pwd' };
            bot.editMessageText('🔐 *Add Password*\n\nPlease enter the Service/Platform Name:', {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_action' }]] }
            });
        } else if (data === 'menu_finance') {
            await bot.editMessageText('💰 *Finance Manager*\n\nSelect an option below:', {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🏦 Accounts & Balances', callback_data: 'fin_accounts' }],
                        [{ text: '📋 View Transactions', callback_data: 'fin_transactions' }],
                        [{ text: '💸 Add Expense', callback_data: 'fin_add_expense' }, { text: '🤑 Add Income', callback_data: 'fin_add_income' }],
                        [{ text: '🔄 Transfer', callback_data: 'fin_transfer' }, { text: '💳 Subscriptions', callback_data: 'fin_subs' }],
                        [{ text: '👥 Friends & Splits', callback_data: 'fin_friends' }],
                        [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        } else if (data === 'fin_accounts') {
            bot.editMessageText('Fetching your account balances...', { chat_id: chatId, message_id: query.message.message_id });

            const { data: accounts, error } = await supabase
                .from('accounts')
                .select('*')
                .order('name', { ascending: true });

            if (error || !accounts || accounts.length === 0) {
                await bot.editMessageText('🏦 *Accounts & Balances*\n\nNo accounts found.', {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back to Finance Menu', callback_data: 'menu_finance' }]]
                    }
                });
                return;
            }

            let msg = '🏦 *Accounts & Balances*\n\n';
            let total = 0;
            accounts.forEach((acc) => {
                msg += `*${acc.name}* (${acc.type})\n`;
                msg += `Balance: ₹${Number(acc.balance).toFixed(2)}\n\n`;
                total += Number(acc.balance);
            });
            msg += `💰 *Total Net Worth:* ₹${total.toFixed(2)}`;

            await bot.editMessageText(msg, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back to Finance Menu', callback_data: 'menu_finance' }]]
                }
            });
        } else if (data === 'fin_transactions') {
            bot.editMessageText('Fetching recent transactions...', { chat_id: chatId, message_id: query.message.message_id });

            // Fetch last 10 transactions
            const { data: transactions, error } = await supabase
                .from('transactions')
                .select('*')
                .order('date', { ascending: false })
                .limit(10);

            if (error || !transactions || transactions.length === 0) {
                await bot.editMessageText('📋 *Recent Transactions*\n\nNo transactions found.', {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back to Finance Menu', callback_data: 'menu_finance' }]]
                    }
                });
                return;
            }

            let msg = '📋 *Recent Transactions (Last 10)*\n\n';
            transactions.forEach((t) => {
                const icon = t.type === 'EXPENSE' ? '📉' : t.type === 'INCOME' ? '📈' : t.type === 'TRANSFER' ? '🔄' : '💸';
                const sign = t.type === 'EXPENSE' ? '-' : t.type === 'INCOME' ? '+' : '';
                msg += `${icon} *${t.purpose}*\n`;
                msg += `Amount: ${sign}₹${Number(t.amount).toFixed(2)} | Date: ${new Date(t.date).toLocaleDateString()}\n\n`;
            });

            await bot.editMessageText(msg, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back to Finance Menu', callback_data: 'menu_finance' }]]
                }
            });
        } else if (data === 'fin_add_expense' || data === 'fin_add_income') {
            const action = data === 'fin_add_expense' ? 'expense' : 'income';
            userStates[chatId] = { step: 'wait_amount', action };

            bot.editMessageText(`💸 *Add ${action === 'expense' ? 'Expense' : 'Income'}*\n\nPlease type the amount:`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_action' }]]
                }
            });
        } else if (data === 'fin_transfer') {
            userStates[chatId] = { step: 'wait_amount', action: 'transfer' };

            bot.editMessageText(`🔄 *Add Transfer*\n\nPlease type the amount to transfer:`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_action' }]]
                }
            });
        } else if (data === 'cancel_action') {
            delete userStates[chatId];
            bot.editMessageText('Action cancelled. Returning to menu...', {
                chat_id: chatId,
                message_id: query.message.message_id
            });
            setTimeout(async () => {
                try {
                    await bot.editMessageText('💰 *Finance Manager*\n\nSelect an option below:', {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🏦 Accounts & Balances', callback_data: 'fin_accounts' }],
                                [{ text: '📋 View Transactions', callback_data: 'fin_transactions' }],
                                [{ text: '💸 Add Expense', callback_data: 'fin_add_expense' }, { text: '🤑 Add Income', callback_data: 'fin_add_income' }],
                                [{ text: '🔄 Transfer', callback_data: 'fin_transfer' }, { text: '💳 Subscriptions', callback_data: 'fin_subs' }],
                                [{ text: '👥 Friends & Splits', callback_data: 'fin_friends' }],
                                [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
                            ]
                        }
                    });
                } catch (e) {
                    console.error('Error rendering finance menu on cancel', e);
                }
            }, 1000);
        } else if (data === 'confirm_action_no') {
            delete userStates[chatId];
            bot.editMessageText('Action cancelled.', { chat_id: chatId, message_id: query.message.message_id });
        } else if (data === 'confirm_action_yes') {
            const state = userStates[chatId];
            if (!state || state.step !== 'pending_confirmation') {
                bot.editMessageText('No pending action found or already processed.', { chat_id: chatId, message_id: query.message.message_id });
                return;
            }
            await executeConfirmedAction(chatId, state, bot, query.message.message_id);
            delete userStates[chatId];
        } else if (data.startsWith('sel_acc_')) {
            const state = userStates[chatId];
            if (!state) return;

            const selectedAccountId = data.replace('sel_acc_', '');

            if (state.step === 'wait_account') {
                state.accountId = selectedAccountId;
                state.step = 'wait_purpose';

                bot.editMessageText(`Account selected.\n\nWhat was the purpose? (Type it below)`, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_action' }]] }
                });
            } else if (state.step === 'wait_from_account') {
                state.accountId = selectedAccountId;
                state.step = 'wait_to_account';

                // Fetch accounts again to select TO account
                const { data: accounts } = await supabase.from('accounts').select('id, name').order('name');
                const keyboard = accounts?.filter(a => a.id !== selectedAccountId).map(a => [{ text: a.name, callback_data: `sel_acc_${a.id}` }]) || [];
                keyboard.push([{ text: '❌ Cancel', callback_data: 'cancel_action' }]);

                bot.editMessageText(`From account selected.\n\nSelect the account to transfer TO:`, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: { inline_keyboard: keyboard }
                });
            } else if (state.step === 'wait_to_account') {
                state.toAccountId = selectedAccountId;

                // Execute Transfer immediately
                const newTx = {
                    id: crypto.randomUUID(),
                    amount: state.amount,
                    purpose: 'Internal Transfer',
                    date: new Date().toISOString().split('T')[0],
                    type: 'TRANSFER',
                    accountId: state.accountId,
                    toAccountId: state.toAccountId,
                    isTransfer: true
                };

                try {
                    await supabase.from('transactions').insert([newTx]);

                    const { data: accFrom } = await supabase.from('accounts').select('*').eq('id', state.accountId).single();
                    if (accFrom) await supabase.from('accounts').update({ balance: Number(accFrom.balance) - Number(state.amount) }).eq('id', state.accountId);

                    const { data: accTo } = await supabase.from('accounts').select('*').eq('id', state.toAccountId).single();
                    if (accTo) await supabase.from('accounts').update({ balance: Number(accTo.balance) + Number(state.amount) }).eq('id', state.toAccountId);

                    bot.editMessageText(`✅ Successfully transferred ₹${state.amount}!`, {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Finance Menu', callback_data: 'menu_finance' }]] }
                    });
                } catch (error) {
                    console.error(error);
                    bot.sendMessage(chatId, 'Error saving transfer.');
                }

                delete userStates[chatId];
            }
        } else if (data === 'fin_subs') {
            bot.editMessageText('Fetching your subscriptions...', { chat_id: chatId, message_id: query.message.message_id });

            const { data: subs, error } = await supabase.from('subscriptions').select('*').eq('isActive', true).order('name', { ascending: true });

            if (error || !subs || subs.length === 0) {
                await bot.editMessageText('💳 *Active Subscriptions*\n\nNo active subscriptions found.', {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Finance Menu', callback_data: 'menu_finance' }]] }
                });
                return;
            }

            let msg = '💳 *Active Subscriptions*\n\n';
            let totalMonthly = 0;
            subs.forEach((sub) => {
                msg += `*${sub.name}*\n`;
                msg += `₹${Number(sub.amount).toFixed(2)} / ${sub.frequency}\n\n`;

                // Extremely basic normalization for display purposes
                if (sub.frequency.toUpperCase().includes('MONTH')) {
                    totalMonthly += Number(sub.amount) / (parseInt(sub.frequency) || 1);
                } else if (sub.frequency.toUpperCase().includes('YEAR')) {
                    totalMonthly += Number(sub.amount) / 12;
                }
            });
            msg += `\n📊 *Est. Monthly Cost:* ₹${totalMonthly.toFixed(2)}`;

            await bot.editMessageText(msg, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Finance Menu', callback_data: 'menu_finance' }]] }
            });
        } else if (data === 'fin_friends') {
            bot.editMessageText('Fetching your friends list...', { chat_id: chatId, message_id: query.message.message_id });

            const { data: friends, error } = await supabase.from('friends').select('*').order('name', { ascending: true });

            if (error || !friends || friends.length === 0) {
                await bot.editMessageText('👥 *Friends & Splits*\n\nNo friends found. Please add them on the web app.', {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Finance Menu', callback_data: 'menu_finance' }]] }
                });
                return;
            }

            let msg = '👥 *Friends & Splits*\n\n';
            friends.forEach((friend) => {
                const bal = Number(friend.netBalance);
                const status = bal > 0 ? `🟢 Owes you ₹${bal.toFixed(2)}` : bal < 0 ? `🔴 You owe ₹${Math.abs(bal).toFixed(2)}` : '⚪ Settled up';
                msg += `*${friend.name}*: ${status}\n`;
            });

            // Note: Since Split bills involve complex calculations and multiple participants, it's safer to just let the user view balances on the bot.
            msg += `\n_Note: Use the web app to add complex split bills._`;

            await bot.editMessageText(msg, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Finance Menu', callback_data: 'menu_finance' }]] }
            });
        }
    } catch (error) {
        console.error('Error handling callback:', error);
        bot.sendMessage(chatId, 'Sorry, there was an error processing your request.');
    }
});

// Delete the previous menu if there is one active for the user
bot.onText(/\/menu/, async (msg) => {
    if (!isAuthorized(msg)) return;
    const chatId = msg.chat.id.toString();

    // Delete existing menu if present
    if (activeMenus[chatId]) {
        try {
            await bot.deleteMessage(chatId, activeMenus[chatId]);
        } catch (e) {
            // Message might already be deleted or too old
        }
        delete activeMenus[chatId];
    }

    try {
        const sentMsg = await bot.sendMessage(chatId, '🤖 *LifeSync AI Bot*\n\nSelect an option below or type a message:', {
            parse_mode: 'Markdown',
            reply_markup: getMainMenuKeyboard() as any
        });

        activeMenus[chatId] = sentMsg.message_id;

        activeMenus[chatId] = sentMsg.message_id;

        // Auto delete after 1 minute of inactivity
        activeMenuTimeouts[chatId] = setTimeout(async () => {
            if (activeMenus[chatId] === sentMsg.message_id) {
                try {
                    await bot.deleteMessage(chatId, sentMsg.message_id);
                } catch (e) { }
                delete activeMenus[chatId];
                delete activeMenuTimeouts[chatId];
            }
        }, 60000);
    } catch (error) {
        console.error('Error sending menu:', error);
    }
});

// View reminders
bot.onText(/\/reminders/, async (msg) => {
    if (!isAuthorized(msg)) return;
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, 'Fetching reminders...');

    try {
        const { data, error } = await supabase
            .from('reminders')
            .select('*')
            .eq('isDone', false)
            .order('dueDate', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            bot.sendMessage(chatId, 'You have no pending reminders! 🎉');
            return;
        }

        let response = '*Your Pending Reminders:*\n\n';
        data.forEach((r: Reminder, index: number) => {
            const date = new Date(r.dueDate);
            const isOverdue = date < new Date();
            const dateStr = isOverdue ? `⚠️ *OVERDUE: ${date.toLocaleDateString()}*` : date.toLocaleDateString();
            response += `${index + 1}. *${r.title}*\n`;
            response += `   📅 ${dateStr}\n`;
            response += `   🏷️ ${r.category}\n`;
            response += `   ID: \`${r.id}\`\n\n`;
        });

        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Sorry, there was an error fetching your reminders.');
    }
});

// Add reminder (Format: /addreminder Buy Milk | 2024-12-31)
bot.onText(/\/addreminder (.+)/, async (msg, match) => {
    if (!isAuthorized(msg)) return;
    const chatId = msg.chat.id;

    if (!match || !match[1]) {
        bot.sendMessage(chatId, 'Please provide the details. Format: /addreminder [Title] | [Date YYYY-MM-DD]\nExample: /addreminder Buy Groceries | 2024-05-20');
        return;
    }

    const parts = match[1].split('|').map(p => p.trim());
    const title = parts[0];
    const dateStr = parts.length > 1 ? parts[1] : '';

    if (!title) {
        bot.sendMessage(chatId, 'Please provide a title for the reminder.');
        return;
    }

    let finalDate = new Date();

    if (dateStr) {
        // Try to parse the date
        finalDate = new Date(dateStr);
        if (isNaN(finalDate.getTime())) {
            bot.sendMessage(chatId, 'Invalid date format. Please use YYYY-MM-DD. Example: 2024-05-20');
            return;
        }
    } else {
        // Default to end of today if no date provided
        finalDate.setHours(23, 59, 59, 999);
    }

    const newReminder = {
        id: crypto.randomUUID(),
        title,
        description: 'Added via Telegram Bot',
        dueDate: finalDate.toISOString(),
        category: ReminderCategory.GENERAL,
        isDone: false
    };

    try {
        const { error } = await supabase
            .from('reminders')
            .insert([newReminder]);

        if (error) throw error;

        bot.sendMessage(chatId, `✅ Reminder added successfully!\n*${title}* due on ${finalDate.toLocaleDateString()}`, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Sorry, there was an error adding the reminder.');
    }
});

// Mark reminder as done
bot.onText(/\/done (.+)/, async (msg, match) => {
    if (!isAuthorized(msg)) return;
    const chatId = msg.chat.id;

    if (!match || !match[1]) {
        bot.sendMessage(chatId, 'Please provide the reminder ID. You can find it by typing /reminders\nUsage: /done [ID]');
        return;
    }

    const reminderId = match[1].trim();

    try {
        const { error } = await supabase
            .from('reminders')
            .update({ isDone: true })
            .eq('id', reminderId);

        if (error) throw error;

        bot.sendMessage(chatId, '✅ Reminder marked as complete!');
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Sorry, there was an error updating the reminder.');
    }
});

// Snooze reminder
bot.onText(/\/snooze (.+) (\d+)/, async (msg, match) => {
    if (!isAuthorized(msg)) return;
    const chatId = msg.chat.id;

    if (!match || !match[1] || !match[2]) {
        bot.sendMessage(chatId, 'Format: /snooze [ID] [hours]\nExample: /snooze 123-abc 24');
        return;
    }

    const reminderId = match[1].trim();
    const hours = parseInt(match[2].trim());

    if (isNaN(hours) || hours <= 0) {
        bot.sendMessage(chatId, 'Please provide a valid number of hours.');
        return;
    }

    try {
        // 1. Fetch current reminder
        const { data: reminder, error: fetchError } = await supabase
            .from('reminders')
            .select('*')
            .eq('id', reminderId)
            .single();

        if (fetchError || !reminder) {
            bot.sendMessage(chatId, 'Reminder not found. Check ID with /reminders');
            return;
        }

        // 2. Add hours to dueDate
        const currentDue = new Date(reminder.dueDate);
        currentDue.setHours(currentDue.getHours() + hours);

        // 3. Update reminder
        const { error: updateError } = await supabase
            .from('reminders')
            .update({ dueDate: currentDue.toISOString() })
            .eq('id', reminderId);

        if (updateError) throw updateError;

        bot.sendMessage(chatId, `💤 Snoozed! New due date: ${currentDue.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Sorry, there was an error snoozing the reminder.');
    }
});

// Setup Notification Polling
const notifiedReminders = new Set<string>();

const checkUpcomingReminders = async () => {
    if (!ownerId) return;

    try {
        const now = new Date();
        const lookAhead = new Date(now.getTime() + 65 * 60 * 1000); // look ahead for 1 hr + 5 mins

        // Fetch reminders that are due within our window, including past overdue ones
        const { data: dueReminders, error } = await supabase
            .from('reminders')
            .select('*')
            .eq('isDone', false)
            .lte('dueDate', lookAhead.toISOString());

        if (error) {
            console.error('Error polling reminders:', error);
            return;
        }

        if (dueReminders && dueReminders.length > 0) {
            for (const r of dueReminders) {
                const dueDate = new Date(r.dueDate).getTime();
                const timeDiff = dueDate - now.getTime();
                const minutesUntil = Math.round(timeDiff / (1000 * 60));

                let notifyType: number | null = null;

                // If it's 0 or overdue, we consider it a '0' notification
                if (minutesUntil <= 0) {
                    notifyType = 0;
                } else if (minutesUntil === 5) {
                    notifyType = 5;
                } else if (minutesUntil === 30) {
                    notifyType = 30;
                } else if (minutesUntil === 60) {
                    notifyType = 60;
                }

                if (notifyType !== null) {
                    const notifKey = `${r.id}_${notifyType}`;
                    if (!notifiedReminders.has(notifKey)) {
                        notifiedReminders.add(notifKey);

                        const titleText = notifyType === 0 ? `🔔 *REMINDER DUE NOW/OVERDUE*` : `🔔 *Upcoming Reminder in ${notifyType} mins!*`;

                        bot.sendMessage(ownerId, `${titleText}\n\n*${r.title}*`, {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '✔️ Mark Done', callback_data: `action_done_${r.id}` }],
                                    [
                                        { text: '💤 10m', callback_data: `action_snooze_${r.id}_10` },
                                        { text: '💤 30m', callback_data: `action_snooze_${r.id}_30` },
                                        { text: '💤 1h', callback_data: `action_snooze_${r.id}_60` }
                                    ],
                                    [
                                        { text: '💤 1d', callback_data: `action_snooze_${r.id}_1440` },
                                        { text: '💤 Custom (hrs)', callback_data: `action_customsnooze_${r.id}` }
                                    ]
                                ]
                            }
                        }).catch(console.error);
                    }
                }
            }
        }
    } catch (e) {
        console.error('Polling error', e);
    }
};

let lastWaterReminderDate = '';
let lastWaterReminderHour = -1;
let lastWakePromptDate = '';
let lastSleepPromptDate = '';

const checkDailyPrompts = async () => {
    if (!ownerId) return;
    const { hour, todayStr } = getISTDateInfo();

    // 6 AM Wake Up Prompt
    if (hour >= 6 && hour < 10 && lastWakePromptDate !== todayStr) {
        // Only ask if wake_up_time is null
        const { data: habit } = await supabase.from('daily_habits').select('*').eq('date', todayStr).single();
        if (!habit || !habit.wake_up_time) {
            lastWakePromptDate = todayStr;
            bot.sendMessage(ownerId, `🌅 *Good Morning!*\n\nDid you wake up?`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🌅 I just woke up now', callback_data: 'action_wake_up_now' }]
                    ]
                }
            }).catch(console.error);
        } else {
            // Already set via web or bot, don't ask again today
            lastWakePromptDate = todayStr;
        }
    }

    // 11 PM Sleep Prompt
    if (hour >= 23 && lastSleepPromptDate !== todayStr) {
        const { data: habit } = await supabase.from('daily_habits').select('*').eq('date', todayStr).single();
        if (habit && habit.wake_up_time && !habit.sleep_time) {
            lastSleepPromptDate = todayStr;
            bot.sendMessage(ownerId, `🌙 *Evening Check-in*\n\nIt's past 11 PM. Are you going to sleep?`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✔️ Yes, sleep now', callback_data: 'action_sleep_now' }],
                        [{ text: '❌ Not yet', callback_data: 'action_sleep_not_yet' }]
                    ]
                }
            }).catch(console.error);
        } else {
            lastSleepPromptDate = todayStr;
        }
    }
}

const checkWaterIntake = async () => {
    if (!ownerId) return;

    const { hour, todayStr } = getISTDateInfo();

    // Fetch today's habit
    const { data: habit } = await supabase.from('daily_habits').select('*').eq('date', todayStr).single();

    // If not awake yet, or already asleep, do not send water reminders
    if (!habit || !habit.wake_up_time || habit.sleep_time) return;

    // Calculate exact minutes since wake up
    const [wakeHourTemp, wakeMinTemp] = habit.wake_up_time.split(':').map(Number);
    const wakeTimeInMins = wakeHourTemp * 60 + wakeMinTemp;

    const { minute } = getISTDateInfo();
    const currentTimeInMins = hour * 60 + minute;

    const minutesSinceWake = currentTimeInMins - wakeTimeInMins;

    // Trigger exactly every 2 hours (120 mins). We allow a small 1-minute window
    // since we poll every minute.
    if (minutesSinceWake > 0 && minutesSinceWake % 120 === 0) {
        if (lastWaterReminderDate !== todayStr || lastWaterReminderHour !== hour) {
            lastWaterReminderDate = todayStr;
            lastWaterReminderHour = hour;

            bot.sendMessage(ownerId, `💧 *Time to drink water!*\n\nStay hydrated!`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✔️ Taken', callback_data: 'action_add_water' }, { text: '⏭️ Skip', callback_data: 'action_skip_water' }]
                    ]
                }
            }).catch(console.error);
        }
    }
};

// Start Polling every 1 minute
setInterval(() => {
    checkUpcomingReminders();
    checkDailyPrompts();
    checkWaterIntake();
}, 60 * 1000);

// Error handling polling errors
bot.on('polling_error', (error) => {
    console.log(error);
});
