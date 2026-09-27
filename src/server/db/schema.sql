-- DOGFOOD 2026 Database Schema (SQLite)
PRAGMA foreign_keys = ON;

-- Core Events
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_time TEXT,
  end_time TEXT,
  submissions_close TEXT NOT NULL, -- ISO 8601 UTC
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- Tracks
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT
);

-- Prizes
CREATE TABLE IF NOT EXISTS prizes (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  amount REAL DEFAULT 0
);

-- Users & Authentication
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY -- 'visitor', 'participant', 'judge', 'organizer', 'admin'
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  expires_at TEXT NOT NULL
);

-- Teams & Invitations
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'leader', 'member'
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  PRIMARY KEY (team_id, user_id)
);

-- Projects & Submissions
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  repo_url TEXT,
  demo_url TEXT,
  status TEXT NOT NULL CHECK(status IN ('DRAFT', 'SUBMITTED')),
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- Rubrics & Criteria (T2 Foundation)
CREATE TABLE IF NOT EXISTS rubrics (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_locked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rubric_criteria (
  id TEXT PRIMARY KEY,
  rubric_id TEXT NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
  criterion_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  weight REAL NOT NULL DEFAULT 1.0,
  min_score REAL NOT NULL DEFAULT 1.0,
  max_score REAL NOT NULL DEFAULT 5.0,
  UNIQUE(rubric_id, criterion_key)
);

-- Judge Assignments & Workloads (T2 Foundation)
CREATE TABLE IF NOT EXISTS judge_tracks (
  judge_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  PRIMARY KEY (judge_user_id, track_id)
);

CREATE TABLE IF NOT EXISTS judge_assignments (
  id TEXT PRIMARY KEY,
  judge_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  batch_id TEXT DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK(status IN ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  UNIQUE(judge_user_id, project_id)
);

-- Scores & Scoring Values (T2 Foundation)
CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  judge_assignment_id TEXT REFERENCES judge_assignments(id) ON DELETE CASCADE,
  judge_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  comment TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('DRAFT', 'SUBMITTED')),
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  UNIQUE(judge_user_id, project_id)
);

CREATE TABLE IF NOT EXISTS score_values (
  id TEXT PRIMARY KEY,
  score_id TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
  criterion_key TEXT NOT NULL,
  value REAL NOT NULL,
  UNIQUE(score_id, criterion_key)
);

-- Audit Logging
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- T3 Community Voting (Public Tier)
CREATE TABLE IF NOT EXISTS voting_windows (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  voter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  UNIQUE(event_id, voter_user_id) -- Anti-abuse: strictly 1 vote per user per event
);

-- T3 Project Community Feedback & Comments
CREATE TABLE IF NOT EXISTS project_comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_flagged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- T4 Verifiable Records & Cryptographic Signatures (Stretch Tier)
CREATE TABLE IF NOT EXISTS verifiable_records (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL, -- 'score', 'submission', 'certificate'
  entity_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  signature TEXT UNIQUE NOT NULL,
  signer_identity TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- T4 Webhooks & Notifications
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'project.submitted', 'judging.completed', 'voting.closed', '*'
  secret TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status_code INTEGER,
  delivered_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- Indexes for high performance and fast querying
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_projects_track ON projects(track_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_judge_assignments_judge ON judge_assignments(judge_user_id);
CREATE INDEX IF NOT EXISTS idx_judge_assignments_project ON judge_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_scores_judge ON scores(judge_user_id);
CREATE INDEX IF NOT EXISTS idx_scores_project ON scores(project_id);
CREATE INDEX IF NOT EXISTS idx_votes_event ON votes(event_id);
CREATE INDEX IF NOT EXISTS idx_votes_project ON votes(project_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter ON votes(voter_user_id);
CREATE INDEX IF NOT EXISTS idx_comments_project ON project_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_verifiable_records_signature ON verifiable_records(signature);
CREATE INDEX IF NOT EXISTS idx_webhooks_event ON webhooks(event_id);

