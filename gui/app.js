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

function print(role, text) {
  output.textContent += `${role}: ${text}\n`;
  output.scrollTop = output.scrollHeight;

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
  output.textContent = "";
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
    if (m.role === "user") print("You", m.content);
    if (m.role === "assistant") print("MCP", m.content);
  }
  lastRenderedLength = history.length;
}

/* ================= LIVE STREAM (SSE) ================= */

function connectLiveStream(sessionId) {
  if (eventSource) eventSource.close();

  eventSource = new EventSource(`/session/${sessionId}/stream`);

  eventSource.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg?.content) {
        print("MCP", msg.content);
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

async function refreshSession() {
  if (!currentSessionId || permissionGateActive) return;

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
  const msg = input.value.trim();
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
  if (data.reply) print("MCP", data.reply);

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

/* ================= AUTO REFRESH ================= */

setInterval(refreshSession, 1500);

/* ================= INIT ================= */

loadSessions();

