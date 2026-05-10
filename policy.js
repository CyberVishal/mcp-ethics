import { validateToolCommand } from "./toolRegistry.js";

const DISALLOWED_INTENT_PATTERNS = [
  /\b(malware|ransomware|keylogger|stealer|credential theft|phish(?:ing)? kit)\b/i,
  /\b(persistence|backdoor|rootkit|botnet|dropper)\b/i,
  /\b(reverse shell|bind shell)\b/i,
  /\b(steal|harvest|capture|collect|dump)\s+(?:passwords?|credentials?|tokens?|cookies?|hashes)\b/i,
  /\bbrute[- ]force\b.*\b(login|password|ssh|credentials?)\b/i,
  /\b(exfiltrate|dump passwords?|dump hashes|steal cookies?|token theft)\b/i,
  /\b(wipe|destroy|brick|encrypt files|delete all)\b/i
];

const CONCEPTUAL_PATTERNS = [
  /\b(what is|what are|explain|how does|how do|why does|difference between)\b/i,
  /\b(concept|overview|theory|educational|learn about)\b/i
];

const ACTIONABLE_PATTERNS = [
  /\b(scan|enumerate|recon|audit|check|test|run|find|discover|map)\b/i,
  /\b(nmap|nikto|whois|traceroute|nslookup|dig|netstat|lsof)\b/i,
  /\b(local network|subnet|host|port|vulnerabilit(?:y|ies)|open ports?)\b/i
];

const ACTION_VERB_PATTERNS = [
  /\b(scan|enumerate|recon|audit|check|test|run|find|discover|map)\b/i
];

const CYBER_PATTERNS = [
  /\b(wifi|wi-fi|network|cyber|security|vuln|vulnerabilit(?:y|ies)|exploit|payload)\b/i,
  /\b(recon|osint|metasploit|nmap|nikto|port scan|open ports?|firewall|dns|whois)\b/i,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/i
];

const INFO_PATTERNS = [
  /\b(what is|define|tell me about|describe)\b/i
];

const CASUAL_PATTERNS = [
  /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool|bro|hello bro)[!. ]*$/i
];

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-[^\n]*r[^\n]*f\b/i,
  /\brm\s+-[^\n]*f[^\n]*r\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=.*\bof=\/dev\//i,
  /\bshutdown\b|\breboot\b|\bhalt\b/i,
  /\b(chmod\s+\+s|chown\s+root)\b/i,
  /\b(crontab|launchctl|systemctl\s+enable)\b/i,
  /\b(nc|netcat)\b[^\n]*(?:-e|\/bin\/sh|\/bin\/bash)/i,
  /\b(bash|sh|zsh)\s+-i\b/i,
  /\/dev\/tcp\//i,
  /\bcurl\b[^\n|;&]*\|\s*(?:sh|bash|zsh)\b/i,
  /\bwget\b[^\n|;&]*\|\s*(?:sh|bash|zsh)\b/i,
  /\bapt-get\b|\byum\b|\bdnf\b/i
];

const VALID_ABSOLUTE_SHELLS = new Set([
  "/bin/bash",
  "/bin/sh",
  "/bin/zsh"
]);

export function classifyIntent(message = "") {
  const text = String(message).trim();
  const lower = text.toLowerCase();

  if (!text) {
    return { kind: "conversational", executable: false, reason: "EMPTY_MESSAGE" };
  }

  if (lower === "run" || lower === "cancel" || lower === "stop") {
    return { kind: "control", executable: false, reason: "CONTROL_MESSAGE" };
  }

  if (DISALLOWED_INTENT_PATTERNS.some(pattern => pattern.test(text))) {
    return { kind: "disallowed", executable: false, reason: "DISALLOWED_SECURITY_REQUEST" };
  }

  if (CASUAL_PATTERNS.some(pattern => pattern.test(text))) {
    return { kind: "conversational", executable: false, reason: "CASUAL_CHAT" };
  }

  const isCyber = CYBER_PATTERNS.some(pattern => pattern.test(text));
  const isConceptual = CONCEPTUAL_PATTERNS.some(pattern => pattern.test(text));
  const isActionable = ACTIONABLE_PATTERNS.some(pattern => pattern.test(text));
  const hasActionVerb = ACTION_VERB_PATTERNS.some(pattern => pattern.test(text));

  if (isCyber && isConceptual && !hasActionVerb) {
    return { kind: "conceptual_cybersecurity", executable: false, reason: "CONCEPTUAL_CYBER" };
  }

  if (isCyber && isActionable) {
    return { kind: "actionable_automation", executable: true, reason: "ACTIONABLE_SECURITY_AUTOMATION" };
  }

  if (INFO_PATTERNS.some(pattern => pattern.test(text)) || isConceptual) {
    return { kind: "informational", executable: false, reason: "INFORMATIONAL" };
  }

  return { kind: "conversational", executable: false, reason: "DEFAULT_CHAT" };
}

export function buildRejectedPlan(message, reason) {
  return normalizePlan({
    type: "rejected",
    task: "Request rejected by safety policy",
    platform: "macos",
    tools: [],
    install: [],
    commands: [],
    output_file: "",
    debug: [{ reason, message }]
  });
}

export function emptyPlan(task = "No executable action required", debug = []) {
  return normalizePlan({
    type: "agent_task",
    task,
    platform: "macos",
    tools: [],
    install: [],
    commands: [],
    output_file: "",
    debug
  });
}

export function normalizePlan(plan = {}) {
  const safePlan = plan && typeof plan === "object" ? plan : {};
  return {
    type: typeof safePlan.type === "string" ? safePlan.type : "agent_task",
    task: typeof safePlan.task === "string" && safePlan.task.trim()
      ? safePlan.task.trim()
      : "Automation task",
    platform: "macos",
    tools: Array.isArray(safePlan.tools) ? safePlan.tools.filter(isNonEmptyString) : [],
    install: Array.isArray(safePlan.install) ? safePlan.install.filter(isNonEmptyString) : [],
    commands: Array.isArray(safePlan.commands) ? safePlan.commands.filter(isNonEmptyString) : [],
    output_file: sanitizeOutputFile(safePlan.output_file),
    debug: Array.isArray(safePlan.debug) ? safePlan.debug : []
  };
}

export function validatePlanSafety(plan) {
  const normalized = normalizePlan(plan);
  const normalizedInstall = [];
  const normalizedCommands = [];

  for (const command of normalized.install) {
    const commandIssue = validateCommand(command);
    if (commandIssue) {
      return { ok: false, reason: commandIssue, plan: normalized };
    }
    normalizedInstall.push(normalizeCommand(command));
  }

  for (const command of normalized.commands) {
    const commandIssue = validateCommand(command);
    if (commandIssue) {
      return { ok: false, reason: commandIssue, plan: normalized };
    }
    normalizedCommands.push(normalizeCommand(command));
  }

  normalized.install = normalizedInstall;
  normalized.commands = normalizedCommands;
  return { ok: true, reason: null, plan: normalized };
}

export function normalizeCommand(command = "") {
  const result = normalizeCommandResult(command);
  if (!result.ok) {
    const err = new Error(result.reason);
    err.code = result.reason;
    throw err;
  }
  return result.command;
}

export function validateCommand(command = "") {
  const normalizedResult = normalizeCommandResult(command);
  if (!normalizedResult.ok) return normalizedResult.reason;

  const text = normalizedResult.command;
  if (!text) return "EMPTY_COMMAND";

  if (/\b(?:apt-get|yum|dnf)\b/i.test(text)) {
    return "MACOS_PACKAGE_MANAGER_VIOLATION";
  }

  if (DANGEROUS_COMMAND_PATTERNS.some(pattern => pattern.test(text))) {
    return "DANGEROUS_COMMAND_BLOCKED";
  }

  if (/\b(?:read|select)\b/i.test(text) || /\b--interactive\b/i.test(text)) {
    return "INTERACTIVE_COMMAND_BLOCKED";
  }

  if (/^-/.test(text)) {
    return "COMMAND_FRAGMENT_BLOCKED";
  }

  if (/^(?:brew|\/opt\/homebrew\/bin\/brew)\s*$/i.test(text)) {
    return "INCOMPLETE_INSTALL_COMMAND";
  }

  if (/^(?:\/bin\/)?(?:bash|sh|zsh)\s*$/i.test(text) || /^\/usr\/bin\/env\s+(?:bash|sh|zsh)\s*$/i.test(text)) {
    return "INTERACTIVE_SHELL_BLOCKED";
  }

  const toolValidation = validateToolCommand(text);
  if (!toolValidation.ok) {
    return toolValidation.reason;
  }

  return null;
}

function normalizeCommandResult(command = "") {
  let text = String(command).trim();
  if (!text) return { ok: false, reason: "EMPTY_COMMAND", command: "" };

  text = text.replaceAll("/usr/bin/bash", "/bin/bash");
  text = text.replace(/^\/usr\/bin\/env\s+(bash|sh|zsh)\s+-c\b/, "/bin/$1 -c");
  text = normalizeShellWrappedCommand(text);
  text = normalizeBareCommand(text);

  const invalidShell = findInvalidShellPath(text);
  if (invalidShell) {
    return {
      ok: false,
      reason: "INVALID_MACOS_SHELL_PATH",
      command: text,
      detail: invalidShell
    };
  }

  if (/\b(?:apt-get|yum|dnf)\b/i.test(text)) {
    return { ok: false, reason: "MACOS_PACKAGE_MANAGER_VIOLATION", command: text };
  }

  if (/\b(?:service|systemctl|journalctl|update-rc\.d)\b/i.test(text)) {
    return { ok: false, reason: "LINUX_ONLY_COMMAND_BLOCKED", command: text };
  }

  if (/^-/.test(text)) {
    return { ok: false, reason: "COMMAND_FRAGMENT_BLOCKED", command: text };
  }

  if (/^(?:brew|\/opt\/homebrew\/bin\/brew)\s*$/i.test(text)) {
    return { ok: false, reason: "INCOMPLETE_INSTALL_COMMAND", command: text };
  }

  if (/^(?:\/bin\/)?(?:bash|sh|zsh)\s*$/i.test(text) || /^\/usr\/bin\/env\s+(?:bash|sh|zsh)\s*$/i.test(text)) {
    return { ok: false, reason: "INTERACTIVE_SHELL_BLOCKED", command: text };
  }

  return { ok: true, reason: null, command: text };
}

function findInvalidShellPath(command) {
  const shellPathPattern = /(?:^|[\s;&|])((?:\/(?:usr\/)?(?:local\/)?bin\/)(?:bash|sh|zsh|dash|fish|ksh))\b/g;
  let match;

  while ((match = shellPathPattern.exec(command)) !== null) {
    const shellPath = match[1];
    if (!VALID_ABSOLUTE_SHELLS.has(shellPath)) {
      return shellPath;
    }
  }

  return null;
}

function normalizeNmapCommand(command) {
  if (!/(^|[\s;&|])nmap(\s|$)/.test(command)) return command;

  let normalized = command
    .replace(/\s--privileged\b/g, "")
    .replace(/\s-sS\b/g, " -sT")
    .replace(/\s-O\b/g, "")
    .replace(/\s--osscan-guess\b/g, "");

  if (/\s-sn\b/.test(normalized)) {
    normalized = normalized
      .replace(/\s-sT\b/g, "")
      .replace(/\s-sV\b/g, "")
      .replace(/\s-A\b/g, "");
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function normalizeShellWrappedCommand(command) {
  const match = command.match(/^(\/bin\/(?:bash|sh|zsh))\s+-c\s+(['"])([\s\S]*)\2$/);
  if (!match) return command;

  const [, shell, quote, innerCommand] = match;
  return `${shell} -c ${quote}${normalizeBareCommand(innerCommand)}${quote}`;
}

function normalizeBareCommand(command) {
  return removePlannerOutputRedirection(normalizeNmapCommand(command));
}

function removePlannerOutputRedirection(command) {
  return command
    .replace(/\s(?:>>|>)\s*["']?output\.txt["']?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeOutputFile(outputFile) {
  if (typeof outputFile !== "string" || !outputFile.trim()) return "";
  const base = outputFile.trim().replace(/[/\\]/g, "_");
  return base || "";
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
