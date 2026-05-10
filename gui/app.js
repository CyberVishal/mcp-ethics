let currentSessionId = null;
let lastRenderedLength = 0;
let permissionGateActive = false;
let eventSource = null;

const output = document.getElementById("output");
const input = document.getElementById("cmd");
const sendBtn = document.getElementById("sendBtn");
const tiredBtn = document.getElementById("tiredBtn");
const sessionsDiv = document.getElementById("sessions");

/* ================= UTIL ================= */

function print(role, text, meta = {}) {
  const shouldStick = output.scrollTop + output.clientHeight >= output.scrollHeight - 80;
  const collapsible = ["stdout", "stderr"].includes(meta.eventType);
  const item = document.createElement(collapsible ? "details" : "div");
  item.className = `message ${meta.kind || "chat"} ${meta.state || "info"}`;
  if (collapsible) item.open = false;

  const header = document.createElement(collapsible ? "summary" : "div");
  header.className = "message-header";
  header.textContent = `${role}${meta.kind ? ` · ${labelForKind(meta.kind)}` : ""}${meta.eventType ? ` · ${meta.eventType}` : ""}${meta.state ? ` · ${meta.state}` : ""}`;

  const body = document.createElement("pre");
  body.className = "message-body";
  body.textContent = text;

  item.appendChild(header);
  item.appendChild(body);
  output.appendChild(item);

  if (meta.data?.outputFiles?.length || meta.data?.logFile) {
    const files = document.createElement("div");
    files.className = "message-files";
    const locations = [...(meta.data.outputFiles || []), meta.data.logFile].filter(Boolean);
    files.textContent = `Output location: ${locations.join(" | ")}`;
    item.appendChild(files);
  }

  if (meta.data?.workflow?.steps?.length) {
    item.appendChild(renderWorkflowProgress(meta.data.workflow));
  }

  if (meta.data?.reports?.length) {
    item.appendChild(renderReports(meta.data.reports));
  }

  if (shouldStick) output.scrollTop = output.scrollHeight;

  // permission gate detection
  if (
    text.includes("Type RUN") ||
    text.includes("EDIT") ||
    text.includes("CANCEL") ||
    text.includes("Waiting for RUN")
  ) {
    permissionGateActive = true;
  }

  // auto-unlock gate on execution signals
  if (
    text.includes("Execution started") ||
    text.includes("Execution completed") ||
    text.includes("Command")
  ) {
    permissionGateActive = false;
  }
}

function clearChat() {
  output.innerHTML = "";
  lastRenderedLength = 0;
  permissionGateActive = false;

  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function renderHistory(history) {
  for (let i = lastRenderedLength; i < history.length; i++) {
    const m = history[i];
    if (m.role === "user") print("You", m.content, { kind: "user", state: "sent" });
    if (m.role === "assistant") {
      print("MCP", m.content, {
        kind: m.kind || "chat",
        state: m.state || "info",
        eventType: m.eventType,
        data: m.data || {}
      });
    }
  }
  lastRenderedLength = history.length;
}

function labelForKind(kind) {
  const labels = {
    conversational: "Chat",
    informational: "Info",
    conceptual_cybersecurity: "Concept",
    planner: "Planner",
    execution: "Execution",
    execute: "Execution",
    install: "Install",
    workflow: "Workflow",
    debug: "Debug",
    security: "Security",
    user: "User"
  };
  return labels[kind] || kind;
}

function renderWorkflowProgress(workflow) {
  const wrap = document.createElement("div");
  wrap.className = "workflow-progress";

  workflow.steps.forEach(step => {
    const badge = document.createElement("span");
    badge.className = `status-badge ${step.status || "pending"}`;
    badge.textContent = `${step.order}. ${step.title}: ${step.status || "pending"}`;
    wrap.appendChild(badge);
  });

  return wrap;
}

function renderReports(reports) {
  const wrap = document.createElement("div");
  wrap.className = "report-links";

  reports.forEach(report => {
    const btn = document.createElement("button");
    btn.textContent = `View ${report.type}`;
    btn.onclick = async () => {
      const res = await fetch(`/report?path=${encodeURIComponent(report.path)}`);
      const text = await res.text();
      showReport(report.path, text);
    };
    wrap.appendChild(btn);
  });

  return wrap;
}

function showReport(title, text) {
  const panel = document.getElementById("reportViewer");
  const titleEl = document.getElementById("reportTitle");
  const body = document.getElementById("reportBody");
  titleEl.textContent = title;
  body.textContent = text;
  panel.hidden = false;
}

/* ================= LIVE STREAM (SSE) ================= */

function connectLiveStream(sessionId) {
  if (eventSource) eventSource.close();

  eventSource = new EventSource(`/session/${sessionId}/stream`);

  eventSource.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg?.content) {
        print("MCP", msg.content, {
          kind: msg.kind || "execution",
          state: msg.state || "info",
          eventType: msg.eventType,
          data: msg.data || {}
        });
        lastRenderedLength++; // keep in sync
      }
    } catch (_) {}
  };

  eventSource.onerror = () => {
    eventSource.close();
    eventSource = null;
  };
}

/* ================= LOAD SESSIONS ================= */

async function loadSessions() {
  const res = await fetch("/sessions");
  const sessions = await res.json();

  sessionsDiv.innerHTML = "";

  sessions.forEach(s => {
    const div = document.createElement("div");
    div.className = "session-item";
    div.style.display = "flex";
    div.style.justifyContent = "space-between";

    const title = document.createElement("span");
    title.textContent = s.title;
    title.style.cursor = "pointer";
    title.onclick = () => loadSession(s.id);

    const del = document.createElement("button");
    del.textContent = "🗑️";
    del.onclick = async e => {
      e.stopPropagation();
      if (!confirm("Delete this session?")) return;
      await fetch(`/session/${s.id}`, { method: "DELETE" });
      if (currentSessionId === s.id) clearChat();
      loadSessions();
    };

    div.appendChild(title);
    div.appendChild(del);
    sessionsDiv.appendChild(div);
  });
}

/* ================= LOAD SESSION ================= */

async function loadSession(id) {
  currentSessionId = id;
  clearChat();

  const res = await fetch(`/session/${id}`);
  const data = await res.json();
  if (!data.history) return;

  renderHistory(data.history);
  connectLiveStream(id);
}

/* ================= SAFE POLLING (FALLBACK) ================= */

async function refreshSession(force = false) {
  if (!currentSessionId || (permissionGateActive && !force)) return;

  const res = await fetch(`/session/${currentSessionId}`);
  const data = await res.json();
  if (!data.history) return;

  if (data.history.length > lastRenderedLength) {
    renderHistory(data.history);
  }
}

/* ================= NEW SESSION ================= */

async function newSession() {
  const res = await fetch("/session", { method: "POST" });
  const data = await res.json();
  currentSessionId = data.id;
  clearChat();
  loadSessions();
}

/* ================= SEND MESSAGE ================= */

async function sendMessage(extra = {}) {
  const msg = (extra.message ?? input.value).trim();
  if (!msg && !extra.force) return;

  if (!currentSessionId) await newSession();

  input.value = "";

  const res = await fetch("/mcp/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: msg,
      sessionId: currentSessionId,
      ...extra
    })
  });

  const data = await res.json();
  if (
    data.reply &&
    (
      ["cancelled", "idle", "stopping"].includes(data.state) ||
      data.reply.startsWith("Waiting for")
    )
  ) {
    print("MCP", data.reply, { kind: data.kind || "chat", state: data.state || "info" });
  }

  await refreshSession(true);

  loadSessions();
}

/* ================= EVENTS ================= */

sendBtn.onclick = () => sendMessage();

input.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

tiredBtn.onclick = () =>
  sendMessage({ force: true, message: "i am tired" });

document.getElementById("newSessionBtn").onclick = newSession;
document.getElementById("stopBtn").onclick = () =>
  sendMessage({ force: true, message: "stop" });

/* ================= AUTO REFRESH ================= */

setInterval(refreshSession, 1500);

/* ================= INIT ================= */

loadSessions();
