# Bridge Server Integration Checklist

Use this checklist to ensure proper setup and integration of the FastMCP bridge server.

## ✅ Pre-Installation Checklist

- [ ] Python 3.9+ installed
- [ ] Node.js 18+ installed
- [ ] npm installed
- [ ] Ollama installed (from https://ollama.ai)
- [ ] Git repository cloned
- [ ] VS Code or preferred IDE installed

## ✅ Backend Setup

### Dependencies
- [ ] Run `pip install -r requirements.txt`
- [ ] Verify installation: `python -c "import fastmcp, fastapi, uvicorn"`
- [ ] Check all packages: `python verify_setup.py`

### Ollama Configuration
- [ ] Start Ollama service: `ollama serve`
- [ ] Pull model: `ollama pull llama3.2:3b`
- [ ] Test model: `ollama run llama3.2:3b "Hello"`
- [ ] Verify API: `curl http://localhost:11434/api/tags`

### Storage Directory
- [ ] Verify `storage/` directory exists (auto-created on first run)
- [ ] Check read/write permissions
- [ ] (Optional) Add test documents to `storage/`

## ✅ Frontend Setup

### Dependencies
- [ ] Navigate to frontend: `cd frontend`
- [ ] Install packages: `npm install`
- [ ] Verify no errors in installation
- [ ] Check `node_modules/` exists

### Environment Configuration
- [ ] Copy `.env.example` to `.env.local`
- [ ] Add Supabase URL: `NEXT_PUBLIC_SUPABASE_URL=...`
- [ ] Add Supabase Anon Key: `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- [ ] Add Bridge Server URL: `NEXT_PUBLIC_BRIDGE_SERVER_URL=http://localhost:3001`
- [ ] Verify `.env.local` is in `.gitignore`

### Supabase Configuration
- [ ] Create Supabase project at https://app.supabase.com
- [ ] Navigate to Authentication → URL Configuration
- [ ] Add redirect URL: `http://localhost:3000/auth/callback`
- [ ] Set site URL: `http://localhost:3000`
- [ ] Enable Email provider
- [ ] (Optional) Configure email templates

## ✅ Bridge Server Setup

### Files Verification
- [ ] Verify `bridge_server.py` exists in project root
- [ ] Verify `client/fast_mcp_client.py` exists
- [ ] Verify `start_servers.ps1` exists
- [ ] Verify `test_bridge.py` exists

### Configuration Check
- [ ] Open `bridge_server.py`
- [ ] Verify MCP URL: `http://localhost:8000`
- [ ] Verify Bridge port: `3001`
- [ ] Verify CORS origins include: `http://localhost:3000`

## ✅ Initial Testing

### Verify Setup
- [ ] Run: `python verify_setup.py`
- [ ] Check all checks pass (green ✓)
- [ ] Fix any failed checks
- [ ] Re-run until all pass

### Manual Server Start (Testing)
- [ ] Terminal 1: `ollama serve` (if not already running)
- [ ] Terminal 2: `python server/main.py`
  - [ ] Check "FastMCP server started" message
  - [ ] Check documents loaded from `storage/`
  - [ ] Check listening on port 8000
- [ ] Terminal 3: `python bridge_server.py`
  - [ ] Check "Connected to FastMCP server" message
  - [ ] Check listening on port 3001
- [ ] Terminal 4: `cd frontend && npm run dev`
  - [ ] Check "ready on http://localhost:3000"
  - [ ] No build errors

### Health Checks
- [ ] Test Ollama: `curl http://localhost:11434/api/tags`
- [ ] Test FastMCP: `curl http://localhost:8000`
- [ ] Test Bridge: `curl http://localhost:3001/api/health`
- [ ] Test Frontend: Open http://localhost:3000

### Integration Testing
- [ ] Run: `python test_bridge.py`
- [ ] Verify all tests pass:
  - [ ] Health Check ✓
  - [ ] Basic Query ✓
  - [ ] Semantic Search ✓
  - [ ] Web Search ✓ (if Tavily configured)

## ✅ Automated Startup (Recommended)

### Script Testing
- [ ] Run: `.\start_servers.ps1`
- [ ] Verify 4 terminal windows open:
  - [ ] FastMCP Server (port 8000)
  - [ ] Bridge Server (port 3001)
  - [ ] Frontend (port 3000)
  - [ ] Original terminal (shows summary)
- [ ] Check all services started successfully
- [ ] Verify no error messages

### Verify All Services
- [ ] Open http://localhost:3000
- [ ] Check frontend loads
- [ ] Check no console errors (F12)
- [ ] Try logging in (magic link)

## ✅ Frontend Integration

### API Route Check
- [ ] Verify file exists: `frontend/app/api/chat/query/route.ts`
- [ ] Check imports are correct
- [ ] Verify BRIDGE_SERVER_URL usage
- [ ] Check all action types implemented

### Component Updates (To Do)
- [ ] Update ChatContainer to call `/api/chat/query`
- [ ] Update ChatInput to send queries
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add success feedback

### Test User Flow
- [ ] Open http://localhost:3000
- [ ] Log in with authorized email
- [ ] Navigate to Dashboard
- [ ] (Future) Send test query in chat
- [ ] (Future) Verify response appears
- [ ] (Future) Test file upload

## ✅ Documentation Review

### Read Through
- [ ] Read `README.md` (updated architecture section)
- [ ] Read `BRIDGE_SERVER.md` (API reference)
- [ ] Read `QUICK_REFERENCE.md` (common commands)
- [ ] Read `ARCHITECTURE.md` (system design)
- [ ] Read `IMPLEMENTATION_SUMMARY.md` (what was built)

### Understand Architecture
- [ ] Understand data flow (Next.js → Bridge → FastMCP → Ollama)
- [ ] Understand MCP protocol usage
- [ ] Understand connection management
- [ ] Understand error handling flow

## ✅ Production Readiness (Future)

### Security
- [ ] Add API authentication
- [ ] Implement rate limiting
- [ ] Add input validation
- [ ] Configure HTTPS
- [ ] Set up proper CORS for production domain
- [ ] Add request logging
- [ ] Implement audit trail

### Performance
- [ ] Add response caching
- [ ] Implement connection pooling
- [ ] Set up load balancing
- [ ] Configure CDN for frontend
- [ ] Optimize bundle size

### Monitoring
- [ ] Add health check endpoints
- [ ] Set up logging (Sentry, LogRocket)
- [ ] Configure alerts
- [ ] Add performance monitoring
- [ ] Set up uptime monitoring

### Deployment
- [ ] Set up CI/CD pipeline
- [ ] Configure environment variables
- [ ] Set up production database
- [ ] Deploy to hosting provider
- [ ] Configure domain and SSL
- [ ] Set up backups

## ✅ Common Issues & Solutions

### Bridge Server Won't Start
- [ ] Check FastMCP server is running: `curl http://localhost:8000`
- [ ] Check port 3001 is free: `netstat -ano | findstr :3001`
- [ ] Reinstall dependencies: `pip install -r requirements.txt --force-reinstall`
- [ ] Check Python version: `python --version` (need 3.9+)

### Frontend Can't Connect
- [ ] Verify bridge server: `curl http://localhost:3001/api/health`
- [ ] Check `.env.local` has `NEXT_PUBLIC_BRIDGE_SERVER_URL`
- [ ] Clear Next.js cache: `rm -rf frontend/.next`
- [ ] Restart dev server: `cd frontend && npm run dev`

### MCP Connection Fails
- [ ] Check FastMCP server logs in Terminal 2
- [ ] Verify Ollama is running: `ollama list`
- [ ] Restart all services: `.\start_servers.ps1`
- [ ] Check storage directory exists and is readable

### Ollama Issues
- [ ] Verify service: `ollama serve`
- [ ] Check model: `ollama list`
- [ ] Re-pull model: `ollama pull llama3.2:3b`
- [ ] Test directly: `ollama run llama3.2:3b "test"`

## ✅ Next Steps

### Immediate
1. [ ] Complete this checklist
2. [ ] Start all servers with `.\start_servers.ps1`
3. [ ] Run tests with `python test_bridge.py`
4. [ ] Verify frontend loads at http://localhost:3000

### Short Term
1. [ ] Update Chat components to use bridge server
2. [ ] Add file upload functionality
3. [ ] Implement real-time query/response
4. [ ] Add error notifications

### Medium Term
1. [ ] Add WebSocket for streaming responses
2. [ ] Implement user workspaces
3. [ ] Add document management UI
4. [ ] Build instruction system

### Long Term
1. [ ] Production deployment
2. [ ] Advanced analytics
3. [ ] Multi-model support
4. [ ] Mobile app

---

## 📝 Notes

### Encountered Issues
```
Date: ___________
Issue: _________________________________
Solution: ______________________________
```

### Configuration Changes
```
Date: ___________
File: __________________________________
Change: ________________________________
Reason: ________________________________
```

### Performance Observations
```
Date: ___________
Operation: _____________________________
Response Time: _________________________
Notes: _________________________________
```

---

**Setup Date**: _______________  
**Completed By**: _____________  
**Status**: ⬜ In Progress  ⬜ Completed  ⬜ Blocked

---

*Last Updated: November 8, 2025*
