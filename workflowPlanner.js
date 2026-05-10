import { v4 as uuidv4 } from "uuid";
import { classifySecurityIntent } from "./intentClassifier.js";
import { validateCommand } from "./policy.js";

export function buildWorkflow(prompt = "") {
  const classification = classifySecurityIntent(prompt);
  const target = inferTarget(classification.normalizedPrompt);
  const workflowId = uuidv4();
  const steps = [];

  if (!classification.safety.allowed || classification.category === "disallowed") {
    return {
      workflowId,
      type: "workflow",
      status: "rejected",
      prompt,
      target,
      classification,
      steps: [],
      reports: []
    };
  }

  addStepsForCategory(steps, classification.category, target);
  ensureSummaryStep(steps);

  const workflow = {
    workflowId,
    type: "workflow",
    status: "planned",
    prompt,
    target,
    classification,
    steps: steps.map((step, index) => ({
      id: `step_${index + 1}`,
      order: index + 1,
      status: "pending",
      retryCount: 0,
      dependencies: index === 0 ? [] : [`step_${index}`],
      ...step
    })),
    reports: []
  };

  return validateWorkflow(workflow);
}

export function workflowToPlan(workflow) {
  return {
    type: "agent_task",
    task: workflow.classification.category,
    platform: "macos",
    tools: [...new Set(workflow.steps.flatMap(step => step.tools || []))],
    install: [],
    commands: workflow.steps.flatMap(step => step.commands || []),
    output_file: `${workflow.workflowId}.txt`,
    debug: [{ workflowId: workflow.workflowId }]
  };
}

function addStepsForCategory(steps, category, target) {
  if (category === "recon") {
    steps.push(hostDiscovery(target));
    steps.push(portScan(target));
    steps.push(serviceDetection(target));
    return;
  }
  if (category === "host_discovery") {
    steps.push(hostDiscovery(target));
    return;
  }
  if (category === "port_scan") {
    steps.push(hostDiscovery(target));
    steps.push(portScan(target));
    return;
  }
  if (category === "service_detection") {
    steps.push(portScan(target));
    steps.push(serviceDetection(target));
    return;
  }
  if (category === "dns_analysis") {
    steps.push(dnsAnalysis(target));
    return;
  }
  if (category === "vuln_scan") {
    steps.push(hostDiscovery(target));
    steps.push(portScan(target));
    steps.push(serviceDetection(target));
    steps.push(safeVulnReview(target));
    return;
  }
  if (category === "network_diagnostics") {
    steps.push(networkDiagnostics(target));
    return;
  }
  if (category === "log_analysis") {
    steps.push(localListeningAudit());
    return;
  }
  if (category === "report_generation") {
    steps.push(localListeningAudit());
    return;
  }

  steps.push(hostDiscovery(target));
}

function hostDiscovery(target) {
  return {
    category: "host_discovery",
    title: "Host discovery",
    tools: ["nmap"],
    commands: [`nmap -sn ${target}`],
    description: "Confirm host reachability without port scanning."
  };
}

function portScan(target) {
  return {
    category: "port_scan",
    title: "TCP port scan",
    tools: ["nmap"],
    commands: [`nmap -sT -F ${target}`],
    description: "Scan a small safe TCP port set."
  };
}

function serviceDetection(target) {
  return {
    category: "service_detection",
    title: "Service detection",
    tools: ["nmap"],
    commands: [`nmap -sT -sV --top-ports 25 ${target}`],
    description: "Identify exposed service versions on common ports."
  };
}

function dnsAnalysis(target) {
  return {
    category: "dns_analysis",
    title: "DNS analysis",
    tools: ["dig", "nslookup"],
    commands: [`dig ${target} A`, `dig ${target} MX`, `nslookup ${target}`],
    description: "Collect basic DNS records."
  };
}

function networkDiagnostics(target) {
  return {
    category: "network_diagnostics",
    title: "Network diagnostics",
    tools: ["ping", "traceroute"],
    commands: [`ping -c 4 ${target}`, `traceroute -m 12 ${target}`],
    description: "Check reachability and route path."
  };
}

function localListeningAudit() {
  return {
    category: "log_analysis",
    title: "Local listening socket audit",
    tools: ["lsof"],
    commands: ["lsof -nP -iTCP -sTCP:LISTEN"],
    description: "List local listening TCP services."
  };
}

function safeVulnReview(target) {
  return {
    category: "vuln_scan",
    title: "Safe vulnerability review",
    tools: ["nmap"],
    commands: [`nmap -sT -sV --top-ports 25 ${target}`],
    description: "Collect service data for defensive review without exploit scripts."
  };
}

function ensureSummaryStep(steps) {
  steps.push({
    category: "report_generation",
    title: "Summarize findings",
    tools: [],
    commands: [],
    description: "Generate defensive findings, severity, recommendations, and reports."
  });
}

function inferTarget(prompt) {
  if (/\blocalhost\b/.test(prompt)) return "127.0.0.1";
  const ip = prompt.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  if (ip) return ip[0];
  const cidr = prompt.match(/\b(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b/);
  if (cidr) return cidr[0];
  const domain = prompt.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/);
  if (domain) return domain[0];
  return "127.0.0.1";
}

function validateWorkflow(workflow) {
  for (const step of workflow.steps) {
    for (const command of step.commands || []) {
      const issue = validateCommand(command);
      if (issue) {
        return {
          ...workflow,
          status: "rejected",
          rejectionReason: issue,
          steps: []
        };
      }
    }
  }

  return workflow;
}
