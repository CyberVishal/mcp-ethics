# 🔧 Setup & Testing Guide

## Quick Setup (5 minutes)

### 1. Install Dependencies
```bash
cd /Users/admin/mcp-ethics
npm install
```

### 2. Start the System
```bash
# Option A: Use startup script (recommended)
./start.sh

# Option B: Manual startup
node server.js
```

### 3. Access Web UI
Open browser: `http://localhost:3000`

---

## Testing the System

### Test 1: Basic Chat (No Scanning)
1. Create new session in UI
2. Type: "what is ethical hacking?"
3. Expected: General information response

### Test 2: Plan Generation
1. Type: "scan localhost for open ports"
2. Expected: Plan appears with "Type RUN to execute"

### Test 3: Network Scanning (Requires Permission)

#### Check permissions first:
```bash
cat /Users/admin/mcp-ethics/memory/security/permissions.md
```

#### Add permission:
Edit `memory/security/permissions.md` and add:
```
- Date: 2026-03-17
- Target: 127.0.0.1
- Permission confirmed: YES
- Scope: localhost only (development)
```

#### Then scan:
```bash
# Via UI: Type "scan 127.0.0.1 with nmap"
# Or via API:
curl -X POST http://localhost:3000/scan/network \
  -H "Content-Type: application/json" \
  -d '{
    "target": "127.0.0.1",
    "scanType": "nmap",
    "sessionId": "YOUR_SESSION_ID"
  }'
```

### Test 4: Different Scan Types
```bash
# DNS lookup
curl -X POST http://localhost:3000/scan/network \
  -H "Content-Type: application/json" \
  -d '{"target": "example.com", "scanType": "dns", "sessionId": "SESSION_ID"}'

# WHOIS lookup
curl -X POST http://localhost:3000/scan/network \
  -H "Content-Type: application/json" \
  -d '{"target": "example.com", "scanType": "whois", "sessionId": "SESSION_ID"}'

# Traceroute
curl -X POST http://localhost:3000/scan/network \
  -H "Content-Type: application/json" \
  -d '{"target": "example.com", "scanType": "traceroute", "sessionId": "SESSION_ID"}'
```

### Test 5: Subnet Scanning
```bash
# Scan local subnet for active hosts
curl -X POST http://localhost:3000/scan/subnets \
  -H "Content-Type: application/json" \
  -d '{"subnet": "192.168.1.0/24", "sessionId": "SESSION_ID"}'
```

---

## Database Testing

### Check Database
```bash
# View all sessions
sqlite3 mcp.db "SELECT * FROM sessions;"

# View all scans
sqlite3 mcp.db "SELECT * FROM scans;"

# Clear database (fresh start)
rm mcp.db
node server.js
```

---

## Troubleshooting Tests

### Test: Ollama Connection
```bash
curl http://localhost:11434/api/tags
# Expected: {"models": [...]}
```

### Test: Server Health
```bash
curl http://localhost:3000/sessions
# Expected: JSON array of sessions
```

### Test: Port Availability
```bash
# Check if port 3000 is free
lsof -i :3000
```

---

## Live Scanning Example (Step-by-Step)

### 1. Create Session
```bash
SESSION=$(curl -s -X POST http://localhost:3000/session | jq -r '.id')
echo "Session ID: $SESSION"
```

### 2. Send Plan Request
```bash
curl -X POST http://localhost:3000/mcp/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"scan 127.0.0.1 for open ports\",
    \"sessionId\": \"$SESSION\"
  }" | jq
```

### 3. Type RUN to Execute
```bash
curl -X POST http://localhost:3000/mcp/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"RUN\",
    \"sessionId\": \"$SESSION\"
  }" | jq
```

### 4. Check Results
```bash
curl -X GET "http://localhost:3000/session/$SESSION" | jq '.history[-5:]'
```

---

## Performance Testing

### Load Testing
```bash
# Install ab (Apache Bench)
brew install httpd

# Test 100 requests, 10 concurrent
ab -n 100 -c 10 http://localhost:3000/sessions
```

### Database Performance
```bash
sqlite3 mcp.db "SELECT COUNT(*) FROM sessions; SELECT COUNT(*) FROM scans;"
```

---

## Security Validation

### Verify Permissions Enforcement
```bash
# Without permission, scan should warn
curl -X POST http://localhost:3000/mcp/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "scan 8.8.8.8",
    "sessionId": "SESSION_ID"
  }'
# Expected: Warning about unauthorized target
```

### Check Logs
```bash
# View recent scan logs
ls -lart /Users/admin/Desktop/MCP_Scans/ | tail -5
```

---

## Web UI Testing Checklist

- [ ] Create new session
- [ ] Send message
- [ ] See response in real-time (SSE)
- [ ] View session history
- [ ] Delete session
- [ ] Live stream working (SSE events)
- [ ] Snake game loads (snake.html)
- [ ] Plan appears with RUN button
- [ ] Execution starts on RUN
- [ ] Results stream live

---

## Code Quality Tests

```bash
# Check for syntax errors
node --check server.js
node --check mcpAgent.js
node --check mcpPlanner.js
node --check scanNetwork.js

# All should output: "No errors detected"
```

---

## Clean Up Commands

```bash
# Reset everything
rm mcp.db
rm -rf /Users/admin/Desktop/MCP_Output
rm -rf /Users/admin/Desktop/MCP_Scans

# Kill any lingering processes
killall node
killall ollama

# Start fresh
./start.sh
```

---

## Expected Output on Startup

```
🚀 MCP Ethics Framework - Startup
==================================

✅ Node.js found: v18.x.x
✅ Ollama running
📦 Ensuring AI model is available...
✅ nmap installed
✅ nikto installed
📦 Installing npm dependencies...
✅ Dependencies installed

==================================
🎯 Starting MCP Server on http://localhost:3000
==================================

MCP running at http://localhost:3000
```

---

## Next Steps

1. ✅ Setup complete
2. 🧪 Run through all tests above
3. 📖 Read memory/security/permissions.md
4. 🎯 Update target list
5. 🔐 Confirm permissions before scanning
6. 🚀 Start using!

---

**Questions? Check the main README.md for detailed documentation.**
