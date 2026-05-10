import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { normalizeCommand, validateCommand } from "./policy.js";

const SCAN_TIMEOUT_MS = 10 * 60 * 1000;

export async function scanNetwork({ target, scanType = "nmap", onStatus }) {
  const scanId = uuidv4();
  const outputDir = path.join(os.homedir(), "Desktop", "MCP_Scans");
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const logFile = path.join(outputDir, `scan_${target.replace(/[:.]/g, "_")}_${Date.now()}.txt`);

  try {
    onStatus(`🔍 Starting ${scanType} scan on ${target}...`);

    let command = "";
    
    if (scanType === "nmap") {
      command = `nmap -sV -p- --open ${target}`;
    } else if (scanType === "nikto") {
      command = `nikto -h ${target}`;
    } else if (scanType === "whois") {
      command = `whois ${target}`;
    } else if (scanType === "traceroute") {
      command = `traceroute -m 30 ${target}`;
    } else if (scanType === "dns") {
      command = `nslookup ${target}`;
    } else {
      throw new Error(`Unknown scan type: ${scanType}`);
    }

    const commandIssue = validateCommand(command);
    if (commandIssue) {
      throw new Error(`Blocked scan command: ${commandIssue}`);
    }
    command = normalizeCommand(command);

    onStatus(`🖥️ Running: ${command}`);
    
    const { stdout, stderr } = await runStreamingCommand({
      command,
      timeoutMs: SCAN_TIMEOUT_MS,
      onStdout: chunk => onStatus(chunk),
      onStderr: chunk => onStatus(`⚠️ ${chunk}`)
    });
    
    const results = {
      scanId,
      target,
      scanType,
      timestamp,
      command,
      stdout,
      stderr,
      status: "completed"
    };

    fs.writeFileSync(
      logFile,
      `SCAN REPORT\n============\nTarget: ${target}\nType: ${scanType}\nTime: ${timestamp}\n\n` +
      `COMMAND:\n${command}\n\n` +
      `OUTPUT:\n${stdout}\n\n` +
      `ERRORS:\n${stderr}`
    );

    onStatus(`✅ Scan completed. Results saved to ${logFile}`);
    
    return {
      ...results,
      logFile,
      vulnerabilities: parseVulnerabilities(stdout, scanType)
    };

  } catch (err) {
    const errorMsg = `❌ Scan failed: ${err.message}`;
    onStatus(errorMsg);

    fs.writeFileSync(
      logFile,
      `SCAN FAILED\n===========\nTarget: ${target}\nError: ${err.message}\nTime: ${timestamp}`
    );

    return {
      scanId,
      target,
      scanType,
      timestamp,
      status: "failed",
      error: err.message,
      logFile
    };
  }
}

function parseVulnerabilities(output, scanType) {
  const vulns = [];

  if (scanType === "nmap") {
    const lines = output.split("\n");
    lines.forEach((line, idx) => {
      if (line.includes("open")) {
        vulns.push({
          type: "OPEN_PORT",
          detail: line.trim(),
          severity: "medium"
        });
      }
    });
  } else if (scanType === "nikto") {
    const lines = output.split("\n");
    lines.forEach((line) => {
      if (line.includes("VULNERABILITY") || line.includes("ALERT")) {
        vulns.push({
          type: "WEB_VULNERABILITY",
          detail: line.trim(),
          severity: "high"
        });
      }
    });
  }

  return vulns;
}

export async function scanSubnets({ subnet, onStatus }) {
  onStatus(`🌐 Scanning subnet: ${subnet}...`);
  
  try {
    const command = `nmap -sn ${subnet}`;
    const commandIssue = validateCommand(command);
    if (commandIssue) throw new Error(`Blocked scan command: ${commandIssue}`);
    const normalizedCommand = normalizeCommand(command);

    const { stdout } = await runStreamingCommand({
      command: normalizedCommand,
      timeoutMs: SCAN_TIMEOUT_MS,
      onStdout: chunk => onStatus(chunk),
      onStderr: chunk => onStatus(`⚠️ ${chunk}`)
    });
    const hosts = [];
    
    const lines = stdout.split("\n");
    lines.forEach(line => {
      if (line.includes("Nmap scan report for")) {
        const match = line.match(/for ([\d.]+)/);
        if (match) hosts.push(match[1]);
      }
    });

    onStatus(`✅ Found ${hosts.length} active hosts on ${subnet}`);
    return hosts;
  } catch (err) {
    onStatus(`❌ Subnet scan failed: ${err.message}`);
    return [];
  }
}

export async function generateVulnerabilityReport(scans) {
  const report = {
    generated: new Date().toISOString(),
    totalScans: scans.length,
    successfulScans: scans.filter(s => s.status === "completed").length,
    failedScans: scans.filter(s => s.status === "failed").length,
    totalVulnerabilities: scans.reduce((acc, s) => acc + (s.vulnerabilities?.length || 0), 0),
    scans: scans.map(s => ({
      target: s.target,
      type: s.scanType,
      status: s.status,
      vulnCount: s.vulnerabilities?.length || 0,
      vulnerabilities: s.vulnerabilities || []
    }))
  };

  return report;
}

function runStreamingCommand({ command, timeoutMs, onStdout, onStderr }) {
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/zsh", ["-f", "-c", command], {
      env: {
        ...process.env,
        CI: "1",
        NONINTERACTIVE: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKillTimer = null;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, 2500);
    }, timeoutMs);

    child.stdout.on("data", data => {
      const chunk = data.toString();
      stdout += chunk;
      onStdout?.(chunk);
    });

    child.stderr.on("data", data => {
      const chunk = data.toString();
      stderr += chunk;
      onStderr?.(chunk);
    });

    child.on("error", err => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      reject(err);
    });

    child.on("close", code => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (timedOut) {
        return reject(new Error(`Command timed out after ${Math.round(timeoutMs / 1000)}s`));
      }
      if (code !== 0) {
        return reject(new Error(`Command failed with exit code ${code}: ${stderr.trim()}`));
      }
      resolve({ stdout, stderr });
    });
  });
}
