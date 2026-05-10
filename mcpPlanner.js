import fetch from "node-fetch";
import {
  buildRejectedPlan,
  classifyIntent,
  emptyPlan,
  normalizePlan,
  validatePlanSafety
} from "./policy.js";

const OLLAMA = "http://localhost:11434/api/generate";
const MODEL = "llama3.2";

export async function generatePlan(message) {
  const intent = classifyIntent(message);

  if (intent.kind === "disallowed") {
    return buildRejectedPlan(message, intent.reason);
  }

  if (!intent.executable) {
    return emptyPlan("Conceptual or conversational request; no execution required", [
      { intent: intent.kind, reason: intent.reason }
    ]);
  }

  const r = await fetch(OLLAMA, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      prompt: `
You are an ELITE ethical hacking planner.

You design SAFE, LEGAL plans.
You NEVER execute.

Rules:
- Return ONLY valid JSON
- No explanations
- No markdown
- Reject unsafe requests by returning commands = []
- Defensive scanning, recon, local auditing, and safe automation are allowed
- Malware, credential theft, ransomware, persistence, destructive commands, and shells are forbidden

Platform rules:
- macOS uses brew
- NEVER use apt-get
- NEVER use yum
- NEVER use sudo unless absolutely required
- Use /bin/bash, /bin/sh, or /bin/zsh only; NEVER use /usr/bin/bash
- For nmap on macOS, prefer non-privileged syntax: nmap -sT -sV, nmap -sn, nmap -A only when needed
- Do not use nmap -sS, -O, --privileged, or Linux-only flags
- Commands must run non-interactively
- If user intent is actionable → commands MUST exist
- If conceptual → commands = []

Request:
"${message}"

Schema:
{
  "type": "agent_task",
  "task": "summary",
  "platform": "macos",
  "tools": [],
  "install": [],
  "commands": [],
  "output_file": "output.txt",
  "debug": []
}
`
    })
  });

  const data = await r.json();
  const raw = data.response || "";
  const match = raw.match(/\{[\s\S]*\}/);

  if (!match) {
    return emptyPlan("Planner returned no JSON", [
      { reason: "NO_JSON_FROM_MODEL", raw_tail: raw.slice(-500) }
    ]);
  }

  try {
    const parsed = normalizePlan(JSON.parse(match[0]));
    const safety = validatePlanSafety(parsed);
    if (!safety.ok) {
      return emptyPlan("Planner command rejected by safety policy", [
        { reason: safety.reason, rejected_plan: safety.plan }
      ]);
    }
    return safety.plan;
  } catch (err) {
    return emptyPlan("Planner returned malformed JSON", [
      { reason: "MALFORMED_JSON_FROM_MODEL", error: err.message }
    ]);
  }
}

export async function generateChatResponse(message) {
  const r = await fetch(OLLAMA, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      prompt: `
You are a friendly AI assistant.

Reply naturally and conversationally.

User:
${message}
`
    })
  });

  const data = await r.json();

  return data.response || "I could not generate a reply.";
}
