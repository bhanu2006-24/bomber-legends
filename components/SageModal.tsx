import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, Wifi, WifiOff } from 'lucide-react';
import { askSage, hasApiKey } from '../services/gemini';
import { GameState } from '../types';

interface SageModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameState: GameState;
}

const SageModal: React.FC<SageModalProps> = ({ isOpen, onClose, gameState }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'sage'; text: string }[]>([
    { role: 'sage', text: 'Tactical AI Online. Systems nominal. Awaiting query...' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isOnline = hasApiKey();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Reset chat slightly when opening if offline to indicate mode
  useEffect(() => {
    if (isOpen && !isOnline && messages.length === 1) {
        setMessages([{ role: 'sage', text: '⚠ EXTERNAL UPLINK SEVERED. RUNNING IN OFFLINE TACTICAL MODE. LOCAL DATABASE ACCESSIBLE.' }]);
    }
  }, [isOpen, isOnline]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsLoading(true);

    const context = `
      Level: ${gameState.level}
      Lives: ${gameState.player.lives}
      Score: ${gameState.score}
      Status: ${gameState.status}
    `;

    const sageResponse = await askSage(userMsg, context);

    setMessages(prev => [...prev, { role: 'sage', text: sageResponse }]);
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 touch-none">
      <div className="bg-slate-900 border-2 border-blue-500 rounded-lg w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="bg-blue-700 p-3 sm:p-4 flex justify-between items-center border-b border-blue-400">
          <div className="flex items-center gap-3">
            <Bot className="text-white w-5 h-5" />
            <div className="flex flex-col">
                <h2 className="text-white font-bold font-retro text-xs sm:text-sm leading-none mb-1">Tactical Support</h2>
                <div className={`flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded w-fit ${
                    isOnline 
                    ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30' 
                    : 'bg-amber-950/40 text-amber-300 border border-amber-500/30'
                }`}>
                    {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                    {isOnline ? 'ONLINE' : 'OFFLINE MODE'}
                </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white hover:text-blue-200 transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] p-3 rounded-lg text-sm leading-relaxed font-mono ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none shadow-[0_0_10px_rgba(37,99,235,0.5)]'
                    : 'bg-emerald-900 text-emerald-100 rounded-bl-none border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                }`}
              >
                {msg.role === 'sage' && <span className="text-emerald-400 font-bold mr-2 text-xs">AI:</span>}
                {msg.text}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-emerald-900/50 p-3 rounded-lg rounded-bl-none animate-pulse border border-emerald-500/30">
                <span className="text-xs text-emerald-400 font-mono">
                    {isOnline ? 'Decrypting Strategy...' : 'Retrieving Local Data...'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-3 sm:p-4 bg-slate-800 border-t border-slate-700 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isOnline ? "Ask for strategy..." : "Query local database..."}
            className="flex-1 bg-slate-900 text-white border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white p-2 rounded transition-colors shadow-lg shadow-blue-900/50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default SageModal;