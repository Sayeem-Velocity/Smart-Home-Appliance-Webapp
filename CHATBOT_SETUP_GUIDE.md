# AI Chatbot Setup & Troubleshooting Guide

## ✅ **Current Status**
- **Node.js Backend:** Running on Port 3000 ✓
- **Gemini AI:** Connected with API Key: AIzaSyD5Su1T_aJv_fk1... ✓
- **Authentication:** Fixed and working ✓

## 🔧 **Quick Fix for "Invalid Token" Error**

If you see **"Invalid token: demo-token"** error:

### **Solution 1: Refresh & Re-login** (Recommended)
1. Open http://localhost:3000
2. If logged in, **logout first**
3. Close all tabs with the dashboard
4. Open http://localhost:3000 again
5. Login with: **demo / demo123**
6. Test chatbot

### **Solution 2: Clear Browser Storage**
Press `F12` in browser → Console tab → Run:
```javascript
localStorage.clear();
sessionStorage.clear();
location.reload();
```

## 🤖 **Chatbot Architecture**

You now have TWO chatbot options:

### **Option 1: Node.js Built-in Chatbot** (Currently Active ✓)
- **Location:** `backend/aiService.js`
- **Model:** Gemini 1.5 Flash
- **API Key:** From `.env` file → `GEMINI_API_KEY=AIzaSyD5Su1T_aJv_fk1...`
- **Endpoint:** `POST /api/ai/chat`
- **Status:** ✅ Working

### **Option 2: Python FastAPI Service** (Optional)
- **Location:** `services/` directory
- **Model:** Gemini 1.5 Flash (Python SDK)
- **Port:** 8000
- **To Start:**
  ```powershell
  cd services
  python -m uvicorn main:app --reload --port 8000
  ```
- **Reads same .env file** for API key

## 🔑 **Gemini API Key Configuration**

Your API key is in `.env`:
```env
GEMINI_API_KEY=AIzaSyD5Su1T_aJv_fk1H4S_94gPWCDqTOn3fCE
```

**Both services read this same key!**

### **To Change API Key:**
1. Get new key from: https://aistudio.google.com/app/apikey
2. Edit `.env` file
3. Update `GEMINI_API_KEY=your_new_key_here`
4. Restart server

## 📊 **How Chatbot Works**

```
User Types Question
       ↓
Frontend (dashboard.js) → POST /api/ai/chat
       ↓
Auth Middleware (checks login token)
       ↓
aiService.js → Calls Gemini 1.5 Flash API
       ↓
Gets real-time data from PostgreSQL
       ↓
Formats response (removes emojis, adds icons)
       ↓
Returns to Frontend
       ↓
Displays in chat with Font Awesome icons
```

## 🐛 **Troubleshooting**

### **Problem: "Invalid or expired token"**
- **Cause:** Session expired or browser storage cleared
- **Fix:** Logout → Login again

### **Problem: Chatbot shows "Invalid token" in response**
- **Cause:** Old Gemini API error (fixed now)
- **Fix:** Server restarted with stable gemini-1.5-flash model

### **Problem: Chatbot not responding**
1. Check server terminal for errors
2. Check browser console (F12) for JavaScript errors
3. Verify API key is valid: https://aistudio.google.com/app/apikey
4. Test with fallback: Ask "What is my current power usage?" (uses local data)

### **Problem: Python service won't start**
```powershell
cd services
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

## 🎯 **Testing Chatbot**

Try these quick questions:
1. "What is the temperature and humidity?"
2. "Show me current power usage"
3. "Give me energy saving tips"
4. "How much is my monthly cost?"

## 📝 **Login Credentials**

| Username | Password  | Role  |
|----------|-----------|-------|
| demo     | demo123   | user  |
| admin    | admin123  | admin |

## 🚀 **Start Everything**

Run the provided script:
```powershell
.\START_ALL_SERVICES.ps1
```

Or manually:
```powershell
# Node.js only
node backend/server.js

# With Python service (optional)
# Terminal 1:
node backend/server.js

# Terminal 2:
cd services
python -m uvicorn main:app --reload --port 8000
```

## ✅ **Verification**

Server started successfully shows:
```
✅ AI Chatbot initialized with Gemini 1.5 Flash
   API Key: AIzaSyD5Su1T_aJv_fk1...
```

## 📌 **Important Files**

- `.env` - API keys and configuration
- `backend/aiService.js` - Node.js chatbot
- `backend/auth.js` - Authentication
- `services/llm/gemini_service.py` - Python chatbot
- `frontend/js/dashboard.js` - Frontend chat UI

---

**Need help?** Check terminal output for detailed error messages!
