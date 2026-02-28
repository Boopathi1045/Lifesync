import React, { useState, useRef, useEffect } from 'react';
import { parseIntentFromText, ChatTurn } from '../lib/aiClient';
import { executeIntent } from '../lib/executeIntent';

const FloatingAIChat: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
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

    const handleSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim()) return;

        const userText = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userText }]);
        setIsTyping(true);

        try {
            // Format history for the AI client (keep last 4 turns context aware)
            const chatHistory: ChatTurn[] = messages.slice(-4).map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));

            // 1. Ask Gemini to extract intent
            const aiResult = await parseIntentFromText(userText, chatHistory);

            // 2. Execute the intent on the database
            const execResult = await executeIntent(aiResult, userText);

            // 3. Update UI
            setMessages(prev => [...prev, { role: 'model', text: execResult.message }]);
        } catch (error) {
            console.error("Chat Error:", error);
            setMessages(prev => [...prev, { role: 'model', text: "Sorry, I ran into an issue connecting to the servers." }]);
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
                            <div key={idx} className={`flex max-w-[85%] ${msg.role === 'user' ? 'self-end' : 'self-start'}`}>
                                <div className={`p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-primary text-white rounded-br-sm' : 'bg-slate-800 text-slate-200 border border-white/5 rounded-bl-sm'}`}>
                                    {msg.text}
                                </div>
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
