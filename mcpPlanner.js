import fetch from "node-fetch";

const OLLAMA = "http://localhost:11434/api/generate";
const MODEL = "thirdeyeai/Qwen2.5-Coder-7B-Instruct-Uncensored:Q4_0";

export async function generatePlan(message) {
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

  const text = await r.text();
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : {};
}

