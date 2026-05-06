/* ======================================================
   MCP ETHICAL SERVER — STABLE + PLANNER + LIVE EXECUTION
   ====================================================== */

import MCPAgent from "./mcpAgent.js";
import { generatePlan } from "./mcpPlanner.js";
import { scanNetwork, scanSubnets, generateVulnerabilityReport } from "./scanNetwork.js";
import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import net from "net";
import { exec } from "child_process";
import { db } from "./db.js";

/* ================= BASIC SETUP ================= */

const agent = new MCPAgent();
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "gui")));

/* ================= LIVE CLIENTS (SSE) ================= */

const liveClients = new Map();

/* ================= INTERNAL MEMORY ================= */

const lastUserMessage = {};
const lastDebugPayload = {};

/* ================= AGENT STATUS → SESSION + LIVE ================= */

agent.on("status", ({ sessionId, message }) => {
  loadSession(sessionId, async (id, history) => {
    if (!id) return;

    const entry = { role: "assistant", content: message };
    history.push(entry);
    saveSession(id, history);

    const clients = liveClients.get(id);
    if (clients) {
      for (const res of clients) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      }
    }

    /* ================= SELF-REPAIR TRIGGER ================= */

    if (message.includes("EXECUTION ERROR — DEBUG PAYLOAD")) {
      try {
        const jsonPart = message.split("DEBUG PAYLOAD:")[1];
        const debug = JSON.parse(jsonPart);

        lastDebugPayload[id] = debug;

        const repairPrompt =
          `Original request:\n${lastUserMessage[id] || "unknown"}\n\n` +
          `Execution failed.\nDebug info:\n${JSON.stringify(debug, null, 2)}\n\n` +
          `Generate a corrected plan with VALID executable commands only.`;

        const repairedPlan = await generatePlan(repairPrompt);

        if (repairedPlan.commands.length > 0) {
          pendingPlans[id] = repairedPlan;

          history.push({
            role: "assistant",
            content:
              "🔧 AUTO-REPAIRED PLAN GENERATED:\n" +
              JSON.stringify(repairedPlan, null, 2) +
              "\n\nType RUN to execute."
          });

          saveSession(id, history);
        }
      } catch (_) {}
    }
  });
});

/* ================= OLLAMA ================= */

const OLLAMA = "http://localhost:11434/api/generate";
const MODEL = "thirdeyeai/Qwen2.5-Coder-7B-Instruct-Uncensored:Q4_0";

/* ================= SESSION HELPERS ================= */

function loadSession(sessionId, cb) {
  if (!sessionId) return cb(null, []);
  db.get(
    "SELECT history FROM sessions WHERE id = ?",
    [sessionId],
    (_, row) => cb(sessionId, JSON.parse(row?.history || "[]"))
  );
}

function saveSession(id, history) {
  db.run(
    "UPDATE sessions SET history = ? WHERE id = ?",
    [JSON.stringify(history), id]
  );
}

/* ================= SESSION ROUTES ================= */

app.get("/sessions", (_, res) => {
  db.all(
    `SELECT id, COALESCE(title, 'New Chat') AS title
     FROM sessions ORDER BY rowid DESC`,
    [],
    (_, rows) => res.json(rows || [])
  );
});

app.post("/session", (_, res) => {
  const id = uuidv4();
  db.run(
    "INSERT INTO sessions (id, history, title) VALUES (?, ?, ?)",
    [id, "[]", null],
    () => res.json({ id })
  );
});

app.get("/session/:id", (req, res) => {
  loadSession(req.params.id, (_, history) => res.json({ history }));
});

app.delete("/session/:id", (req, res) => {
  db.run("DELETE FROM sessions WHERE id = ?", [req.params.id], () =>
    res.json({ deleted: true })
  );
});

/* ================= LIVE SESSION STREAM ================= */

app.get("/session/:id/stream", (req, res) => {
  const { id } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  if (!liveClients.has(id)) liveClients.set(id, new Set());
  liveClients.get(id).add(res);

  req.on("close", () => {
    liveClients.get(id)?.delete(res);
  });
});

/* ================= MCP PLANNER ================= */

function isEthicalHackingIntent(text) {
  return /(scan|recon|vuln|vulnerability|payload|reverse|shell|metasploit|exploit|auxiliary|wifi|network|android|windows|enumerat|osint|brute)/i.test(
    text
  );
}

/* ================= MCP CHAT ================= */

const pendingPlans = {};

app.post("/mcp/chat", (req, res) => {
  const { message = "", sessionId } = req.body;
  const lower = message.toLowerCase();

  loadSession(sessionId, async (id, history) => {
    if (!id) return res.status(400).json({ error: "No session selected" });

    lastUserMessage[id] = message;
    history.push({ role: "user", content: message });
    saveSession(id, history);

    if (pendingPlans[id]) {
      if (lower === "run") {
        const plan = pendingPlans[id];
        delete pendingPlans[id];
        agent.executePlan({ sessionId: id, plan });
        return res.json({ reply: "Execution started." });
      }
      if (lower === "cancel") {
        delete pendingPlans[id];
        return res.json({ reply: "Task cancelled." });
      }
      return res.json({ reply: "Waiting for RUN or CANCEL." });
    }

    if (message.length > 3) {
      db.run(
        "UPDATE sessions SET title = ? WHERE id = ? AND title IS NULL",
        [message.slice(0, 60), id]
      );
    }

    /* 🔥 FIX: ETHICAL HACKING INTENT ALWAYS PLANS */
    if (isEthicalHackingIntent(message)) {
      const plan = await generatePlan(message);

      if (plan.commands.length === 0) {
        history.push({
          role: "assistant",
          content:
            "⚠️ Planner determined this request is conceptual or unsafe to execute.\n\n" +
            JSON.stringify(plan, null, 2)
        });
        saveSession(id, history);
        return res.json({ reply: "Planner analysis complete." });
      }

      pendingPlans[id] = plan;

      history.push({
        role: "assistant",
        content: "PLANNED TASK:\n" + JSON.stringify(plan, null, 2)
      });
      saveSession(id, history);

      return res.json({
        reply:
          "PLAN READY:\n\n" +
          JSON.stringify(plan, null, 2) +
          "\n\nType RUN to execute."
      });
    }

    /* Default: normal chat passthrough */
    return res.json({ reply: "Message received." });
  });
});

/* ================= OLLAMA AUTO START ================= */

function isOllamaRunning() {
  return new Promise(resolve => {
    const s = new net.Socket();
    s.setTimeout(1000);
    s.connect(11434, "127.0.0.1", () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.on("timeout", () => resolve(false));
  });
}

async function ensureOllamaRunning() {
  if (await isOllamaRunning()) return;
  exec("ollama serve");
  await new Promise(r => setTimeout(r, 4000));
}

/* ================= NETWORK SCANNING ROUTES ================= */

app.post("/scan/network", (req, res) => {
  const { target, scanType = "nmap", sessionId } = req.body;

  if (!target) {
    return res.status(400).json({ error: "Target IP/domain required" });
  }

  loadSession(sessionId, async (id, history) => {
    const scanPromise = scanNetwork({
      target,
      scanType,
      onStatus: (msg) => {
        const entry = { role: "assistant", content: `[${scanType.toUpperCase()}] ${msg}` };
        history.push(entry);
        saveSession(id, history);

        const clients = liveClients.get(id);
        if (clients) {
          clients.forEach(res => {
            res.write(`data: ${JSON.stringify(entry)}\n\n`);
          });
        }
      }
    });

    const result = await scanPromise;
    res.json(result);
  });
});

app.post("/scan/subnets", (req, res) => {
  const { subnet, sessionId } = req.body;

  if (!subnet) {
    return res.status(400).json({ error: "Subnet CIDR required (e.g., 192.168.1.0/24)" });
  }

  scanSubnets({
    subnet,
    onStatus: (msg) => {
      console.log(`[SUBNET SCAN] ${msg}`);
    }
  }).then(hosts => {
    res.json({ subnet, hostsFound: hosts.length, hosts });
  }).catch(err => {
    res.status(500).json({ error: err.message });
  });
});

app.post("/scan/report", (req, res) => {
  const { scans = [] } = req.body;

  generateVulnerabilityReport(scans)
    .then(report => res.json(report))
    .catch(err => res.status(500).json({ error: err.message }));
});

/* ================= START ================= */

ensureOllamaRunning().then(() => {
  app.listen(PORT, () =>
    console.log(`MCP running at http://localhost:${PORT}`)
  );
});

