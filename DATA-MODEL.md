# DATA-MODEL.md

## DOGFOOD 2026 Database Schema & Data Modeling

This document specifies the relational schema, constraints, indexing strategies, import/export pathways, and design rationale for the DOGFOOD 2026 hackathon platform.

---

## 1. Schema Design Rationale

The database is built on a normalized relational architecture rather than generic JSON blobs. Key domain entities—users, roles, sessions, events, tracks, prizes, teams, projects, rubrics, assignments, scores, and audit logs—maintain explicit foreign keys and unique constraints.

This design guarantees:
1. **Referential Integrity:** Foreign keys with `ON DELETE CASCADE` or `RESTRICT` prevent orphaned records.
2. **Preventing Duplicate Assignments:** `UNIQUE(judge_user_id, project_id)` guarantees a judge is assigned at most once per project.
3. **Preventing Duplicate Scoring:** `UNIQUE(judge_user_id, project_id)` guarantees one active score per judge-project pair.
4. **Preserving Real Awkward Cases:** Teams can have multiple projects when legitimate (e.g. `tm_07` submitted `prj_07` and `prj_41`), and reviews per project can naturally vary.

---

## 2. Table Specifications

### Core Tables

#### `events`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Unique event identifier (e.g. `evt_01`) |
| `name` | TEXT | NOT NULL | Event name |
| `description` | TEXT | | Event overview |
| `start_time` | TEXT | | ISO 8601 UTC start timestamp |
| `end_time` | TEXT | | ISO 8601 UTC end timestamp |
| `submissions_close` | TEXT | NOT NULL | ISO 8601 UTC hard submission deadline |
| `created_at` | TEXT | NOT NULL | Creation timestamp |

#### `tracks`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Unique track identifier (e.g. `trk_01`) |
| `event_id` | TEXT | NOT NULL, FK `events(id)` | Parent event |
| `name` | TEXT | NOT NULL | Track title (e.g. 'Developer tools') |
| `description` | TEXT | | Track description |

#### `prizes`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Unique prize identifier |
| `event_id` | TEXT | NOT NULL, FK `events(id)` | Parent event |
| `track_id` | TEXT | FK `tracks(id)` | Associated track (or NULL for general) |
| `name` | TEXT | NOT NULL | Prize title |
| `description` | TEXT | | Prize criteria |
| `amount` | REAL | DEFAULT 0 | Prize cash value |

#### `users` & `user_roles`
| Table | Column | Type | Constraints |
|---|---|---|---|
| `users` | `id` | TEXT | PRIMARY KEY |
| `users` | `email` | TEXT | UNIQUE, NOT NULL |
| `users` | `name` | TEXT | NOT NULL |
| `users` | `password_hash` | TEXT | NOT NULL |
| `user_roles` | `user_id` | TEXT | FK `users(id)` |
| `user_roles` | `role_id` | TEXT | FK `roles(id)` |
*Primary Key for `user_roles`: `(user_id, role_id)`.*

#### `sessions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `token` | TEXT | PRIMARY KEY | Secret session token (e.g. `prt_2e88`) |
| `user_id` | TEXT | NOT NULL, FK `users(id)` | Authenticated user |
| `expires_at` | TEXT | NOT NULL | Expiration timestamp |

#### `teams` & `team_members`
| Table | Column | Type | Constraints |
|---|---|---|---|
| `teams` | `id` | TEXT | PRIMARY KEY |
| `teams` | `event_id` | TEXT | NOT NULL, FK `events(id)` |
| `teams` | `name` | TEXT | NOT NULL |
| `teams` | `invite_code` | TEXT | UNIQUE, NOT NULL |
| `team_members` | `team_id` | TEXT | FK `teams(id)` |
| `team_members` | `user_id` | TEXT | FK `users(id)` |
| `team_members` | `role` | TEXT | 'leader', 'member' |
*Primary Key for `team_members`: `(team_id, user_id)`.*

#### `projects`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Unique project identifier (e.g. `prj_01`) |
| `team_id` | TEXT | NOT NULL, FK `teams(id)` | Submitting team |
| `track_id` | TEXT | NOT NULL, FK `tracks(id)` | Competition track |
| `title` | TEXT | NOT NULL | Project title |
| `summary` | TEXT | | One-line summary |
| `description` | TEXT | | Detailed writeup |
| `repo_url` | TEXT | | Source code URL |
| `demo_url` | TEXT | | Live demo URL |
| `status` | TEXT | NOT NULL | 'DRAFT', 'SUBMITTED' |
| `submitted_at` | TEXT | | Submission timestamp |

---

### Judging & Rubric Tables (T2)

#### `rubrics` & `rubric_criteria`
| Table | Column | Type | Constraints |
|---|---|---|---|
| `rubrics` | `id` | TEXT | PRIMARY KEY |
| `rubrics` | `event_id` | TEXT | NOT NULL, FK `events(id)` |
| `rubrics` | `name` | TEXT | NOT NULL |
| `rubrics` | `is_locked` | INTEGER | DEFAULT 0 (locked once scores exist) |
| `rubric_criteria`| `id` | TEXT | PRIMARY KEY |
| `rubric_criteria`| `rubric_id` | TEXT | NOT NULL, FK `rubrics(id)` |
| `rubric_criteria`| `criterion_key` | TEXT | NOT NULL (e.g. 'functionality') |
| `rubric_criteria`| `name` | TEXT | NOT NULL |
| `rubric_criteria`| `weight` | REAL | NOT NULL DEFAULT 1.0 (> 0) |
| `rubric_criteria`| `min_score` | REAL | NOT NULL DEFAULT 1.0 (>= 0) |
| `rubric_criteria`| `max_score` | REAL | NOT NULL DEFAULT 5.0 (> min_score) |

#### `judge_assignments`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Assignment ID |
| `judge_user_id`| TEXT | NOT NULL, FK `users(id)` | Assigned judge |
| `project_id` | TEXT | NOT NULL, FK `projects(id)` | Target project |
| `batch_id` | TEXT | DEFAULT 'default' | Grouping batch |
| `status` | TEXT | NOT NULL | 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED' |
*Constraint: `UNIQUE(judge_user_id, project_id)`.*

#### `scores` & `score_values`
| Table | Column | Type | Constraints |
|---|---|---|---|
| `scores` | `id` | TEXT | PRIMARY KEY |
| `scores` | `judge_assignment_id` | TEXT | FK `judge_assignments(id)` |
| `scores` | `judge_user_id` | TEXT | NOT NULL, FK `users(id)` |
| `scores` | `project_id` | TEXT | NOT NULL, FK `projects(id)` |
| `scores` | `comment` | TEXT | DEFAULT '' |
| `scores` | `status` | TEXT | 'DRAFT', 'SUBMITTED' |
| `score_values` | `id` | TEXT | PRIMARY KEY |
| `score_values` | `score_id` | TEXT | NOT NULL, FK `scores(id)` |
| `score_values` | `criterion_key` | TEXT | NOT NULL |
| `score_values` | `value` | REAL | NOT NULL |
*Constraint on `scores`: `UNIQUE(judge_user_id, project_id)`.*
*Constraint on `score_values`: `UNIQUE(score_id, criterion_key)`.*

#### `audit_logs`
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PRIMARY KEY | Audit event identifier |
| `actor_user_id`| TEXT | User who initiated action |
| `action` | TEXT | Action name (e.g. `SCORE_CREATED`, `JUDGE_INVITED`) |
| `entity_type` | TEXT | Entity affected (e.g. `scores`, `rubrics`) |
| `entity_id` | TEXT | Identifier of affected record |
| `details_json` | TEXT | Metadata (passwords and auth secrets strictly excluded) |
| `created_at` | TEXT | Timestamp |

---

### Community & Extension Tables (T3 & T4)

#### `voting_windows` (T3)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Unique window identifier (e.g. `vwin_01`) |
| `event_id` | TEXT | NOT NULL, FK `events(id)` | Event receiving community votes |
| `title` | TEXT | NOT NULL | Title of voting period |
| `start_time` | TEXT | NOT NULL | UTC opening timestamp |
| `end_time` | TEXT | NOT NULL | UTC closing timestamp (unblinds results) |
| `is_active` | INTEGER | DEFAULT 1 | Administrative activation flag |

#### `votes` (T3 Anti-Abuse)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Unique vote receipt |
| `event_id` | TEXT | NOT NULL, FK `events(id)` | Event identifier |
| `project_id` | TEXT | NOT NULL, FK `projects(id)` | Voted project |
| `voter_user_id` | TEXT | NOT NULL, FK `users(id)` | Authenticated voter |
| `created_at` | TEXT | NOT NULL | Vote timestamp |
*Constraint: `UNIQUE(event_id, voter_user_id)` strictly enforces 1 vote per user per event.*

#### `project_comments` (T3)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Comment identifier |
| `project_id` | TEXT | NOT NULL, FK `projects(id)` | Target project |
| `user_id` | TEXT | NOT NULL, FK `users(id)` | Comment author |
| `content` | TEXT | NOT NULL | Sanitized constructive feedback |
| `is_flagged` | INTEGER | DEFAULT 0 | Moderation flag hiding comment from public |

#### `verifiable_records` (T4)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Audit verification ID |
| `entity_type` | TEXT | NOT NULL | 'score', 'submission', 'certificate' |
| `entity_id` | TEXT | NOT NULL | Target entity identifier |
| `digest` | TEXT | NOT NULL | SHA256 canonical hash of metadata payload |
| `signature` | TEXT | UNIQUE, NOT NULL | HMAC-SHA256 signature signed by authority |
| `signer_identity` | TEXT | NOT NULL | Authority key identifier |
| `metadata_json` | TEXT | NOT NULL | Immutable JSON payload |

#### `webhooks` & `webhook_deliveries` (T4)
| Table | Column | Type | Constraints |
|---|---|---|---|
| `webhooks` | `id` | TEXT | PRIMARY KEY |
| `webhooks` | `event_id` | TEXT | NOT NULL, FK `events(id)` |
| `webhooks` | `url` | TEXT | NOT NULL |
| `webhooks` | `event_type` | TEXT | NOT NULL |
| `webhooks` | `secret` | TEXT | NOT NULL |
| `webhook_deliveries` | `id` | TEXT | PRIMARY KEY |
| `webhook_deliveries` | `webhook_id` | TEXT | FK `webhooks(id)` |
| `webhook_deliveries` | `status_code` | INTEGER | Delivery response status |


---

## 3. Fixture Ingestion & Mapping

The ingestion script (`src/server/db/seed.js`) transforms `fixtures.json` as follows:
- `event` -> `events` (maintaining `submissions_close = '2026-03-01T18:00:00Z'`).
- `tracks` -> `tracks` with foreign key referencing `event.id`.
- `judges` -> `users` (role `judge`), tracks mapped into `judge_tracks`.
- `teams` -> `teams` and individual member emails mapped to `users` and `team_members`.
- `projects` -> `projects` with initial status `SUBMITTED`. Both `prj_07` and `prj_41` (team `tm_07`) are stored distinctly.
- `scores` -> `judge_assignments` (status `SUBMITTED`), `scores`, and normalized `score_values`.

---

## 4. Export Pathway (CSV Format)

The CSV generator (`src/server/services/csv.js`) outputs RFC 4180 compliant text with stable columns:
```csv
rank,project_id,title,team_name,track_id,track_name,reviews_count,raw_avg_score,normalized_score,final_score,submission_time,repo_url
```
All fields containing commas, quotes, or newlines are wrapped in double quotes, with internal quotes escaped as `""`.
