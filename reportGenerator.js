import fs from "fs";
import path from "path";
import os from "os";

export function generateWorkflowReports({ workflow, stepResults, summary }) {
  const reportsDir = path.join(os.homedir(), "Desktop", "MCP_Output", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const base = `${workflow.workflowId}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const jsonPath = path.join(reportsDir, `${base}.json`);
  const markdownPath = path.join(reportsDir, `${base}.md`);

  const report = {
    workflowId: workflow.workflowId,
    prompt: workflow.prompt,
    target: workflow.target,
    classification: workflow.classification,
    generatedAt: new Date().toISOString(),
    summary,
    steps: stepResults.map(step => ({
      stepId: step.stepId,
      title: step.title,
      category: step.category,
      commands: step.commands,
      status: step.status,
      exitCode: step.exitCode,
      stdoutTail: String(step.stdout || "").slice(-2000),
      stderrTail: String(step.stderr || "").slice(-2000)
    }))
  };

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(markdownPath, renderMarkdown(report));

  return {
    jsonPath,
    markdownPath,
    report
  };
}

function renderMarkdown(report) {
  return `# MCP Security Workflow Report

- Workflow ID: ${report.workflowId}
- Target: ${report.target}
- Intent: ${report.classification.category}
- Risk Level: ${report.classification.riskLevel}
- Generated: ${report.generatedAt}

## Risk Summary

${report.summary.risk_summary}

## Severity

${report.summary.severity}

## Findings

${list(report.summary.findings)}

## Exposed Services

${list(report.summary.exposed_services)}

## Recommendations

${list(report.summary.recommendations)}

## Remediation Guidance

${list(report.summary.remediation_guidance)}

## Execution Steps

${report.steps.map(step => `### ${step.title}

- Step ID: ${step.stepId}
- Category: ${step.category}
- Status: ${step.status}
- Commands: ${step.commands.join("; ") || "none"}

\`\`\`text
${step.stdoutTail || step.stderrTail || "No command output captured."}
\`\`\`
`).join("\n")}
`;
}

function list(items) {
  if (!items || items.length === 0) return "- None";
  return items.map(item => `- ${item}`).join("\n");
}
