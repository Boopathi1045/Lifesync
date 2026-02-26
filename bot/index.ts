import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
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
}
const userStates: Record<string, UserState> = {};

// Middleware to check if the user is authorized
const isAuthorized = (msg: TelegramBot.Message): boolean => {
    if (!ownerId) {
        // If ownerId is not set, allow and log the ID so user can add it to .env
        console.log(`Received message from ID: ${msg.chat.id}. You can add this to TELEGRAM_USER_ID in .env`);
        return true; // Wait for the first message to capture ID
    }
    return msg.chat.id.toString() === ownerId;
};

// Catch-all message handler for conversational flows
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return; // Ignore commands
    if (!isAuthorized(msg)) return;

    const chatId = msg.chat.id.toString();
    const state = userStates[chatId];
    if (!state) {
        // Unhandled text outside of a flow triggers the main menu
        bot.sendMessage(chatId, 'Welcome to LifeSync Bot! 🚀\n\n🌐 *Web App URL:* https://lifesync-sand.vercel.app/\nPlease select a module below to get started:', getMainMenuKeyboard());
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
        const newTx = {
            id: crypto.randomUUID(),
            amount: state.amount,
            purpose: state.purpose,
            date: new Date().toISOString().split('T')[0],
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
        userStates[chatId].dateStr = dateStr !== 'none' && dateStr !== 'today' ? dateStr : finalDate.toISOString().split('T')[0];
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
                bot.sendMessage(chatId, `✅ Reminder added successfully!\n*${state.title}* due on ${finalDate.toLocaleString()}`, {
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

        const newItem = {
            id: crypto.randomUUID(),
            title: 'Saved from Telegram',
            link: url,
            isWatched: false,
            dateAdded: new Date().toISOString()
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
    const chatId = msg.chat.id;

    if (ownerId && chatId.toString() !== ownerId) {
        bot.sendMessage(chatId, 'Sorry, you are not authorized to use this bot.');
        return;
    }

    const welcomeMessage = `
Welcome to LifeSync Bot! 🚀

🌐 *Web App URL:* https://lifesync-sand.vercel.app/
Please select a module below to get started:
`;

    bot.sendMessage(chatId, welcomeMessage, getMainMenuKeyboard());
});

// Help command
bot.onText(/\/help/, (msg) => {
    if (!isAuthorized(msg)) return;
    bot.sendMessage(msg.chat.id, 'Use /menu or /start to open the interactive menu!');
});

// Handle button clicks
bot.on('callback_query', async (query) => {
    if (!query.message || !query.data) return;
    const chatId = query.message.chat.id;

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
            const todayStr = new Date().toISOString().split('T')[0];
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

            const todayStr = new Date().toISOString().split('T')[0];
            const { data: habit } = await supabase
                .from('daily_habits')
                .select('*')
                .eq('date', todayStr)
                .single();

            const waterIntake = habit ? habit.water_intake : 0;
            const progress = '💧'.repeat(waterIntake) + '⚪'.repeat(Math.max(0, 8 - waterIntake));

            const habitMsg = `
💧 *Habit Tracker (Today)*

*Water Intake:* ${waterIntake} / 8 glasses
${progress}
            `;

            await bot.editMessageText(habitMsg, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '➕ Add 1 Water', callback_data: 'action_add_water' }, { text: '➖ Skip', callback_data: 'action_skip_water' }],
                        [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        } else if (data === 'action_add_water' || data === 'action_skip_water') {
            const todayStr = new Date().toISOString().split('T')[0];
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

            // Re-render habit menu
            const progress = '💧'.repeat(newIntake) + '⚪'.repeat(Math.max(0, 8 - newIntake));
            const habitMsg = `
💧 *Habit Tracker (Today)*

*Water Intake:* ${newIntake} / 8 glasses
${progress}
            `;

            await bot.editMessageText(habitMsg, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '➕ Add 1 Water', callback_data: 'action_add_water' }, { text: '➖ Skip', callback_data: 'action_skip_water' }],
                        [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
                    ]
                }
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

        bot.sendMessage(chatId, `💤 Snoozed! New due date: ${currentDue.toLocaleString()}`);
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

const checkWaterIntake = () => {
    if (!ownerId) return;

    const now = new Date();
    const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istDate = new Date(istString);
    const hour = istDate.getHours();

    const allowedHours = [11, 13, 15, 17, 19, 21, 23];

    // Find the currently active block
    let targetHour = -1;
    for (let i = allowedHours.length - 1; i >= 0; i--) {
        if (hour >= allowedHours[i]) {
            targetHour = allowedHours[i];
            break;
        }
    }

    // Notify if we are within an active block and haven't notified for it today
    if (targetHour !== -1) {
        const dateKey = istDate.toISOString().split('T')[0];
        if (lastWaterReminderDate !== dateKey || lastWaterReminderHour !== targetHour) {
            lastWaterReminderDate = dateKey;
            lastWaterReminderHour = targetHour;

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
    checkWaterIntake();
}, 60 * 1000);

// Error handling polling errors
bot.on('polling_error', (error) => {
    console.log(error);
});
