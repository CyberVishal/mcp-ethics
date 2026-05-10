import { db } from "./db.js";

export function createWorkflowRecord({ workflow, sessionId }) {
  db.run(
    `INSERT OR REPLACE INTO workflows
     (id, session_id, status, prompt, target, classification, plan, results, reports, retry_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      workflow.workflowId,
      sessionId,
      workflow.status,
      workflow.prompt,
      workflow.target,
      JSON.stringify(workflow.classification),
      JSON.stringify(workflow),
      "[]",
      "[]",
      0,
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );
}

export function updateWorkflowRecord(id, patch = {}) {
  getWorkflowRecord(id, record => {
    if (!record) return;

    const next = {
      ...record,
      ...patch,
      classification: patch.classification
        ? JSON.stringify(patch.classification)
        : record.classification,
      plan: patch.plan ? JSON.stringify(patch.plan) : record.plan,
      results: patch.results ? JSON.stringify(patch.results) : record.results,
      reports: patch.reports ? JSON.stringify(patch.reports) : record.reports,
      updated_at: new Date().toISOString()
    };

    db.run(
      `UPDATE workflows
       SET status = ?, prompt = ?, target = ?, classification = ?, plan = ?, results = ?,
           reports = ?, failure = ?, retry_count = ?, updated_at = ?, completed_at = ?
       WHERE id = ?`,
      [
        next.status,
        next.prompt,
        next.target,
        next.classification,
        next.plan,
        next.results,
        next.reports,
        next.failure,
        next.retry_count,
        next.updated_at,
        next.completed_at,
        id
      ]
    );
  });
}

export function getWorkflowRecord(id, cb) {
  db.get("SELECT * FROM workflows WHERE id = ?", [id], (_, row) => cb(row || null));
}

export function listWorkflowRecords(sessionId, cb) {
  db.all(
    `SELECT * FROM workflows WHERE session_id = ? ORDER BY created_at DESC`,
    [sessionId],
    (_, rows) => cb(rows || [])
  );
}
