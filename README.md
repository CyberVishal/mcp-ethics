# MCP Ethical Hacking Framework

A comprehensive ethical hacking automation platform with network scanning, vulnerability analysis, and AI-powered task planning.

## 🚀 Architecture

### Core Components

- **mcpAgent.js** - Executes plans with shell command spawning and error handling
- **mcpPlanner.js** - Generates ethical hacking plans using Ollama AI
- **server.js** - Express.js API server with SSE live streaming
- **scanNetwork.js** - Network reconnaissance and vulnerability scanning
- **db.js** - SQLite3 database with sessions, targets, and scan logs
- **gui/** - Web UI for chat, control, and games

### Data Flow

```
User Input → Server Chat Endpoint
  ↓
Ethical Intent Detection
  ↓
generatePlan(mcpPlanner) → JSON task schema
  ↓
User Reviews Plan → Type "RUN" to execute
  ↓
MCPAgent.executePlan() → Execute commands
  ↓
Live Stream Results via SSE
  ↓
Store results in DB
```

## 📋 Prerequisites

```bash
# Install dependencies
npm install

# Install system tools (macOS)
brew install nmap nikto
brew install ollama

# Start Ollama service
ollama serve &
ollama pull thirdeyeai/Qwen2.5-Coder-7B-Instruct-Uncensored:Q4_0
```

## 🔧 Quick Start

```bash
# Start the MCP server
node server.js

# The server runs on http://localhost:3000
# Open in browser to access the UI
```

## 📡 API Endpoints

### Chat & Planning
- `POST /mcp/chat` - Send message and get plan
- `GET /session/:id/stream` - Live event stream (SSE)

### Session Management
- `POST /session` - Create new session
- `GET /sessions` - List all sessions
- `GET /session/:id` - Get session history
- `DELETE /session/:id` - Delete session

### Network Scanning
- `POST /scan/network` - Scan single target
  ```json
  {
    "target": "192.168.1.1",
    "scanType": "nmap|nikto|whois|traceroute|dns",
    "sessionId": "uuid"
  }
  ```

- `POST /scan/subnets` - Scan subnet range
  ```json
  {
    "subnet": "192.168.1.0/24",
    "sessionId": "uuid"
  }
  ```

- `POST /scan/report` - Generate vulnerability report
  ```json
  {
    "scans": [...]
  }
  ```

## 🛡️ Security & Ethics

### Permission System
- All scanning requires explicit confirmation
- Targets must be owned by operator
- Session-based access control
- All actions logged to database

### Safe Execution
- Plans reviewed before execution
- Commands filtered and validated
- Error debugging with auto-repair
- Timeout protection (5 minutes)

### Permissions Check
Edit `memory/security/permissions.md` to confirm:
- Organization ownership
- Target scope
- Legal approval

## 🎮 Web UI Features

1. **Chat Interface** - Ask for scans and hacking tasks
2. **Plan Review** - See generated plans before execution
3. **Live Output** - Real-time command execution streaming
4. **Session History** - Track all past operations
5. **Snake Game** - Fun distraction game (snake.html)

## 📊 Database Schema

### Sessions Table
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  history TEXT,
  title TEXT
);
```

### Targets Table
```sql
CREATE TABLE targets (
  id TEXT PRIMARY KEY,
  scope TEXT,
  notes TEXT,
  permissions TEXT
);
```

### Scans Table
```sql
CREATE TABLE scans (
  id TEXT PRIMARY KEY,
  target TEXT,
  scan_type TEXT,
  results TEXT,
  timestamp TEXT
);
```

## 🔍 Example Usage

### 1. Start Server
```bash
node server.js
```

### 2. Create Session (API)
```bash
curl -X POST http://localhost:3000/session
# Response: {"id": "uuid-here"}
```

### 3. Send Scan Request
```bash
curl -X POST http://localhost:3000/mcp/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "scan 192.168.1.0/24 for vulnerabilities",
    "sessionId": "uuid-here"
  }'
```

### 4. Review Plan
```
MCP: PLANNED TASK:
{
  "type": "agent_task",
  "task": "Scan subnet for active hosts",
  "commands": ["nmap -sn 192.168.1.0/24"],
  ...
}

Type RUN to execute.
```

### 5. Execute
```bash
curl -X POST http://localhost:3000/mcp/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "RUN",
    "sessionId": "uuid-here"
  }'
```

## 🐛 Troubleshooting

### Ollama Not Running
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve

# Pull model if not present
ollama pull thirdeyeai/Qwen2.5-Coder-7B-Instruct-Uncensored:Q4_0
```

### Database Lock Error
```bash
# Remove old database and restart
rm mcp.db
node server.js
```

### Scan Tools Not Found
```bash
# Install missing tools
brew install nmap nikto

# Verify installation
nmap --version
```

### Port 3000 Already in Use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or change PORT in server.js
```

## 📝 Code Organization

```
mcp-ethics/
├── server.js              # Main Express server
├── mcpAgent.js            # Command execution engine
├── mcpPlanner.js          # AI plan generation
├── scanNetwork.js         # Network scanning module
├── db.js                  # Database initialization
├── tools.js               # Google Slides helper
├── gui/                   # Web UI
│   ├── app.js
│   ├── index.html
│   ├── snake.js
│   └── snake.html
├── automation/            # Presentation automation
├── memory/                # Security & context
└── recon_logs/            # Scan results
```

## ⚙️ Configuration

Edit `.env` or top of files:

```javascript
// server.js
const OLLAMA = "http://localhost:11434/api/generate";
const MODEL = "thirdeyeai/Qwen2.5-Coder-7B-Instruct-Uncensored:Q4_0";
const PORT = 3000;

// scanNetwork.js
const NMAP_TIMEOUT = 300000; // 5 minutes
const OUTPUT_DIR = "~/Desktop/MCP_Scans";
```

## 🤝 Contributing

1. Follow existing code structure
2. Add comments for complex logic
3. Test all network scanning thoroughly
4. Update permissions.md for new targets
5. Keep error messages descriptive

## ⚠️ Legal Notice

**This framework is for authorized security testing only.**

- Only scan networks/systems you own or have explicit written permission to test
- Unauthorized access is illegal
- Document all permissions before scanning
- Report findings responsibly

## 📄 License

MIT - Use responsibly and ethically.

## 🆘 Support

- Check `memory/security/permissions.md` for permission status
- Review logs in `recon_logs/` directory
- Database errors? Remove `mcp.db` and restart
- Network issues? Verify network connectivity before scanning

---

**Remember: With great power comes great responsibility.** ⚡
