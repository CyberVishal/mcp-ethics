import fetch from "node-fetch";

const OLLAMA = "http://localhost:11434/api/generate";
const MODEL = "llama3.2";

export async function generateSecuritySummary({ workflow, stepResults }) {
  const fallback = buildDeterministicSummary(workflow, stepResults);

  try {
    const r = await fetch(OLLAMA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        prompt: `
You are a defensive security analyst.
Return ONLY valid JSON with:
{
  "findings": [],
  "severity": "low|medium|high",
  "exposed_services": [],
  "recommendations": [],
  "risk_summary": "",
  "remediation_guidance": []
}

Rules:
- Defensive analysis only.
- No exploit steps.
- No payloads.
- No malware or credential theft guidance.

Workflow:
${JSON.stringify(workflow, null, 2)}

Command output:
${JSON.stringify(stepResults, null, 2).slice(0, 12000)}
`
      })
    });

    const data = await r.json();
    const match = String(data.response || "").match(/\{[\s\S]*\}/);
    if (!match) return fallback;

    return normalizeSummary(JSON.parse(match[0]), fallback);
  } catch (_) {
    return fallback;
  }
}

export function buildDeterministicSummary(workflow, stepResults = []) {
  const text = stepResults.map(step => step.stdout || "").join("\n");
  const exposedServices = [];

  for (const line of text.split("\n")) {
    if (/\bopen\b/.test(line)) {
      exposedServices.push(line.trim());
    }
  }

  return {
    findings: exposedServices.length
      ? exposedServices.map(service => `Open service observed: ${service}`)
      : ["No exposed services were identified in the collected output."],
    severity: exposedServices.length > 5 ? "medium" : "low",
    exposed_services: exposedServices,
    recommendations: [
      "Confirm every exposed service is authorized and required.",
      "Restrict administrative services to trusted networks.",
      "Keep service versions patched and remove unused listeners."
    ],
    risk_summary: exposedServices.length
      ? `${exposedServices.length} exposed service entries were observed for ${workflow.target}.`
      : `No exposed service entries were observed for ${workflow.target}.`,
    remediation_guidance: [
      "Review firewall rules.",
      "Disable unnecessary services.",
      "Document approved exposure and ownership."
    ]
  };
}

function normalizeSummary(summary, fallback) {
  const findings = coerceList(summary.findings);
  const exposedServices = coerceList(summary.exposed_services);
  const recommendations = coerceList(summary.recommendations)
    .filter(item => !/\b(exploit|payload|reverse shell|malware|steal|enable upnp)\b/i.test(item));
  const remediation = coerceList(summary.remediation_guidance)
    .filter(item => !/\b(exploit|payload|reverse shell|malware|steal)\b/i.test(item));

  return {
    findings: findings.length ? findings : fallback.findings,
    severity: ["low", "medium", "high"].includes(summary.severity) ? summary.severity : fallback.severity,
    exposed_services: exposedServices.length ? exposedServices : fallback.exposed_services,
    recommendations: recommendations.length ? recommendations : fallback.recommendations,
    risk_summary: typeof summary.risk_summary === "string" ? summary.risk_summary : fallback.risk_summary,
    remediation_guidance: remediation.length ? remediation : fallback.remediation_guidance
  };
}

function coerceList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return String(item || "");
      return item.description || item.recommendation || item.detail || item.service_name ||
        Object.entries(item).map(([key, val]) => `${key}: ${val}`).join(", ");
    })
    .map(item => String(item).trim())
    .filter(Boolean);
}
