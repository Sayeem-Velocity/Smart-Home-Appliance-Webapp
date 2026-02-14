import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Sparkles } from 'lucide-react';

const AIChat = ({ apiBase }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [dailySummary, setDailySummary] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadChatHistory();
    loadDailySummary();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChatHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/api/ai/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.data && result.data.length > 0) {
          setMessages(result.data);
        }
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const loadDailySummary = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/api/ai/daily-summary`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        setDailySummary(result.summary || 'No summary available yet.');
      }
    } catch (error) {
      console.error('Error loading daily summary:', error);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: input })
      });

      if (response.ok) {
        const result = await response.json();
        const aiMessage = {
          role: 'assistant',
          content: result.response,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        const errorMessage = {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I could not process your request.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAI = async () => {
    try {
      const token = localStorage.getItem('token');
      const newState = !aiEnabled;
      const response = await fetch(`${apiBase}/api/ai/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ enabled: newState })
      });

      if (response.ok) {
        setAiEnabled(newState);
      }
    } catch (error) {
      console.error('Error toggling AI:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-white bg-opacity-20 rounded-full p-3">
              <Sparkles className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">AI Assistant</h2>
              <p className="text-indigo-100">Powered by Gemini</p>
            </div>
          </div>
          <button
            onClick={toggleAI}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              aiEnabled
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-gray-500 hover:bg-gray-600'
            }`}
          >
            {aiEnabled ? '✓ AI Enabled' : 'AI Disabled'}
          </button>
        </div>
      </div>

      {/* Daily Summary */}
      {dailySummary && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-lg p-6 border border-blue-200">
          <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-indigo-600" />
            Daily Summary
          </h3>
          <p className="text-gray-700 leading-relaxed">{dailySummary}</p>
        </div>
      )}

      {/* Chat Container */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Messages */}
        <div className="h-96 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-gray-50 to-white">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Bot className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">No messages yet</p>
              <p className="text-sm">Start a conversation with the AI assistant</p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-in`}
              >
                <div className={`flex items-start space-x-2 max-w-[80%] ${
                  msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                }`}>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-purple-500 text-white'
                  }`}>
                    {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                  </div>
                  <div className={`rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-1 ${
                      msg.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                    }`}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start animate-slide-in">
              <div className="flex items-start space-x-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="bg-gray-100 rounded-2xl px-4 py-3">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className="border-t border-gray-200 p-4 bg-white">
          <div className="flex space-x-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about energy usage, get recommendations..."
              disabled={!aiEnabled || isLoading}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!aiEnabled || isLoading || !input.trim()}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Send className="w-5 h-5" />
              <span>Send</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AIChat;
