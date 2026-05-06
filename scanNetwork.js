import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

const execAsync = promisify(exec);

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

    onStatus(`🖥️ Running: ${command}`);
    
    const { stdout, stderr } = await execAsync(command, { timeout: 300000 });
    
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
    const { stdout } = await execAsync(`nmap -sn ${subnet}`, { timeout: 600000 });
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
