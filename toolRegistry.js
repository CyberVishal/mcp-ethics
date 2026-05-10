const PLATFORM = "macos";

export const TOOL_REGISTRY = [
  {
    name: "nmap",
    category: "network_scanner",
    allowedPlatforms: ["macos"],
    requiresOutputFile: true,
    safeArguments: ["-sn", "-sT", "-sV", "-Pn", "-p", "-F", "-T3", "-T4", "--top-ports"],
    blockedArguments: ["-sS", "-O", "-A", "--privileged", "--script", "--script-args", "--osscan-guess"],
    description: "Defensive host discovery, TCP port scanning, and service/version detection."
  },
  {
    name: "whois",
    category: "recon",
    allowedPlatforms: ["macos"],
    requiresOutputFile: true,
    safeArguments: [],
    blockedArguments: [],
    description: "Domain registration and ownership lookup."
  },
  {
    name: "dig",
    category: "dns_analysis",
    allowedPlatforms: ["macos"],
    requiresOutputFile: true,
    safeArguments: ["A", "AAAA", "MX", "TXT", "NS", "CNAME", "+short", "+trace"],
    blockedArguments: ["-f"],
    description: "DNS record analysis."
  },
  {
    name: "nslookup",
    category: "dns_analysis",
    allowedPlatforms: ["macos"],
    requiresOutputFile: true,
    safeArguments: [],
    blockedArguments: [],
    description: "DNS lookup diagnostics."
  },
  {
    name: "traceroute",
    category: "network_diagnostics",
    allowedPlatforms: ["macos"],
    requiresOutputFile: true,
    safeArguments: ["-m", "-q", "-w"],
    blockedArguments: [],
    description: "Network route diagnostics."
  },
  {
    name: "ping",
    category: "network_diagnostics",
    allowedPlatforms: ["macos"],
    requiresOutputFile: true,
    safeArguments: ["-c", "-W"],
    blockedArguments: ["-f"],
    description: "Basic network reachability check."
  },
  {
    name: "lsof",
    category: "local_audit",
    allowedPlatforms: ["macos"],
    requiresOutputFile: true,
    safeArguments: ["-nP", "-iTCP", "-sTCP:LISTEN"],
    blockedArguments: [],
    description: "Local listening socket audit."
  }
];

export function getTool(name) {
  return TOOL_REGISTRY.find(tool => tool.name === name) || null;
}

export function validateToolCommand(command = "") {
  const parsed = parseToolCommand(command);
  if (!parsed.tool) return { ok: true, reason: null, parsed };

  const tool = getTool(parsed.tool);
  if (!tool) {
    return { ok: false, reason: "UNREGISTERED_TOOL", parsed };
  }

  if (!tool.allowedPlatforms.includes(PLATFORM)) {
    return { ok: false, reason: "TOOL_PLATFORM_NOT_ALLOWED", parsed };
  }

  const blocked = parsed.args.find(arg =>
    tool.blockedArguments.some(blockedArg => arg === blockedArg || arg.startsWith(`${blockedArg}=`))
  );
  if (blocked) {
    return { ok: false, reason: `BLOCKED_TOOL_ARGUMENT:${blocked}`, parsed };
  }

  if (parsed.tool === "nmap") {
    const issue = validateNmapArguments(parsed.args);
    if (issue) return { ok: false, reason: issue, parsed };
  }

  return { ok: true, reason: null, parsed };
}

export function parseToolCommand(command = "") {
  const unwrapped = unwrapShellCommand(String(command).trim());
  const tokens = splitCommand(unwrapped);
  const toolIndex = tokens.findIndex(token => getTool(baseName(token)));
  if (toolIndex === -1) return { tool: null, args: [], tokens, command: unwrapped };

  return {
    tool: baseName(tokens[toolIndex]),
    args: tokens.slice(toolIndex + 1),
    tokens,
    command: unwrapped
  };
}

function validateNmapArguments(args) {
  if (args.includes("-sn") && (args.includes("-sT") || args.includes("-sV") || args.includes("-A"))) {
    return "INVALID_NMAP_HOST_DISCOVERY_COMBINATION";
  }
  if (!args.some(arg => !arg.startsWith("-"))) {
    return "NMAP_TARGET_REQUIRED";
  }
  return null;
}

function unwrapShellCommand(command) {
  const match = command.match(/^\/bin\/(?:bash|sh|zsh)\s+-c\s+(['"])([\s\S]*)\1$/);
  return match ? match[2] : command;
}

function baseName(token) {
  return token.split("/").pop();
}

function splitCommand(command) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;

  while ((match = pattern.exec(command)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }

  return tokens;
}
