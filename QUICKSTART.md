# 🎯 QUICK START GUIDE

## ⏱️ 5-Minute Setup

### Step 1: Install & Start (2 min)
```bash
cd /Users/admin/mcp-ethics
./start.sh
```

**Output should show:**
```
✅ Node.js found
✅ Ollama running
✅ nmap installed
🎯 Starting MCP Server on http://localhost:3000
```

### Step 2: Open Browser (1 min)
- Go to: **http://localhost:3000**
- You should see the MCP Control Panel

### Step 3: Create Session (1 min)
- Click **"+ New Session"** button
- A new session appears in the sidebar

### Step 4: First Test (1 min)
- Type: `What is ethical hacking?`
- Click **Send**
- You should see an AI response

✅ **Basic setup complete!**

---

## 🔍 Test Network Scanning

### Before You Scan
⚠️ **Important**: Add permission first

Edit this file:
```bash
nano /Users/admin/mcp-ethics/memory/security/permissions.md
```

Add these lines:
```
- Date: 2026-03-17
- Target: 127.0.0.1
- Permission confirmed: YES
- Scope: localhost development testing
```

### Now Scan Localhost
In the chat, type:
```
scan 127.0.0.1 with nmap
```

You should see:
1. ✅ A plan appears
2. ✅ Shows command to run
3. ✅ Says "Type RUN to execute"

Type:
```
RUN
```

Watch the scan execute in real-time! 🎯

---

## 📊 Scan Results

Results are saved to:
```
~/Desktop/MCP_Scans/
```

View latest scan:
```bash
ls -lart ~/Desktop/MCP_Scans/ | tail -1
```

---

## 🌐 Scan Different Targets

### DNS Lookup
```
scan example.com with dns
RUN
```

### WHOIS Information
```
scan example.com with whois
RUN
```

### Traceroute
```
scan 8.8.8.8 with traceroute
RUN
```

### Nikto Web Scan
```
scan 127.0.0.1:3000 with nikto
RUN
```

---

## 📱 Web UI Features

| Feature | How to Use |
|---------|-----------|
| **New Session** | Click "+ New Session" |
| **Load Session** | Click on session title |
| **Delete Session** | Click 🗑️ button |
| **View History** | Scroll up in output |
| **Live Updates** | Automatic SSE streaming |
| **Snake Game** | Click "Snake Game" link |

---

## 🔗 API Usage (Advanced)

### Create Session
```bash
curl -X POST http://localhost:3000/session
```
Returns: `{"id": "uuid-here"}`

### Chat (Planning)
```bash
curl -X POST http://localhost:3000/mcp/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "scan 192.168.1.1 for open ports",
    "sessionId": "YOUR_SESSION_ID"
  }'
```

### Network Scan
```bash
curl -X POST http://localhost:3000/scan/network \
  -H "Content-Type: application/json" \
  -d '{
    "target": "192.168.1.0/24",
    "scanType": "nmap",
    "sessionId": "YOUR_SESSION_ID"
  }'
```

### Subnet Discovery
```bash
curl -X POST http://localhost:3000/scan/subnets \
  -H "Content-Type: application/json" \
  -d '{
    "subnet": "192.168.1.0/24",
    "sessionId": "YOUR_SESSION_ID"
  }'
```

---

## 🐛 Troubleshooting

### Server won't start
```bash
# Check if port is in use
lsof -i :3000

# Kill process on 3000
lsof -ti:3000 | xargs kill -9
```

### Ollama not running
```bash
# Start Ollama manually
ollama serve

# In another terminal
ollama pull thirdeyeai/Qwen2.5-Coder-7B-Instruct-Uncensored:Q4_0
```

### nmap not found
```bash
brew install nmap
```

### Database locked
```bash
rm mcp.db
./start.sh
```

---

## 📁 Project Structure

```
mcp-ethics/
├── server.js              ← Main API server
├── mcpAgent.js            ← Execution engine
├── mcpPlanner.js          ← AI planning
├── scanNetwork.js         ← Network scanning
├── db.js                  ← Database
├── gui/
│   ├── index.html         ← Main UI
│   ├── app.js             ← Chat logic
│   └── snake.html         ← Game
├── README.md              ← Full docs
├── TESTING.md             ← Test guide
├── CHANGES.md             ← What changed
└── start.sh               ← Startup script
```

---

## 🎮 Try the Snake Game

```bash
# In browser: http://localhost:3000/snake.html
```

Or click "🎮 Snake" in the control panel.

---

## 📖 Full Documentation

Read the detailed guides:
- **README.md** - Full feature documentation
- **TESTING.md** - Step-by-step testing guide
- **CHANGES.md** - What was changed and why

---

## ⚡ Common Commands

```bash
# Start server
./start.sh

# Stop server
Ctrl + C

# Check if running
curl http://localhost:3000/sessions

# View logs
tail -f /tmp/ollama.log

# View database
sqlite3 mcp.db "SELECT * FROM sessions;"

# Clear everything
rm mcp.db
rm -rf ~/Desktop/MCP_Scans
```

---

## ✅ Success Checklist

- [ ] Server running on port 3000
- [ ] Web UI accessible at http://localhost:3000
- [ ] Can create new sessions
- [ ] Can send chat messages
- [ ] AI responses appear
- [ ] Can generate plans
- [ ] Can view network scans
- [ ] Scan results saved to ~/Desktop/MCP_Scans/
- [ ] Database storing results
- [ ] Live SSE streaming works

---

## 🚀 Ready to Scan!

You now have a fully working ethical hacking automation platform:

✅ AI-powered planning  
✅ Network scanning (nmap)  
✅ Web vulnerability scanning (nikto)  
✅ DNS & WHOIS lookups  
✅ Traceroute analysis  
✅ Real-time result streaming  
✅ Permission management  
✅ Full history logging  

**Start with**: `./start.sh`

---

## 🔐 Remember

**Always:**
- ✅ Get written permission before scanning
- ✅ Scan only authorized targets
- ✅ Document findings
- ✅ Report vulnerabilities responsibly
- ✅ Follow local laws

**Never:**
- ❌ Scan without permission
- ❌ Exploit vulnerabilities
- ❌ Store sensitive data insecurely
- ❌ Use for malicious purposes

---

## 🆘 Need Help?

1. Check **README.md** for full docs
2. See **TESTING.md** for examples
3. Review **CHANGES.md** for architecture
4. Check logs in `~/Desktop/MCP_Scans/`

---

**Happy ethical hacking! 🎯**
