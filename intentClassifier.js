import { classifyIntent as classifyLegacyIntent } from "./policy.js";

const CATEGORIES = new Set([
  "conversational",
  "conceptual",
  "recon",
  "host_discovery",
  "port_scan",
  "service_detection",
  "dns_analysis",
  "vuln_scan",
  "log_analysis",
  "network_diagnostics",
  "report_generation",
  "disallowed"
]);

export function classifySecurityIntent(prompt = "") {
  const original = String(prompt || "");
  const normalizedPrompt = normalizePrompt(original);
  const legacy = classifyLegacyIntent(normalizedPrompt);
  const reasons = [];

  if (legacy.kind === "disallowed") {
    return buildResult({
      original,
      normalizedPrompt,
      category: "disallowed",
      actionable: false,
      riskLevel: "blocked",
      reasons: [legacy.reason],
      safety: { allowed: false, reason: legacy.reason }
    });
  }

  if (!normalizedPrompt || (legacy.kind === "conversational" && ["EMPTY_MESSAGE", "CASUAL_CHAT"].includes(legacy.reason))) {
    return buildResult({
      original,
      normalizedPrompt,
      category: "conversational",
      actionable: false,
      riskLevel: "low",
      reasons: [legacy.reason],
      safety: { allowed: true, reason: "NON_SECURITY_CHAT" }
    });
  }

  if (legacy.kind === "conceptual_cybersecurity" || legacy.kind === "informational") {
    return buildResult({
      original,
      normalizedPrompt,
      category: "conceptual",
      actionable: false,
      riskLevel: "low",
      reasons: [legacy.reason],
      safety: { allowed: true, reason: "EDUCATIONAL_ONLY" }
    });
  }

  const category = detectActionCategory(normalizedPrompt, reasons);
  const riskLevel = riskForCategory(category, normalizedPrompt);

  return buildResult({
    original,
    normalizedPrompt,
    category,
    actionable: category !== "conversational" && category !== "conceptual",
    riskLevel,
    reasons,
    safety: {
      allowed: CATEGORIES.has(category) && category !== "disallowed",
      reason: "AUTHORIZED_DEFENSIVE_WORKFLOW_REQUIRED",
      requiresApproval: true
    }
  });
}

export function normalizePrompt(prompt = "") {
  return String(prompt)
    .toLowerCase()
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function detectActionCategory(text, reasons) {
  if (/\b(report|summarize|summary|findings|recommendations)\b/.test(text)) {
    reasons.push("REPORT_KEYWORD");
    return "report_generation";
  }
  if (/\b(log|logs|syslog|auth\.log|console)\b/.test(text)) {
    reasons.push("LOG_KEYWORD");
    return "log_analysis";
  }
  if (/\b(dns|dig|nslookup|mx|txt|a record|aaaa|cname|zone)\b/.test(text)) {
    reasons.push("DNS_KEYWORD");
    return "dns_analysis";
  }
  if (/\b(vuln|vulnerability|nikto|cve|weakness|misconfiguration)\b/.test(text)) {
    reasons.push("VULN_KEYWORD");
    return "vuln_scan";
  }
  if (/\b(service|version|banner|fingerprint|-sv)\b/.test(text)) {
    reasons.push("SERVICE_KEYWORD");
    return "service_detection";
  }
  if (/\b(port|open ports?|listening)\b/.test(text)) {
    reasons.push("PORT_KEYWORD");
    return "port_scan";
  }
  if (/\b(host discovery|discover hosts|alive hosts|subnet|local network|-sn)\b/.test(text)) {
    reasons.push("HOST_DISCOVERY_KEYWORD");
    return "host_discovery";
  }
  if (/\b(ping|traceroute|trace route|latency|connectivity|diagnose|diagnostic)\b/.test(text)) {
    reasons.push("NETWORK_DIAGNOSTIC_KEYWORD");
    return "network_diagnostics";
  }
  if (/\b(recon|reconnaissance|whois|enumerate|analyze|scan|audit|localhost|127\.0\.0\.1)\b/.test(text)) {
    reasons.push("RECON_KEYWORD");
    return "recon";
  }

  reasons.push("ACTIONABLE_FALLBACK");
  return "recon";
}

function riskForCategory(category, text) {
  if (category === "vuln_scan") return "medium";
  if (category === "service_detection" || category === "port_scan") return "low-medium";
  if (/\bsubnet|\/24|local network\b/.test(text)) return "low-medium";
  return "low";
}

function buildResult({ original, normalizedPrompt, category, actionable, riskLevel, reasons, safety }) {
  return {
    category,
    normalizedPrompt,
    actionable,
    riskLevel,
    reasoning: {
      original,
      signals: reasons,
      decidedAt: new Date().toISOString()
    },
    safety: {
      allowed: true,
      requiresApproval: actionable,
      ...safety
    }
  };
}
