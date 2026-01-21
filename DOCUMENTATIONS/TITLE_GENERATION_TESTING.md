# Testing LLM Title Generation & Manual Rename

## Current Setup

### What Changed:
1. ✅ Fixed bridge server URL (was 8001, now 3001)
2. ✅ Removed regenerate title feature
3. ✅ Added manual rename modal (Save/Cancel buttons)
4. ✅ Added comprehensive logging for debugging

## Testing Steps

### Test 1: Verify LLM Title Generation

1. **Start all services:**
   ```bash
   # Terminal 1: Ollama
   ollama serve
   
   # Terminal 2: FastMCP Backend
   python server/main.py
   
   # Terminal 3: Bridge Server
   python bridge_server.py
   
   # Terminal 4: Frontend
   cd frontend && npm run dev
   ```

2. **Create new chat:**
   - Open workspace
   - Click "New Chat" button
   - Send first message: "How do I deploy a Next.js app to Vercel?"

3. **Check browser console for logs:**
   ```
   🎯 Generating title for first message: How do I deploy a Next.js app to Vercel?
   📝 Title generation API called with message: How do I deploy a Next.js app to Vercel?
   ✅ User authenticated, calling bridge server at: http://localhost:3001
   ✅ Bridge server response: { success: true, title: "Deploy Next.js to Vercel" }
   ✅ Generated title: Deploy Next.js to Vercel
   ```

4. **Verify in sidebar:**
   - Chat should show generated title (not "New Chat")
   - Should be concise (≤6 words)

### Test 2: Manual Rename Feature

1. **Open existing chat:**
   - Find any chat in sidebar
   - Hover over the chat session

2. **Access rename modal:**
   - Click three-dot menu (⋮)
   - Click "Rename" option
   - Modal should appear with current title pre-filled

3. **Test rename:**
   - Change title to "My Custom Title"
   - Click "Save"
   - Verify title updates in sidebar

4. **Test cancel:**
   - Open rename modal again
   - Change title
   - Click "Cancel"
   - Verify title remains unchanged

5. **Test keyboard shortcuts:**
   - Open rename modal
   - Press Enter to save
   - Open modal again, press Escape to cancel

### Test 3: Error Handling

1. **Bridge server offline:**
   - Stop bridge server (Ctrl+C)
   - Send first message in new chat
   - Should use fallback (first 5 words of message)
   - Check console for: `⚠️ Using fallback title:`

2. **Ollama offline:**
   - Stop Ollama
   - Send first message
   - Should gracefully fallback

3. **Network issues:**
   - Disconnect internet
   - Try renaming
   - Should show error or timeout gracefully

## Troubleshooting

### Issue: Titles still show "New Chat"

**Check these in order:**

1. **Bridge server running?**
   ```bash
   curl http://localhost:3001/generate-title -X POST \
     -H "Content-Type: application/json" \
     -d '{"message":"test message"}'
   ```
   Expected: `{"success":true,"title":"..."}`

2. **Check browser console:**
   - Look for logs starting with 🎯, 📝, ✅, ❌
   - Any errors will show exact failure point

3. **Check bridge server terminal:**
   - Should show: `📝 Title generation request received`
   - Should show: `✅ Generated title: ...`

4. **Check Ollama:**
   ```bash
   ollama list
   # Should show llama3:8b or configured model
   ```

5. **Frontend environment:**
   ```bash
   cat frontend/.env.local | grep BRIDGE
   # Should show: BRIDGE_SERVER_URL=http://localhost:3001
   ```

### Issue: Rename modal not appearing

1. **Check console for errors**
2. **Verify hover works** (three-dot icon appears)
3. **Hard refresh browser** (Cmd/Ctrl + Shift + R)

### Issue: Save button grayed out

- **Cause:** Input is empty or whitespace only
- **Solution:** Enter at least one character

## Debug Checklist

```
□ Ollama running (ollama serve)
□ FastMCP backend running (python server/main.py)
□ Bridge server running (python bridge_server.py) on port 3001
□ Frontend running (npm run dev) on port 3000
□ Browser console open (F12)
□ Network tab showing requests to /api/chats/generate-title
```

## Expected Console Output

### Successful Title Generation:
```
🎯 Generating title for first message: Tell me about Python...
📝 Title generation API called with message: Tell me about Python data analysis
✅ User authenticated, calling bridge server at: http://localhost:3001
✅ Bridge server response: { success: true, title: "Python Data Analysis Guide" }
✅ Generated title: Python Data Analysis Guide
```

### Fallback Mode:
```
🎯 Generating title for first message: Tell me about...
📝 Title generation API called with message: Tell me about Python
❌ Bridge server error: 500 Internal Server Error
⚠️ Using fallback title: Tell me about Python
```

## Port Configuration

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3000 | http://localhost:3000 |
| Bridge Server | 3001 | http://localhost:3001 |
| Ollama | 11434 | http://localhost:11434 |
| FastMCP | (internal) | N/A |

## Quick Fixes

### Reset Everything:
```bash
# Stop all terminals (Ctrl+C in each)

# Restart in order:
ollama serve
python server/main.py
python bridge_server.py
cd frontend && npm run dev

# Hard refresh browser
```

### Clear Frontend Cache:
```bash
cd frontend
rm -rf .next
npm run dev
```

### Check Service Health:
```bash
# Test Ollama
curl http://localhost:11434/api/tags

# Test Bridge Server
curl http://localhost:3001/generate-title -X POST \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'

# Test Frontend
curl http://localhost:3000
```

## Success Indicators

✅ New chats get AI-generated titles automatically
✅ Titles are concise (typically 3-6 words)
✅ Three-dot menu appears on hover
✅ Rename modal opens with pre-filled title
✅ Save/Cancel buttons work correctly
✅ Enter key saves, Escape key cancels
✅ Console logs show successful generation
✅ Bridge server terminal shows title requests

## Next Steps After Testing

Once titles are working:
1. Remove console.log statements (or keep for production debugging)
2. Consider adding retry logic for failed generations
3. Add user feedback (toast notifications)
4. Monitor performance with large message volumes
