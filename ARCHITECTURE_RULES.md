# MCP Architecture Rules

## Core Rules
- Planner ONLY generates plans
- Executor ONLY executes approved plans
- No autonomous architecture rewrites
- No uncontrolled project-wide refactors
- Maintain atomic edit safety
- Preserve session isolation
- Do not break phase-based development

## Current Phase
Phase I — Safe Atomic Edit Engine

## AI Assistant Restrictions
- No automatic dependency upgrades
- No random file restructuring
- No deleting core pipeline files
- No modifying planner/executor contracts without approval

## Workflow
1. Discuss architecture with ChatGPT
2. Approve changes manually
3. Use Codex only for controlled edits
4. Commit stable checkpoints frequently