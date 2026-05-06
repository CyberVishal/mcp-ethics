import EventEmitter from "events";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";

export default class MCPAgent extends EventEmitter {
  constructor() {
    super();
  }

  async executePlan({ sessionId, plan }) {
    try {
      this.emit("status", {
        sessionId,
        message: "🚀 Execution started"
      });

      /* ================= VALIDATION ================= */

      if (!plan || typeof plan !== "object") {
        this._emitDebug(sessionId, {
          phase: "validation",
          reason: "INVALID_PLAN_OBJECT",
          received: plan
        });
        throw new Error("Invalid plan object");
      }

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

      /* ================= OUTPUT DIR ================= */

      const outputDir = path.join(os.homedir(), "Desktop", "MCP_Output");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      /* ================= INSTALL PHASE ================= */

      if (Array.isArray(plan.install) && plan.install.length > 0) {
        for (let i = 0; i < plan.install.length; i++) {
          const installCmd = plan.install[i];

          this.emit("status", {
            sessionId,
            message: `📦 Installing (${i + 1}/${plan.install.length}): ${installCmd}`
          });

          await this.runCommand({
            command: installCmd,
            sessionId,
            phase: "install"
          });
        }
      }

      /* ================= EXECUTION PHASE ================= */

      for (let i = 0; i < commands.length; i++) {
        let command = commands[i];

        if (plan.output_file) {
          const outputPath = path.join(outputDir, plan.output_file);
          command =
            i === 0
              ? `${command} > "${outputPath}"`
              : `${command} >> "${outputPath}"`;
        }

        this.emit("status", {
          sessionId,
          message: `🖥️ Command ${i + 1}/${commands.length}: ${command}`
        });

        await this.runCommand({
          command,
          sessionId,
          phase: "execute"
        });
      }

      this.emit("status", {
        sessionId,
        message: "✅ Execution completed successfully"
      });

    } catch (err) {
      this.emit("status", {
        sessionId,
        message: `❌ Execution stopped: ${err.message}`
      });
    }
  }

  /* ================= CORE EXECUTOR ================= */

  runCommand({ command, sessionId, phase }) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, { shell: true });

      let stderrBuffer = "";
      let stdoutBuffer = "";

      child.stdout.on("data", data => {
        const msg = data.toString();
        stdoutBuffer += msg;

        this.emit("status", {
          sessionId,
          message: msg
        });
      });

      child.stderr.on("data", data => {
        const msg = data.toString();
        stderrBuffer += msg;

        this.emit("status", {
          sessionId,
          message: `⚠️ ${msg}`
        });
      });

      child.on("error", err => {
        this._emitDebug(sessionId, {
          phase,
          reason: "SPAWN_ERROR",
          command,
          error: err.message
        });

        reject(err);
      });

      child.on("close", code => {
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
            new Error(`Command failed with exit code ${code}`)
          );
        }

        resolve();
      });
    });
  }

  /* ================= DEBUG EMITTER ================= */

  _emitDebug(sessionId, payload) {
    this.emit("status", {
      sessionId,
      message:
        "🧠 EXECUTION DEBUG PAYLOAD:\n" +
        JSON.stringify(
          {
            error: true,
            timestamp: new Date().toISOString(),
            ...payload
          },
          null,
          2
        )
    });
  }
}

