/* ======================================================
   MCP ETHICAL SERVER — STABLE + PLANNER + LIVE EXECUTION
   ====================================================== */
import MCPAgent from "./mcpAgent.js";
import {
  generatePlan,
  generateChatResponse
} from "./mcpPlanner.js";
import { classifyIntent, validatePlanSafety } from "./policy.js";
import { classifySecurityIntent } from "./intentClassifier.js";
import { buildWorkflow } from "./workflowPlanner.js";
import {
  createWorkflowRecord,
  getWorkflowRecord,
  listWorkflowRecords
} from "./workflowStore.js";
import { scanNetwork, scanSubnets, generateVulnerabilityReport } from "./scanNetwork.js";
import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
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
const repairAttempts = {};
const MAX_REPAIR_ATTEMPTS = 1;

/* ================= AGENT STATUS → SESSION + LIVE ================= */

agent.on("status", ({ sessionId, message, phase, state, data, timestamp, eventType }) => {
  loadSession(sessionId, async (id, history) => {
    if (!id) return;

    const entry = {
      role: "assistant",
      kind: phase || "execution",
      state: state || "info",
      content: message,
      data: data || {},
      eventType: eventType || data?.eventType,
      timestamp: timestamp || new Date().toISOString()
    };
    history.push(entry);
    saveSession(id, history);

    const clients = liveClients.get(id);
    if (clients) {
      for (const res of clients) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      }
    }
  });
});

agent.on("execution-error", async ({ sessionId, plan, debug }) => {
  if (!sessionId || debug?.reason === "USER_STOPPED") return;

  repairAttempts[sessionId] = repairAttempts[sessionId] || 0;
  if (repairAttempts[sessionId] >= MAX_REPAIR_ATTEMPTS) {
    appendAssistantMessage(sessionId, {
      kind: "execution",
      state: "failed",
      content: "🧯 Auto-repair limit reached. Review the execution log before retrying.",
      data: debug
    });
    return;
  }

  repairAttempts[sessionId]++;
  lastDebugPayload[sessionId] = debug;

  const repairPrompt =
    `Original request:\n${lastUserMessage[sessionId] || "unknown"}\n\n` +
    `Previous plan:\n${JSON.stringify(plan, null, 2)}\n\n` +
    `Execution failed.\nDebug info:\n${JSON.stringify(debug, null, 2)}\n\n` +
    "Generate one corrected safe macOS plan. Use brew only when a missing tool must be installed. Commands must be non-interactive.";

  try {
    const repairedPlan = await generatePlan(repairPrompt);
    const safety = validatePlanSafety(repairedPlan);

    if (!safety.ok || !safety.plan.commands.length) {
      appendAssistantMessage(sessionId, {
        kind: "execution",
        state: "failed",
        content:
          "🧯 Auto-repair could not produce a safe executable plan.\n" +
          JSON.stringify(safety.plan || repairedPlan, null, 2),
        data: { reason: safety.reason }
      });
      return;
    }

    appendAssistantMessage(sessionId, {
      kind: "planner",
      state: "repaired",
      content:
        "🔧 Auto-repair generated a corrected plan and is retrying once:\n" +
        JSON.stringify(safety.plan, null, 2),
      data: { plan: safety.plan }
    });

    setTimeout(() => {
      agent.executePlan({ sessionId, plan: safety.plan });
    }, 250);
  } catch (err) {
    appendAssistantMessage(sessionId, {
      kind: "execution",
      state: "failed",
      content: `🧯 Auto-repair failed: ${err.message}`,
      data: { error: err.message }
    });
  }
});

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

function appendAssistantMessage(sessionId, entry) {
  loadSession(sessionId, (id, history) => {
    if (!id) return;
    const message = {
      role: "assistant",
      kind: entry.kind || "chat",
      state: entry.state || "info",
      content: entry.content,
      data: entry.data || {},
      timestamp: entry.timestamp || new Date().toISOString()
    };
    history.push(message);
    saveSession(id, history);
    const clients = liveClients.get(id);
    if (clients) {
      for (const client of clients) {
        client.write(`data: ${JSON.stringify(message)}\n\n`);
      }
    }
  });
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

/* ================= MCP CHAT ================= */

const pendingPlans = {};
const pendingWorkflows = {};

app.post("/mcp/chat", (req, res) => {
  const { message = "", sessionId } = req.body;
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  loadSession(sessionId, async (id, history) => {
    if (!id) return res.status(400).json({ error: "No session selected" });

    lastUserMessage[id] = trimmed;
    history.push({ role: "user", kind: "user", content: trimmed, timestamp: new Date().toISOString() });
    saveSession(id, history);

    if (pendingPlans[id]) {
      if (lower === "run") {
        const pending = pendingPlans[id];
        delete pendingPlans[id];
        repairAttempts[id] = 0;

        if (pendingWorkflows[id]) {
          const workflow = pendingWorkflows[id];
          delete pendingWorkflows[id];
          agent.executeWorkflow({ sessionId: id, workflow });
        } else {
          agent.executePlan({ sessionId: id, plan: pending });
        }

        return res.json({ reply: "Execution started.", kind: "execution", state: "running" });
      }
      if (lower === "cancel") {
        delete pendingPlans[id];
        delete pendingWorkflows[id];
        return res.json({ reply: "Task cancelled.", kind: "planner", state: "cancelled" });
      }
      return res.json({ reply: "Waiting for RUN or CANCEL.", kind: "planner", state: "waiting" });
    }

    if (lower === "stop") {
      const stopped = agent.stopExecution(id);
      return res.json({
        reply: stopped ? "Stop requested." : "No execution is currently running.",
        kind: "execution",
        state: stopped ? "stopping" : "idle"
      });
    }

    if (trimmed.length > 3) {
      db.run(
        "UPDATE sessions SET title = ? WHERE id = ? AND title IS NULL",
        [trimmed.slice(0, 60), id]
      );
    }

    const structuredIntent = classifySecurityIntent(trimmed);
    const intent = classifyIntent(trimmed);

    if (structuredIntent.category === "disallowed" || intent.kind === "disallowed") {
      const reply =
        "I can’t help with malware, credential theft, ransomware, persistence, destructive actions, or unauthorized access. I can help with defensive scanning, recon, local auditing, or educational explanations.";
      history.push({
        role: "assistant",
        kind: "security",
        state: "rejected",
        content: reply,
        data: { classification: structuredIntent },
        timestamp: new Date().toISOString()
      });
      saveSession(id, history);
      return res.json({ reply, kind: "security", state: "rejected" });
    }

    if (!structuredIntent.actionable) {
      const reply = await generateChatResponse(trimmed);

      history.push({
        role: "assistant",
        kind: structuredIntent.category === "conceptual" ? "conceptual_cybersecurity" : structuredIntent.category,
        state: "completed",
        content: reply,
        data: { classification: structuredIntent },
        timestamp: new Date().toISOString()
      });

      saveSession(id, history);

      return res.json({ reply, kind: structuredIntent.category, state: "completed" });
    }

    if (structuredIntent.actionable) {
      const workflow = buildWorkflow(trimmed);

      if (workflow.status === "rejected" || !workflow.steps.length) {
        history.push({
          role: "assistant",
          kind: "planner",
          state: "rejected",
          content:
            "⚠️ Workflow planner rejected this request.\n\n" +
            JSON.stringify(workflow, null, 2),
          data: { classification: structuredIntent, workflow },
          timestamp: new Date().toISOString()
        });
        saveSession(id, history);
        return res.json({ reply: "Workflow planning rejected.", kind: "planner", state: "rejected" });
      }

      createWorkflowRecord({ workflow, sessionId: id });
      pendingPlans[id] = { type: "workflow_approval", workflowId: workflow.workflowId, commands: [] };
      pendingWorkflows[id] = workflow;

      history.push({
        role: "assistant",
        kind: "planner",
        state: "waiting",
        content:
          "PLANNED WORKFLOW:\n" +
          JSON.stringify(workflow, null, 2),
        data: { workflow, classification: structuredIntent },
        timestamp: new Date().toISOString()
      });
      saveSession(id, history);

      return res.json({
        kind: "planner",
        state: "waiting",
        reply:
          "WORKFLOW READY:\n\n" +
          JSON.stringify(workflow, null, 2) +
          "\n\nType RUN to execute."
      });
    }

    /* Default: normal chat passthrough */
    return res.json({ reply: "Message received." });
  });
});

app.get("/workflows/:sessionId", (req, res) => {
  listWorkflowRecords(req.params.sessionId, rows => res.json(rows));
});

app.get("/workflow/:id", (req, res) => {
  getWorkflowRecord(req.params.id, row => {
    if (!row) return res.status(404).json({ error: "Workflow not found" });
    res.json(row);
  });
});

app.get("/report", (req, res) => {
  const reportPath = String(req.query.path || "");
  const reportsRoot = path.join(process.env.HOME || process.cwd(), "Desktop", "MCP_Output", "reports");
  const resolved = path.resolve(reportPath);

  if (!resolved.startsWith(path.resolve(reportsRoot))) {
    return res.status(403).json({ error: "Report path not allowed" });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: "Report not found" });
  }
  res.type(path.extname(resolved) === ".json" ? "application/json" : "text/markdown");
  res.send(fs.readFileSync(resolved, "utf8"));
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
