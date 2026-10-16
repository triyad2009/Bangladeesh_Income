PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 telegram_id TEXT PRIMARY KEY,
 username TEXT,
 first_name TEXT,
 last_name TEXT,
 balance_points INTEGER NOT NULL DEFAULT 0 CHECK(balance_points >= 0),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','blocked')),
 referred_by TEXT,
 referral_count INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 FOREIGN KEY(referred_by) REFERENCES users(telegram_id)
);
CREATE TABLE IF NOT EXISTS tasks (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 reward_points INTEGER NOT NULL CHECK(reward_points > 0),
 task_type TEXT NOT NULL DEFAULT 'custom' CHECK(task_type IN ('visit','custom')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
 created_by TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS claims (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 task_id INTEGER NOT NULL,
 telegram_id TEXT NOT NULL,
 proof TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewed_by TEXT,
 reviewed_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(task_id, telegram_id, status),
 FOREIGN KEY(task_id) REFERENCES tasks(id),
 FOREIGN KEY(telegram_id) REFERENCES users(telegram_id)
);
CREATE TABLE IF NOT EXISTS withdrawals (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 telegram_id TEXT NOT NULL,
 amount_points INTEGER NOT NULL CHECK(amount_points > 0),
 method TEXT NOT NULL CHECK(method IN ('bkash','nagad','rocket')),
 account_last4 TEXT NOT NULL,
 account_encrypted TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','paid')),
 reviewed_by TEXT,
 reviewed_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 FOREIGN KEY(telegram_id) REFERENCES users(telegram_id)
);
CREATE TABLE IF NOT EXISTS ledger (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 telegram_id TEXT NOT NULL,
 delta_points INTEGER NOT NULL,
 reason TEXT NOT NULL,
 reference_type TEXT,
 reference_id INTEGER,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 FOREIGN KEY(telegram_id) REFERENCES users(telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_user ON claims(telegram_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(telegram_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
INSERT INTO tasks(title,description,reward_points,task_type,status)
SELECT 'Welcome to Bangladesh Income','Read the task rules and submit a short note to confirm you understand them.',10,'custom','active'
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title='Welcome to Bangladesh Income');