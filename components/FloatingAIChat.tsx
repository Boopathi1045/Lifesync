import React, { useState, useRef, useEffect } from 'react';
import { parseIntentFromText, ChatTurn } from '../lib/aiClient';
import { executeIntent, ExecuteResult } from '../lib/executeIntent';
import { supabase } from '../lib/supabase';

const FloatingAIChat: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string; isConfirmation?: boolean }[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [pendingAction, setPendingAction] = useState<ExecuteResult['pendingAction'] | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of chat
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
            // Initial greeting if empty
            if (messages.length === 0) {
                setMessages([{ role: 'model', text: "Hi! I'm your LifeSync AI Assistant. How can I help you today? Try saying 'Add 500rs for lunch' or 'Remind me to call John tomorrow'." }]);
            }
        }
    }, [messages, isOpen]);

    useEffect(() => {
        // scroll to bottom whenever messages or typing state changes
        scrollToBottom();
    }, [messages, isTyping, pendingAction]);

    const handleSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim()) return;

        const userText = input.trim();
        setInput('');

        // If there was a pending action and the user typed something instead of clicking Yes/No, cancel it
        if (pendingAction) {
            setPendingAction(null);
            setMessages(prev => [...prev, { role: 'model', text: 'Previous action cancelled.' }]);
        }

        setMessages(prev => [...prev, { role: 'user', text: userText }]);
        setIsTyping(true);

        try {
            // Format history for the AI client (keep last 4 turns context aware)
            const chatHistory: ChatTurn[] = messages
                .filter(m => !m.isConfirmation) // Exclude system confirmation UI notes from AI view
                .slice(-4).map(m => ({
                    role: m.role,
                    parts: [{ text: m.text }]
                }));

            // 1. Ask Gemini to extract intent
            const aiResult = await parseIntentFromText(userText, chatHistory);

            // 2. Execute the intent on the database
            const execResult = await executeIntent(aiResult, userText);

            // 3. Update UI
            if (execResult.requiresConfirmation && execResult.pendingAction) {
                setPendingAction(execResult.pendingAction);
                setMessages(prev => [...prev, { role: 'model', text: execResult.message, isConfirmation: true }]);
            } else {
                setMessages(prev => [...prev, { role: 'model', text: execResult.message }]);
            }
        } catch (error) {
            console.error("Chat Error:", error);
            setMessages(prev => [...prev, { role: 'model', text: "Sorry, I ran into an issue connecting to the servers." }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleConfirmAction = async (confirmed: boolean) => {
        if (!pendingAction) return;

        const actionToProcess = { ...pendingAction };
        setPendingAction(null); // Clear it immediately

        if (!confirmed) {
            setMessages(prev => [...prev, { role: 'user', text: 'No' }, { role: 'model', text: '❌ Action cancelled.' }]);
            return;
        }

        setMessages(prev => [...prev, { role: 'user', text: 'Yes' }]);
        setIsTyping(true);

        try {
            if (actionToProcess.action === 'delete_reminder') {
                await supabase.from('reminders').delete().eq('id', actionToProcess.actionId);
                setMessages(prev => [...prev, { role: 'model', text: '✅ Reminder deleted successfully.' }]);
            }
            else if (actionToProcess.action === 'delete_transaction') {
                await supabase.from('transactions').delete().eq('id', actionToProcess.actionId);
                setMessages(prev => [...prev, { role: 'model', text: '✅ Transaction deleted successfully.' }]);
            }
            else if (actionToProcess.action === 'delete_account') {
                await supabase.from('accounts').delete().eq('id', actionToProcess.actionId);
                setMessages(prev => [...prev, { role: 'model', text: '✅ Account deleted successfully.' }]);
            }
            else if (actionToProcess.action === 'delete_sub') {
                await supabase.from('subscriptions').delete().eq('id', actionToProcess.actionId);
                setMessages(prev => [...prev, { role: 'model', text: '✅ Subscription deleted successfully.' }]);
            }
            else if (actionToProcess.action === 'modify_balance') {
                await supabase.from('accounts').update({ balance: actionToProcess.payload?.balance }).eq('id', actionToProcess.actionId);
                setMessages(prev => [...prev, { role: 'model', text: `✅ Account balance updated to ₹${actionToProcess.payload?.balance}.` }]);
            }
            else if (actionToProcess.action === 'edit_reminder' && actionToProcess.payload) {
                await supabase.from('reminders').update(actionToProcess.payload).eq('id', actionToProcess.actionId);
                setMessages(prev => [...prev, { role: 'model', text: `✅ Reminder updated successfully.` }]);
            }
            else {
                setMessages(prev => [...prev, { role: 'model', text: '❌ Unknown action type.' }]);
            }

            // Force a slight delay to allow UI to catch up nicely with the API response
            await new Promise(r => setTimeout(r, 500));
        } catch (error) {
            console.error("Execution error", error);
            setMessages(prev => [...prev, { role: 'model', text: '❌ Failed to execute action on the database.' }]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end font-sans">
            {/* Chat Window */}
            {isOpen && (
                <div className="mb-4 w-[350px] sm:w-[400px] bg-[#0f172a]/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col transform transition-all duration-300 origin-bottom-right animate-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=closed]:opacity-0">
                    <div className="bg-primary p-4 flex justify-between items-center text-white">
                        <div className="flex items-center gap-3">
                            <div className="size-8 rounded-full bg-white/20 flex items-center justify-center">
                                <span className="material-symbols-rounded text-lg">smart_toy</span>
                            </div>
                            <div>
                                <h3 className="font-extrabold text-sm tracking-tight leading-tight">LifeSync AI</h3>
                                <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest">Online</p>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-white/70 hover:text-white transition-colors">
                            <span className="material-symbols-rounded">close</span>
                        </button>
                    </div>

                    <div className="h-[350px] p-4 overflow-y-auto custom-scrollbar flex flex-col gap-4 bg-gradient-to-b from-[#0f172a] to-slate-900 border-x border-white/5">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'self-end' : 'self-start'}`}>
                                <div className={`p-3 rounded-2xl text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-primary text-white rounded-br-sm' : 'bg-slate-800 text-slate-200 border border-white/5 rounded-bl-sm'}`}>
                                    {msg.text}
                                </div>

                                {/* Show confirmation buttons only on the very last message if pendingAction exists */}
                                {msg.isConfirmation && idx === messages.length - 1 && pendingAction && (
                                    <div className="flex gap-2 mt-1">
                                        <button
                                            onClick={() => handleConfirmAction(true)}
                                            className="px-4 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-bold hover:bg-emerald-500/30 transition-colors focus:ring-2 focus:ring-emerald-500/50"
                                        >
                                            Yes
                                        </button>
                                        <button
                                            onClick={() => handleConfirmAction(false)}
                                            className="px-4 py-1.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full text-xs font-bold hover:bg-rose-500/30 transition-colors focus:ring-2 focus:ring-rose-500/50"
                                        >
                                            No
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {isTyping && (
                            <div className="flex self-start max-w-[85%]">
                                <div className="p-4 rounded-2xl rounded-bl-sm bg-slate-800 border border-white/5 flex items-center gap-1.5">
                                    <div className="size-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                    <div className="size-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                    <div className="size-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-3 bg-slate-900 border-t border-white/10">
                        <form onSubmit={handleSend} className="relative flex items-center relative">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Message LifeSync AI..."
                                className="w-full bg-slate-800 border border-white/10 text-white placeholder-slate-500 rounded-full pl-5 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm transition-all shadow-inner"
                            />
                            <button
                                type="submit"
                                disabled={isTyping || !input.trim()}
                                className="absolute right-2 size-9 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <span className="material-symbols-rounded text-lg ml-0.5">send</span>
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`group relative size-14 md:size-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 ${isOpen ? 'bg-slate-800 text-white' : 'bg-primary text-white hover:bg-primary/90'}`}
            >
                {/* Ping animation behind button */}
                {!isOpen && (
                    <div className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-20 hidden md:block"></div>
                )}

                <span className={`material-symbols-rounded text-2xl md:text-3xl transition-transform duration-300 ${isOpen ? 'rotate-90 scale-0' : 'rotate-0 scale-100'}`}>
                    smart_toy
                </span>
                <span className={`material-symbols-rounded absolute text-2xl md:text-3xl transition-transform duration-300 ${isOpen ? 'rotate-0 scale-100' : '-rotate-90 scale-0'}`}>
                    close
                </span>
            </button>
        </div>
    );
};

export default FloatingAIChat;
