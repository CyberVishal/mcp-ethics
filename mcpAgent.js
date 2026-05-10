import EventEmitter from "events";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { normalizeCommand, validateCommand, validatePlanSafety } from "./policy.js";
import { generateSecuritySummary } from "./securitySummarizer.js";
import { generateWorkflowReports } from "./reportGenerator.js";
import { updateWorkflowRecord } from "./workflowStore.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export default class MCPAgent extends EventEmitter {
  constructor() {
    super();
    this.activeExecutions = new Map();
  }

  async executePlan({ sessionId, plan }) {
    if (this.activeExecutions.has(sessionId)) {
      this._emitStatus(sessionId, "execution", "blocked", "⏳ Execution already running for this session");
      return { status: "blocked", reason: "DUPLICATE_EXECUTION" };
    }

    const execution = {
      stopped: false,
      children: new Set(),
      outputFiles: new Set(),
      logFile: null
    };
    this.activeExecutions.set(sessionId, execution);

    try {
      this._emitStatus(sessionId, "execution", "running", "🚀 Execution started");

      /* ================= VALIDATION ================= */

      const safety = validatePlanSafety(plan);
      if (!safety.ok) {
        this._emitDebug(sessionId, {
          phase: "validation",
          reason: safety.reason,
          received: safety.plan
        });
        throw new Error(`Plan rejected: ${safety.reason}`);
      }

      plan = safety.plan;
      const commands = Array.isArray(plan.commands) ? plan.commands : [];

      if (commands.length === 0) {
        this._emitDebug(sessionId, {
          phase: "validation",
          reason: "NO_EXECUTABLE_COMMANDS",
          received_plan: plan,
          hint: "Planner must generate at least one shell command"
        });
        throw new Error("Plan has no executable commands");
      }

      /* ================= OUTPUT DIRS ================= */

      const outputDir = path.join(os.homedir(), "Desktop", "MCP_Output");
      const logDir = path.join(outputDir, "logs");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const executionId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const logFile = path.join(logDir, `execution_${executionId}.log`);
      execution.logFile = logFile;
      fs.writeFileSync(logFile, `Execution started: ${new Date().toISOString()}\nTask: ${plan.task}\n\n`);

      /* ================= INSTALL PHASE ================= */

      if (Array.isArray(plan.install) && plan.install.length > 0) {
        for (let i = 0; i < plan.install.length; i++) {
          const installCmd = plan.install[i];

          this._throwIfStopped(execution);
          this._emitStatus(sessionId, "install", "running", `📦 Installing (${i + 1}/${plan.install.length}): ${installCmd}`);

          await this.runCommand({
            command: installCmd,
            sessionId,
            phase: "install",
            execution,
            logFile
          });
        }
      }

      /* ================= EXECUTION PHASE ================= */

      const outputPath = plan.output_file
        ? path.join(outputDir, plan.output_file)
        : path.join(outputDir, `execution_${executionId}.txt`);

      execution.outputFiles.add(outputPath);
      fs.writeFileSync(outputPath, `Task: ${plan.task}\nStarted: ${new Date().toISOString()}\n\n`);

      for (let i = 0; i < commands.length; i++) {
        this._throwIfStopped(execution);
        const command = commands[i];

        this._emitStatus(sessionId, "execute", "running", `🖥️ Command ${i + 1}/${commands.length}: ${command}`);
        fs.appendFileSync(outputPath, `\n$ ${command}\n`);

        await this.runCommand({
          command,
          sessionId,
          phase: "execute",
          execution,
          logFile,
          outputPath
        });
      }

      this._emitStatus(
        sessionId,
        "execution",
        "completed",
        `✅ Execution completed successfully\nOutput: ${outputPath}\nLog: ${logFile}`,
        { outputFiles: [...execution.outputFiles], logFile }
      );

      return { status: "completed", outputFiles: [...execution.outputFiles], logFile };

    } catch (err) {
      const debugPayload = {
        phase: "execution",
        reason: err.code || "EXECUTION_FAILED",
        error: err.message,
        logFile: execution.logFile,
        outputFiles: [...execution.outputFiles]
      };

      this._emitStatus(sessionId, "execution", "failed", `❌ Execution stopped: ${err.message}`, debugPayload);
      this.emit("execution-error", { sessionId, plan, debug: debugPayload });
      return { status: "failed", error: err.message };
    } finally {
      this.activeExecutions.delete(sessionId);
    }
  }

  async executeWorkflow({ sessionId, workflow }) {
    if (this.activeExecutions.has(sessionId)) {
      this._emitWorkflowEvent(sessionId, "workflow_failed", "blocked", "Workflow already running for this session", {
        workflowId: workflow.workflowId,
        reason: "DUPLICATE_EXECUTION"
      });
      return { status: "blocked", reason: "DUPLICATE_EXECUTION" };
    }

    const execution = {
      stopped: false,
      children: new Set(),
      outputFiles: new Set(),
      logFile: null
    };
    this.activeExecutions.set(sessionId, execution);

    const stepResults = [];

    try {
      const outputDir = path.join(os.homedir(), "Desktop", "MCP_Output");
      const logDir = path.join(outputDir, "logs");
      fs.mkdirSync(outputDir, { recursive: true });
      fs.mkdirSync(logDir, { recursive: true });

      const outputPath = path.join(outputDir, `${workflow.workflowId}.txt`);
      const logFile = path.join(logDir, `workflow_${workflow.workflowId}.log`);
      execution.logFile = logFile;
      execution.outputFiles.add(outputPath);
      fs.writeFileSync(outputPath, `Workflow: ${workflow.workflowId}\nTarget: ${workflow.target}\nStarted: ${new Date().toISOString()}\n\n`);
      fs.writeFileSync(logFile, `Workflow started: ${new Date().toISOString()}\n`);

      updateWorkflowRecord(workflow.workflowId, { status: "running", plan: workflow });
      this._emitWorkflowEvent(sessionId, "workflow_started", "running", `Workflow started: ${workflow.workflowId}`, {
        workflowId: workflow.workflowId,
        workflow
      });

      for (const step of workflow.steps) {
        this._throwIfStopped(execution);
        step.status = "running";
        this._emitWorkflowEvent(sessionId, "step_started", "running", `Step ${step.order}: ${step.title}`, {
          workflowId: workflow.workflowId,
          step
        });

        const stepResult = {
          stepId: step.id,
          title: step.title,
          category: step.category,
          commands: step.commands || [],
          status: "completed",
          stdout: "",
          stderr: "",
          startedAt: new Date().toISOString(),
          completedAt: null,
          retryCount: step.retryCount || 0
        };

        for (const command of step.commands || []) {
          this._throwIfStopped(execution);
          this._emitWorkflowEvent(sessionId, "command_started", "running", command, {
            workflowId: workflow.workflowId,
            stepId: step.id,
            command
          });
          fs.appendFileSync(outputPath, `\n[${step.id}] $ ${command}\n`);

          const commandResult = await this.runCommand({
            command,
            sessionId,
            phase: "execute",
            execution,
            logFile,
            outputPath,
            workflowContext: {
              workflowId: workflow.workflowId,
              stepId: step.id
            }
          });

          stepResult.stdout += commandResult.stdout || "";
          stepResult.stderr += commandResult.stderr || "";
          stepResult.exitCode = commandResult.code;
        }

        step.status = "completed";
        stepResult.completedAt = new Date().toISOString();
        stepResults.push(stepResult);
        updateWorkflowRecord(workflow.workflowId, {
          status: "running",
          plan: workflow,
          results: stepResults
        });
        this._emitWorkflowEvent(sessionId, "step_completed", "completed", `Step completed: ${step.title}`, {
          workflowId: workflow.workflowId,
          step,
          result: stepResult
        });
      }

      const summary = await generateSecuritySummary({ workflow, stepResults });
      const reports = generateWorkflowReports({ workflow, stepResults, summary });

      workflow.status = "completed";
      workflow.reports = [
        { type: "markdown", path: reports.markdownPath },
        { type: "json", path: reports.jsonPath }
      ];

      updateWorkflowRecord(workflow.workflowId, {
        status: "completed",
        plan: workflow,
        results: stepResults,
        reports: workflow.reports,
        completed_at: new Date().toISOString()
      });

      this._emitWorkflowEvent(
        sessionId,
        "workflow_completed",
        "completed",
        `Workflow completed: ${workflow.workflowId}\nMarkdown report: ${reports.markdownPath}\nJSON report: ${reports.jsonPath}`,
        {
          workflowId: workflow.workflowId,
          outputFiles: [...execution.outputFiles],
          logFile,
          reports: workflow.reports,
          summary
        }
      );

      return { status: "completed", workflowId: workflow.workflowId, reports: workflow.reports };
    } catch (err) {
      workflow.status = "failed";
      const debugPayload = {
        workflowId: workflow.workflowId,
        reason: err.code || "WORKFLOW_FAILED",
        error: err.message,
        logFile: execution.logFile,
        outputFiles: [...execution.outputFiles],
        results: stepResults
      };

      updateWorkflowRecord(workflow.workflowId, {
        status: "failed",
        plan: workflow,
        results: stepResults,
        failure: JSON.stringify(debugPayload)
      });
      this._emitWorkflowEvent(sessionId, "workflow_failed", "failed", `Workflow failed: ${err.message}`, debugPayload);
      this.emit("execution-error", { sessionId, plan: workflow, debug: debugPayload });
      return { status: "failed", error: err.message };
    } finally {
      this.activeExecutions.delete(sessionId);
    }
  }

  /* ================= CORE EXECUTOR ================= */

  runCommand({ command, sessionId, phase, execution, logFile, outputPath, timeoutMs = DEFAULT_TIMEOUT_MS, workflowContext = null }) {
    return new Promise((resolve, reject) => {
      const commandIssue = validateCommand(command);
      if (commandIssue) {
        return reject(Object.assign(new Error(`Blocked command: ${commandIssue}`), { code: commandIssue }));
      }
      command = normalizeCommand(command);

      const child = spawn("/bin/zsh", ["-f", "-c", command], {
        env: {
          ...process.env,
          CI: "1",
          NONINTERACTIVE: "1",
          HOMEBREW_NO_AUTO_UPDATE: "1",
          HOMEBREW_NO_INSTALL_CLEANUP: "1"
        },
        stdio: ["ignore", "pipe", "pipe"]
      });

      execution.children.add(child);

      let stderrBuffer = "";
      let stdoutBuffer = "";
      let timedOut = false;
      let forceKillTimer = null;

      const timeout = setTimeout(() => {
        timedOut = true;
        this._emitStatus(sessionId, phase, "timeout", `⏱️ Command timed out after ${Math.round(timeoutMs / 1000)}s: ${command}`);
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }, 2500);
      }, timeoutMs);

      const append = (label, msg) => {
        if (logFile) fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${label}: ${msg}`);
        if (outputPath) fs.appendFileSync(outputPath, msg);
      };

      child.stdout.on("data", data => {
        const msg = data.toString();
        stdoutBuffer += msg;
        append("stdout", msg);

        this._emitStatus(sessionId, phase, "stream", msg, {
          stream: "stdout",
          eventType: workflowContext ? "stdout" : undefined,
          ...workflowContext
        });
      });

      child.stderr.on("data", data => {
        const msg = data.toString();
        stderrBuffer += msg;
        append("stderr", msg);

        this._emitStatus(sessionId, phase, "stream", `⚠️ ${msg}`, {
          stream: "stderr",
          eventType: workflowContext ? "stderr" : undefined,
          ...workflowContext
        });
      });

      child.on("error", err => {
        clearTimeout(timeout);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        execution.children.delete(child);
        this._emitDebug(sessionId, {
          phase,
          reason: "SPAWN_ERROR",
          command,
          error: err.message
        });

        reject(err);
      });

      child.on("close", code => {
        clearTimeout(timeout);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        execution.children.delete(child);

        if (timedOut) {
          this._emitDebug(sessionId, {
            phase,
            reason: "COMMAND_TIMEOUT",
            command,
            timeoutMs,
            stderr: stderrBuffer.trim(),
            stdout_tail: stdoutBuffer.slice(-1000)
          });
          return reject(Object.assign(new Error(`Command timed out after ${Math.round(timeoutMs / 1000)}s`), { code: "COMMAND_TIMEOUT" }));
        }

        if (execution.stopped) {
          return reject(Object.assign(new Error("Execution stopped by user"), { code: "USER_STOPPED" }));
        }

        if (code !== 0) {
          this._emitDebug(sessionId, {
            phase,
            reason: "NON_ZERO_EXIT",
            command,
            exit_code: code,
            stderr: stderrBuffer.trim(),
            stdout_tail: stdoutBuffer.slice(-1000),
            hint: "Planner should analyze error and generate corrected command"
          });

          return reject(
            Object.assign(new Error(`Command failed with exit code ${code}`), { code: "NON_ZERO_EXIT" })
          );
        }

        resolve({ stdout: stdoutBuffer, stderr: stderrBuffer, code: 0 });
      });
    });
  }

  stopExecution(sessionId) {
    const execution = this.activeExecutions.get(sessionId);
    if (!execution) return false;

    execution.stopped = true;
    for (const child of execution.children) {
      child.kill("SIGTERM");
    }
    this._emitStatus(sessionId, "execution", "stopping", "🛑 Stop requested");
    return true;
  }

  /* ================= DEBUG EMITTER ================= */

  _emitDebug(sessionId, payload) {
    this._emitStatus(
      sessionId,
      "debug",
      "failed",
      "🧠 EXECUTION ERROR — DEBUG PAYLOAD:\n" +
        JSON.stringify(
          {
            error: true,
            timestamp: new Date().toISOString(),
            ...payload
          },
          null,
          2
        ),
      payload
    );
  }

  _emitStatus(sessionId, phase, state, message, data = {}) {
    this.emit("status", {
      sessionId,
      phase,
      state,
      message,
      data,
      eventType: data.eventType,
      timestamp: new Date().toISOString()
    });
  }

  _emitWorkflowEvent(sessionId, eventType, state, message, data = {}) {
    const payload = JSON.parse(JSON.stringify({ eventType, ...data }));
    this.emit("status", {
      sessionId,
      phase: "workflow",
      kind: "workflow",
      state,
      message,
      data: payload,
      eventType,
      timestamp: new Date().toISOString()
    });
  }

  _throwIfStopped(execution) {
    if (execution.stopped) {
      throw Object.assign(new Error("Execution stopped by user"), { code: "USER_STOPPED" });
    }
  }
}
