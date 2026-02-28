import { supabase } from './supabase';
import axios from 'axios';

// Helper to get consistent IST current date/time
function getISTDateInfo() {
    const now = new Date();
    const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istDate = new Date(istString);
    const year = istDate.getFullYear();
    const month = String(istDate.getMonth() + 1).padStart(2, '0');
    const day = String(istDate.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    return {
        istDate,
        todayStr,
        hour: istDate.getHours(),
        minute: istDate.getMinutes()
    };
}

// Helper to resolve an account from a hint
async function resolveAccount(hint: string | undefined): Promise<string | null> {
    const { data: accounts } = await supabase.from('accounts').select('id, name');
    if (!accounts || accounts.length === 0) return null;

    if (!hint) {
        return accounts[0].id;
    }

    const match = accounts.find(a => a.name.toLowerCase().includes(hint.toLowerCase()));
    if (match) return match.id;

    return accounts[0].id; // Fallback
}

export interface ExecuteResult {
    success: boolean;
    message: string;
    requiresConfirmation?: boolean;
    pendingAction?: {
        action: string;
        actionId: string;
        payload?: any;
    };
}

export async function executeIntent(aiResult: any, inputText: string): Promise<ExecuteResult> {
    const intent = aiResult.intent;

    try {
        if ((intent === 'ADD_TRANSACTION' || intent === 'ADD_INCOME' || intent === 'ADD_EXPENSE') && aiResult.transaction) {
            const tx = aiResult.transaction;
            if (!tx.amount || !tx.purpose) return { success: false, message: "Please specify the exact amount and purpose for the transaction." };

            const accountId = await resolveAccount(tx.accountHint);
            if (!accountId) return { success: false, message: "You need to create at least one account in the web app first." };

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

            return { success: true, message: `✅ Logged ${txType} of ₹${tx.amount} for "${tx.purpose}".` };
        }
        else if (intent === 'ADD_TRANSFER' && aiResult.transaction) {
            const tx = aiResult.transaction;
            if (!tx.amount || !tx.toAccountHint) return { success: false, message: "I need both an amount and a destination account for a transfer." };

            const fromAccountId = await resolveAccount(tx.accountHint);
            const toAccountId = await resolveAccount(tx.toAccountHint);

            if (!fromAccountId || !toAccountId) return { success: false, message: "I couldn't confidently identify both accounts. Please verify your account names." };

            const { todayStr } = getISTDateInfo();
            const newTx = { id: crypto.randomUUID(), amount: tx.amount, purpose: tx.purpose || 'Transfer', date: todayStr, type: 'TRANSFER', accountId: fromAccountId, toAccountId: toAccountId };
            await supabase.from('transactions').insert([newTx]);

            const { data: fromAcc } = await supabase.from('accounts').select('balance, totalOutflow').eq('id', fromAccountId).single();
            if (fromAcc) await supabase.from('accounts').update({ balance: Number(fromAcc.balance) - Number(tx.amount), totalOutflow: Number(fromAcc.totalOutflow) + Number(tx.amount) }).eq('id', fromAccountId);

            const { data: toAcc } = await supabase.from('accounts').select('balance, totalInflow').eq('id', toAccountId).single();
            if (toAcc) await supabase.from('accounts').update({ balance: Number(toAcc.balance) + Number(tx.amount), totalInflow: Number(toAcc.totalInflow) + Number(tx.amount) }).eq('id', toAccountId);

            return { success: true, message: `✅ Transferred ₹${tx.amount}.` };
        }
        else if (intent === 'DELETE_TRANSACTION' && aiResult.actionId) {
            const keyword = aiResult.actionId.toLowerCase();
            const { data: txs } = await supabase.from('transactions').select('*').order('date', { ascending: false }).limit(20);
            const match = txs?.find(t => t.purpose.toLowerCase().includes(keyword));
            if (!match) return { success: false, message: `Couldn't find a matching transaction recently for '${aiResult.actionId}'.` };

            return {
                success: true,
                message: `⚠️ Delete transaction: *${match.purpose}* (₹${match.amount})?`,
                requiresConfirmation: true,
                pendingAction: { action: 'delete_transaction', actionId: match.id }
            };
        }
        else if (intent === 'LIST_TRANSACTIONS') {
            const { data: txs } = await supabase.from('transactions').select('*').order('date', { ascending: false }).limit(5);
            if (!txs || txs.length === 0) return { success: true, message: "No recent transactions found." };
            let msg = '📋 *Recent Transactions*\n\n';
            txs.forEach(t => { msg += `${t.type === 'EXPENSE' ? '📉' : (t.type === 'INCOME' ? '📈' : '🔄')} *${t.purpose}*\nAmount: ₹${t.amount} | Date: ${new Date(t.date).toLocaleDateString()}\n\n`; });
            return { success: true, message: msg };
        }
        else if (intent === 'GET_FINANCE_OVERVIEW') {
            const { data: accs } = await supabase.from('accounts').select('*');
            let totalBal = 0; accs?.forEach(a => totalBal += Number(a.balance));
            return { success: true, message: `💰 *Finance Overview*\n\nTotal Balance: ₹${totalBal.toFixed(2)}\nTotal Accounts: ${accs?.length || 0}` };
        }
        else if (intent === 'LIST_ACCOUNTS') {
            const { data: accs } = await supabase.from('accounts').select('*').order('name');
            if (!accs || accs.length === 0) return { success: true, message: "No accounts found." };
            let msg = '🏦 *Your Accounts*\n\n';
            accs.forEach(a => { msg += `• *${a.name}* (${a.type}): ₹${a.balance}\n`; });
            return { success: true, message: msg };
        }
        else if (intent === 'ADD_ACCOUNT' && aiResult.account) {
            const a = aiResult.account;
            if (!a.name || a.balance === undefined) return { success: false, message: "Please provide the account name and initial balance." };
            const newAcc = { id: crypto.randomUUID(), name: a.name, type: a.type || 'Bank Account', balance: a.balance, totalInflow: 0, totalOutflow: 0 };
            await supabase.from('accounts').insert([newAcc]);
            return { success: true, message: `✅ Account *${a.name}* created with ₹${a.balance}.` };
        }
        else if (intent === 'DELETE_ACCOUNT' && aiResult.actionId) {
            const keyword = aiResult.actionId.toLowerCase();
            const { data: accs } = await supabase.from('accounts').select('*');
            const match = accs?.find(a => a.name.toLowerCase().includes(keyword));
            if (!match) return { success: false, message: `Couldn't find an account matching '${aiResult.actionId}'.` };

            return {
                success: true,
                message: `⚠️ Delete account: *${match.name}*? All its transactions might be affected.`,
                requiresConfirmation: true,
                pendingAction: { action: 'delete_account', actionId: match.id }
            };
        }
        else if (intent === 'MODIFY_BALANCE' && aiResult.account && aiResult.actionId) {
            const keyword = aiResult.actionId.toLowerCase();
            const { data: accs } = await supabase.from('accounts').select('*');
            const match = accs?.find(a => a.name.toLowerCase().includes(keyword));
            if (!match) return { success: false, message: `Couldn't find an account matching '${aiResult.actionId}'.` };
            const newBal = aiResult.account.balance !== undefined ? aiResult.account.balance : 0;

            return {
                success: true,
                message: `⚠️ Update balance of *${match.name}* from ₹${match.balance} to ₹${newBal}?`,
                requiresConfirmation: true,
                pendingAction: { action: 'modify_balance', actionId: match.id, payload: { balance: newBal } }
            };
        }
        else if (intent === 'ADD_REMINDER' && aiResult.reminder) {
            const r = aiResult.reminder;
            if (!r.title) return { success: false, message: "I caught the reminder intent, but what exactly should I remind you about?" };

            let finalDate = new Date();
            if (r.dateStr) {
                const parsed = new Date(r.dateStr);
                if (!isNaN(parsed.getTime())) finalDate = parsed;
            } else {
                finalDate.setHours(23, 59, 59, 999);
            }

            const newReminder = { id: crypto.randomUUID(), title: r.title, description: 'Added via AI Assistant', dueDate: finalDate.toISOString(), category: 'GENERAL', isDone: false };
            await supabase.from('reminders').insert([newReminder]);

            return { success: true, message: `✅ Set reminder: *${r.title}* for ${finalDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}` };
        }
        else if (intent === 'LIST_REMINDERS') {
            const { data: rems } = await supabase.from('reminders').select('*').eq('isDone', false).order('dueDate', { ascending: true }).limit(5);
            if (!rems || rems.length === 0) return { success: true, message: "You have no pending reminders." };
            let msg = '🔔 *Upcoming Reminders*\n\n';
            rems.forEach(r => { msg += `• *${r.title}* - ${new Date(r.dueDate).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}\n`; });
            return { success: true, message: msg };
        }
        else if (intent === 'DELETE_REMINDER' && aiResult.actionId) {
            const keyword = aiResult.actionId.toLowerCase();
            const { data: rems } = await supabase.from('reminders').select('*').eq('isDone', false).order('dueDate', { ascending: true }).limit(20);
            const match = rems?.find(r => r.title.toLowerCase().includes(keyword));
            if (!match) return { success: false, message: `Couldn't find a pending reminder matching '${aiResult.actionId}'.` };

            return {
                success: true,
                message: `⚠️ Delete reminder: *${match.title}*?`,
                requiresConfirmation: true,
                pendingAction: { action: 'delete_reminder', actionId: match.id }
            };
        }
        else if (intent === 'EDIT_REMINDER' && aiResult.reminder && aiResult.actionId) {
            const keyword = aiResult.actionId.toLowerCase();
            const { data: rems } = await supabase.from('reminders').select('*').eq('isDone', false).order('dueDate', { ascending: true }).limit(20);
            const match = rems?.find(r => r.title.toLowerCase().includes(keyword));
            if (!match) return { success: false, message: `Couldn't find a pending reminder matching '${aiResult.actionId}'.` };

            const updates: any = {};
            if (aiResult.reminder.newTitle) updates.title = aiResult.reminder.newTitle;
            if (aiResult.reminder.newDateStr) {
                const parsed = new Date(aiResult.reminder.newDateStr);
                if (!isNaN(parsed.getTime())) updates.dueDate = parsed.toISOString();
            }

            if (Object.keys(updates).length > 0) {
                return {
                    success: true,
                    message: `⚠️ Update reminder: *${match.title}*?`,
                    requiresConfirmation: true,
                    pendingAction: { action: 'edit_reminder', actionId: match.id, payload: updates }
                };
            } else {
                return { success: false, message: `I found the reminder but didn't catch what you wanted to change.` };
            }
        }
        else if (intent === 'ADD_WATCH_LATER' && aiResult.watchLater) {
            const url = aiResult.watchLater.url || inputText;
            if (!url.startsWith('http')) return { success: false, message: "I didn't find a valid URL to save." };

            const { istDate } = getISTDateInfo();
            let extractedTitle = aiResult.watchLater.title || 'Saved via AI';

            if (extractedTitle === 'Saved via AI') {
                try {
                    const response = await axios.get(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { timeout: 3000 });
                    const match = response.data.contents.match(/<title>(.*?)<\/title>/i);
                    if (match && match[1]) extractedTitle = match[1].trim();
                } catch (e) {
                    // Ignore CORS or fetch issues
                }
            }

            const newItem = { id: crypto.randomUUID(), title: extractedTitle, link: url, isWatched: false, dateAdded: istDate.toISOString() };
            await supabase.from('media_items').insert([newItem]);

            return { success: true, message: `✅ Saved to Watch Later: *${extractedTitle}*` };
        }
        else if (intent === 'ADD_PASSWORD' && aiResult.password) {
            const p = aiResult.password;
            if (!p.service || (!p.username && !p.password)) return { success: false, message: "I need at least the service name and either the username or password." };

            const newPwd = { id: crypto.randomUUID(), service: p.service, username: p.username || 'Unknown', passwordString: p.password || 'Unknown', notes: 'Added via AI' };
            await supabase.from('passwords').insert([newPwd]);

            return { success: true, message: `✅ Saved credentials for *${p.service}*!` };
        }
        else if (intent === 'ADD_WATER' && aiResult.habit) {
            const glasses = aiResult.habit.glasses || 1;
            const { todayStr } = getISTDateInfo();
            const { data: habit } = await supabase.from('daily_habits').select('*').eq('date', todayStr).single();
            const newIntake = (habit ? habit.water_intake : 0) + glasses;

            await supabase.from('daily_habits').upsert({ date: todayStr, water_intake: newIntake });
            return { success: true, message: `💧 Added ${glasses} glass(es). Total today: ${newIntake}/8 glasses.` };
        }
        else if (intent === 'SET_WAKEUP' && aiResult.habit?.time) {
            const timeStr = aiResult.habit.time;
            const { todayStr } = getISTDateInfo();
            await supabase.from('daily_habits').upsert({ date: todayStr, wake_up_time: timeStr }, { onConflict: 'date' });
            return { success: true, message: `🌅 Got it! Wake up time set to ${timeStr}.` };
        }
        else if (intent === 'SET_SLEEP' && aiResult.habit?.time) {
            const timeStr = aiResult.habit.time;
            const { todayStr } = getISTDateInfo();
            await supabase.from('daily_habits').upsert({ date: todayStr, sleep_time: timeStr }, { onConflict: 'date' });
            return { success: true, message: `🌙 Sleep well! Logged sleep time as ${timeStr}.` };
        }
        else if (intent === 'START_NAP') {
            return { success: true, message: `Nap started... sleep well! 💤\n(Note: In the Web AI, we will ask you to go to the Habit Tracker menu to stop the nap to ensure exact timing!)` };
        }
        else if (intent === 'END_NAP') {
            return { success: true, message: `✅ I see you've ended a nap. Please ensure you update the Habit Tracker to reflect exact times.` };
        }
        else if (intent === 'ADD_NAP') {
            return { success: true, message: `Please use the explicit Habit Tracker menu to start and end your naps, so the exact times are logged accurately.` };
        }
        else if (intent === 'UPDATE_HABIT_COUNT') {
            const count = aiResult.habit?.count || 1;
            const { todayStr } = getISTDateInfo();
            const { data: habit } = await supabase.from('daily_habits').select('*').eq('date', todayStr).single();
            const newIntake = (habit ? habit.water_intake : 0) + count;
            await supabase.from('daily_habits').upsert({ date: todayStr, water_intake: newIntake });
            return { success: true, message: `✅ Updated habit count. Total today: ${newIntake}.` };
        }
        else if (intent === 'VIEW_HABIT_COUNT') {
            const { todayStr } = getISTDateInfo();
            const { data: habit } = await supabase.from('daily_habits').select('*').eq('date', todayStr).single();
            return { success: true, message: `💧 You've had ${habit?.water_intake || 0}/8 glasses of water today.` };
        }
        else if (intent === 'ADD_SUB' && aiResult.subscription) {
            const s = aiResult.subscription;
            if (!s.name || !s.amount) return { success: false, message: "Please specify the subscription name and amount." };

            const newSub = { id: crypto.randomUUID(), name: s.name, cost: s.amount, frequency: s.frequency || '1 MONTH', nextBillingDate: new Date().toISOString() };
            await supabase.from('subscriptions').insert([newSub]);

            return { success: true, message: `✅ Added subscription: *${s.name}* (₹${s.amount})` };
        }
        else if (intent === 'LIST_SUBS') {
            const { data: subs } = await supabase.from('subscriptions').select('*');
            if (!subs || subs.length === 0) return { success: true, message: "No active subscriptions." };
            let msg = '💳 *Subscriptions*\n\n';
            subs.forEach(s => msg += `• *${s.name}* - ₹${s.cost} (${s.frequency})\n`);
            return { success: true, message: msg };
        }
        else if (intent === 'DELETE_SUB' && aiResult.actionId) {
            const keyword = aiResult.actionId.toLowerCase();
            const { data: subs } = await supabase.from('subscriptions').select('*');
            const match = subs?.find(s => s.name.toLowerCase().includes(keyword));
            if (!match) return { success: false, message: `Couldn't find subscription matching '${aiResult.actionId}'.` };

            return {
                success: true,
                message: `⚠️ Delete subscription: *${match.name}*?`,
                requiresConfirmation: true,
                pendingAction: { action: 'delete_sub', actionId: match.id }
            };
        }
        else if (intent === 'ADD_FRIEND' && aiResult.split?.friendName) {
            const newFriend = { id: crypto.randomUUID(), name: aiResult.split.friendName, totalOwed: 0 };
            await supabase.from('friends').insert([newFriend]);
            return { success: true, message: `✅ Added friend: *${newFriend.name}*` };
        }
        else if (intent === 'ADD_SPLIT' && aiResult.split) {
            const s = aiResult.split;
            if (!s.friendName || !s.amount) return { success: false, message: "Please specify the friend name and amount." };

            const { data: friends } = await supabase.from('friends').select('*');
            const match = friends?.find(f => f.name.toLowerCase().includes(s.friendName.toLowerCase()));
            if (!match) return { success: false, message: `Couldn't find friend '${s.friendName}'. Please add them first.` };

            const newSplit = { id: crypto.randomUUID(), friendId: match.id, description: s.description || 'Split via AI', amount: s.amount, isPaid: false };
            await supabase.from('splits').insert([newSplit]);
            await supabase.from('friends').update({ totalOwed: Number(match.totalOwed) + Number(s.amount) }).eq('id', match.id);

            return { success: true, message: `✅ Logged split: ₹${s.amount} with *${match.name}* for "${newSplit.description}".` };
        }
        else if (intent === 'VIEW_SPLITS') {
            const { data: friends } = await supabase.from('friends').select('*');
            if (!friends || friends.length === 0) return { success: true, message: "No friends or splits found." };
            let msg = '👥 *Friends & Splits*\n\n';
            friends.forEach(f => msg += `• *${f.name}*: owes ₹${f.totalOwed}\n`);
            return { success: true, message: msg };
        }

        // Catch all for informational or unmatched
        if (aiResult.replyText) {
            return { success: true, message: aiResult.replyText };
        }

        return { success: false, message: "I'm not exactly sure what to do with that. You can tell me to add a transaction, save a reminder, etc." };

    } catch (error: any) {
        console.error("Execute Intent Error:", error);
        return { success: false, message: "⚠️ Sorry, I encountered an issue processing your request. Please ensure the API keys are correct, or try again later." };
    }
}
