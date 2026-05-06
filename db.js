import sqlite3 from "sqlite3";

export const db = new sqlite3.Database("mcp.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      history TEXT,
      title TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY,
      scope TEXT,
      notes TEXT,
      permissions TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      target TEXT,
      scan_type TEXT,
      results TEXT,
      timestamp TEXT
    )
  `);
});

