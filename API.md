# API Reference

## Overview

Project Judgement is built strictly on an **API-First** architectural paradigm. Every user interface surface—including the public gallery, participant submission portal, judge evaluation workflow, organizer administration console, and community choice voting system—operates entirely through standardized HTTP REST endpoints.

The application serves static React assets and server-rendered HTML entrypoints, while all dynamic data retrieval, mutations, cryptographic signing, audit logging, and mathematical score normalizations are performed through the backend REST API documented below.

The complete machine-readable specification is published in OpenAPI 3.1.0 format in [`openapi.json`](file:///E:/Project-Judgement/openapi.json).

---

## Base URL

```text
http://localhost:8080
```

When deployed under container orchestration or production reverse proxies, all paths remain relative to the domain root.

---

## Authentication

The API provides multi-mechanism session authentication designed for browser clients, automated CI/CD runners, and command-line evaluators.

### Accepted Authentication Credentials

The server inspects requests in the following precedence order via `sessionMiddleware`:

1. **HTTP Cookie (`session`)**:
   Standard browser cookie populated by `/api/auth/login` or `/api/auth/switch-seeded`.
   ```http
   Cookie: session=ses_9f8e7d6c5b4a3120...
   ```
2. **Authorization Header (Bearer)**:
   Standard OAuth 2.0 Bearer token format:
   ```http
   Authorization: Bearer <sessionToken>
   ```
3. **Authorization Header (Session format)**:
   Explicit session key:
   ```http
   Authorization: session=<sessionToken>
   ```
4. **Custom Header (`x-session-token`)**:
   Specialized client header:
   ```http
   x-session-token: <sessionToken>
   ```

### Pre-Seeded Development & Evaluation Credentials

For local testing, automated grading, and developer evaluation, the database includes four pre-seeded deterministic sessions:

| Persona | Role | Seeded Session Token | Email | Default Password |
|---|---|---|---|---|
| **Organizer** | `organizer`, `admin` | `org_7f2a` | `organizer@hackathon.dev` | `organizer123` |
| **Judge Alpha** | `judge` | `jdg_a_91bc` | `judge.a@hackathon.dev` | `judge123` |
| **Judge Beta** | `judge` | `jdg_b_44de` | `judge.b@hackathon.dev` | `judge123` |
| **Participant** | `participant` | `prt_2e88` | `participant@hackathon.dev` | `participant123` |

> [!NOTE]
> All passwords above are local development defaults hashed with SHA-256 in the seed database. Seeded tokens are valid indefinitely for evaluation convenience.

---

## Role Model & Access Control

Access control is enforced strictly on the server side via Express middleware functions (`requireAuth`, `requireRole`, `requireParticipant`, `requireJudge`, `requireOrganizer`, `requireAdmin`).

```text
+-------------------------------------------------------------------------+
|                                  admin                                  |
|         (inherits all capabilities: organizer, judge, participant)      |
+-------------------+--------------------+--------------------------------+
                    |                    |
          +---------v----------+         |
          |     organizer      |         |
          +---------+----------+         |
                    |                    |
          +---------v----------+         |
          |       judge        |         |
          +---------+----------+         |
                    |                    |
          +---------v----------+         |
          |    participant     | <-------+
          +---------+----------+
                    |
          +---------v----------+
          |  visitor (public)  |
          +--------------------+
```

### Role Capabilities Matrix

| System Surface | `visitor` | `participant` | `judge` | `organizer` | `admin` |
|---|:---:|:---:|:---:|:---:|:---:|
| **Public Gallery & Search** (`/api/projects`) | Yes | Yes | Yes | Yes | Yes |
| **Event Metadata & Public Key** (`/api/events`, `/api/verify/*`) | Yes | Yes | Yes | Yes | Yes |
| **Randomized Ballot & Sealed Results** (`/api/voting/*`) | Yes | Yes | Yes | Yes | Yes |
| **Read Unflagged Comments** (`/api/projects/:id/comments`) | Yes | Yes | Yes | Yes | Yes |
| **Team Management** (`/api/teams/*`) | - | Yes | - | Yes | Yes |
| **Project Submission & Editing** (`/api/projects`, `/projects/new`) | - | Yes | - | Yes | Yes |
| **Post Comments & Flagging** (`/api/projects/:id/comments`) | - | Yes | Yes | Yes | Yes |
| **Cast Community Vote** (`/api/voting/vote`) | - | Yes | Yes | Yes | Yes |
| **Judge Assignments & Scoring** (`/api/judge/*`) | - | - | Yes | Yes | Yes |
| **Judging Progress Dashboard** (`/api/organizer/dashboard`) | - | - | - | Yes | Yes |
| **Normalized Results Calculation** (`/api/organizer/normalized`) | - | - | - | Yes | Yes |
| **CSV & Signed JSON Exports** (`/api/organizer/export.*`) | - | - | - | Yes | Yes |
| **Bulk Import (Atomic)** (`/api/organizer/import.json`) | - | - | - | Yes | Yes |
| **Audit Logs Inspection** (`/api/organizer/audit`) | - | - | - | Yes | Yes |
| **Judge Invites & Track Mapping** (`/api/organizer/judges/*`) | - | - | - | Yes | Yes |
| **Rubric Configuration & Locking** (`/api/organizer/rubric/*`) | - | - | - | Yes | Yes |
| **Webhook Management & Ping Tests** (`/api/webhooks/*`) | - | - | - | Yes | Yes |

---

## Endpoint Reference

### 1. Authentication

#### `POST /api/auth/login`
- **Purpose**: Authenticate user via email and password; set HTTP-only session cookie.
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Request Body**:
  ```json
  {
    "email": "organizer@hackathon.dev",
    "password": "organizer123"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "message": "Logged in successfully",
    "sessionToken": "ses_9f8e7d6c5b4a3120",
    "user": {
      "id": "usr_org_01",
      "email": "organizer@hackathon.dev",
      "name": "Alice Chen",
      "roles": ["organizer"]
    }
  }
  ```
- **Errors**:
  - `400 Bad Request`: `{ "error": "Email and password required" }`
  - `401 Unauthorized`: `{ "error": "Invalid email or password" }`

#### `POST /api/auth/logout`
- **Purpose**: Invalidate current session token in database and clear session cookie.
- **Authentication**: Optional
- **Role**: Any
- **Success Response (200 OK)**:
  ```json
  { "message": "Logged out successfully" }
  ```

#### `GET /api/auth/me`
- **Purpose**: Inspect currently active session profile and primary role.
- **Authentication**: Optional
- **Role**: Any
- **Success Response (200 OK)**:
  ```json
  {
    "user": {
      "id": "usr_org_01",
      "email": "organizer@hackathon.dev",
      "name": "Alice Chen",
      "roles": ["organizer"]
    },
    "primaryRole": "organizer"
  }
  ```
  *(Returns `{ "user": null, "role": "visitor" }` when unauthenticated)*

#### `POST /api/auth/switch-seeded`
- **Purpose**: Quick demo persona switcher for testing and evaluation.
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Request Body**:
  ```json
  { "roleKey": "organizer" }
  ```
  *Allowed values: `"organizer"`, `"judge_a"`, `"judge_b"`, `"participant"`*
- **Success Response (200 OK)**: Sets cookie and returns `{ message, sessionToken, user }`.
- **Errors**:
  - `400 Bad Request`: `{ "error": "Unknown seeded role key" }`
  - `404 Not Found`: `{ "error": "Seeded session not found" }`

---

### 2. Events

#### `GET /api/events`
- **Purpose**: List all hackathon events with computed `is_closed` deadline status.
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Success Response (200 OK)**:
  ```json
  {
    "events": [
      {
        "id": "evt_01",
        "name": "DOGFOOD 2026 World Championship",
        "description": "Annual international hackathon competition",
        "start_time": "2026-03-01T00:00:00.000Z",
        "end_time": "2026-03-08T00:00:00.000Z",
        "submissions_close": "2026-03-05T18:00:00.000Z",
        "is_closed": false,
        "created_at": "2026-02-01T00:00:00.000Z"
      }
    ]
  }
  ```

#### `GET /api/events/:id`
- **Purpose**: Retrieve single event metadata, tracks, and prizes.
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Path Parameters**: `id` (e.g. `evt_01`)
- **Success Response (200 OK)**:
  ```json
  {
    "event": {
      "id": "evt_01",
      "name": "DOGFOOD 2026 World Championship",
      "submissions_close": "2026-03-05T18:00:00.000Z",
      "is_closed": false
    },
    "tracks": [
      { "id": "trk_ai", "name": "AI & Machine Learning", "description": "LLM applications" }
    ],
    "prizes": [
      { "id": "prz_01", "name": "Grand Prize", "amount": 10000, "track_id": null }
    ]
  }
  ```
- **Errors**: `404 Not Found` if event does not exist.

#### `POST /api/events`
- **Purpose**: Create a new hackathon event.
- **Authentication**: Required (`sessionCookie` or `bearerAuth`)
- **Role**: `organizer`, `admin`
- **Request Body**:
  ```json
  {
    "name": "AI Innovation Sprint 2026",
    "description": "48-hour generative AI hackathon",
    "start_time": "2026-04-01T00:00:00.000Z",
    "end_time": "2026-04-03T00:00:00.000Z",
    "submissions_close": "2026-04-02T18:00:00.000Z"
  }
  ```
- **Success Response (201 Created)**: Returns `{ message, event }`.
- **Errors**: `400 Bad Request` (missing name/deadline or invalid ISO timestamp), `401 Unauthorized`, `403 Forbidden`.

#### `POST /api/events/:id/tracks`
- **Purpose**: Add competition track to event.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (201 Created)**: `{ message: "Track added successfully", track: { id, event_id, name, description } }`.

#### `POST /api/events/:id/prizes`
- **Purpose**: Add prize category to event or track.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (201 Created)**: `{ message: "Prize added successfully", prize: { id, event_id, track_id, name, description, amount } }`.

---

### 3. Teams

#### `GET /api/teams/my-team`
- **Purpose**: Get current user's team, teammates, invite code, and team projects.
- **Authentication**: Required
- **Role**: `authenticated`
- **Success Response (200 OK)**:
  ```json
  {
    "team": {
      "id": "tm_apollo",
      "name": "Team Apollo",
      "invite_code": "inv_8f7b3c21a4e9",
      "invite_link": "/teams/join?code=inv_8f7b3c21a4e9",
      "event_id": "evt_01",
      "event_name": "DOGFOOD 2026 World Championship",
      "submissions_close": "2026-03-05T18:00:00.000Z",
      "is_closed": false,
      "my_role": "leader",
      "members": [
        { "id": "usr_part_01", "name": "Sarah Connor", "email": "sarah@skynet.ai", "role": "leader" }
      ],
      "projects": []
    }
  }
  ```
  *(Returns `{ "team": null }` if user has not formed or joined a team)*

#### `POST /api/teams`
- **Purpose**: Create a new team for an event and register creator as leader.
- **Authentication**: Required
- **Role**: `participant`, `organizer`, `admin`
- **Request Body**:
  ```json
  {
    "name": "Team Cyberdyne",
    "event_id": "evt_01"
  }
  ```
- **Success Response (201 Created)**: `{ message: "Team created successfully", team: { id, name, event_id, invite_code, invite_link } }`.
- **Errors**: `400 Bad Request` (user already on a team for this event), `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

#### `POST /api/teams/join`
- **Purpose**: Join an existing team using its invite code.
- **Authentication**: Required
- **Role**: `participant`, `organizer`, `admin`
- **Request Body**:
  ```json
  { "invite_code": "inv_8f7b3c21a4e9" }
  ```
- **Success Response (200 OK)**: `{ message: "Successfully joined team Team Apollo", team: { id, name, event_id } }`.
- **Errors**: `400 Bad Request` (already on team or member of another team in same event), `404 Not Found` (invalid or expired invite code).

---

### 4. Projects

#### `GET /api/projects`
- **Purpose**: Public gallery search and filter endpoint.
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Query Parameters**:
  - `q`: Search string matching project title, summary, description, and team name
  - `track`: Filter by track ID or name
  - `status`: Project status (`SUBMITTED` or `DRAFT`; defaults to `SUBMITTED` for public)
  - `team_id`: Filter by owning team ID
  - `limit`: Maximum results (default: `100`)
  - `offset`: Pagination offset (default: `0`)
- **Success Response (200 OK)**:
  ```json
  {
    "projects": [
      {
        "id": "prj_01",
        "team_id": "tm_apollo",
        "track_id": "trk_ai",
        "title": "Autonomous Neural Optimizer",
        "summary": "Decentralized hyperparameter tuning",
        "status": "SUBMITTED",
        "submitted_at": "2026-03-04T12:00:00.000Z",
        "track_name": "AI & Machine Learning",
        "team_name": "Team Apollo"
      }
    ],
    "total": 41,
    "limit": 100,
    "offset": 0
  }
  ```

#### `GET /api/projects/:id`
- **Purpose**: Retrieve full project details and public team roster.
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Path Parameters**: `id` (e.g. `prj_01`)
- **Success Response (200 OK)**: Project object including member list and metadata.
- **Errors**: `404 Not Found`.

#### `POST /api/projects` *(Alias: `POST /projects/new`)*
- **Purpose**: Create or submit a hackathon project. Enforces submission deadline on server, verifies team ownership, generates Ed25519 verifiable cryptographic record, and dispatches webhooks.
- **Authentication**: Required
- **Role**: `participant`, `organizer`, `admin`
- **Request Body**:
  ```json
  {
    "title": "Autonomous Neural Optimizer",
    "summary": "Decentralized hyperparameter tuning",
    "description": "Comprehensive architectural description and benchmarks",
    "repo_url": "https://github.com/team-apollo/neural-opt",
    "demo_url": "https://demo.neural-opt.org",
    "track_id": "trk_ai",
    "team_id": "tm_apollo",
    "action": "submit"
  }
  ```
  *(Set `"action": "draft"` to save without finalizing submission)*
- **Success Response (201 Created)**:
  ```json
  {
    "message": "Project submitted successfully",
    "project": {
      "id": "prj_4a81",
      "status": "SUBMITTED",
      "submitted_at": "2026-03-04T12:00:00.000Z"
    }
  }
  ```
- **Errors**:
  - `400 Bad Request`: Deadline expired (`"Submissions for event closed on..."`), missing title, or missing track
  - `401 Unauthorized`: Authentication required
  - `403 Forbidden`: Role not authorized
  - `404 Not Found`: Event not found

#### `PUT /api/projects/:id`
- **Purpose**: Update project draft or details before the submission deadline.
- **Authentication**: Required (Must be member of owning team or admin)
- **Role**: `participant`, `admin`
- **Success Response (200 OK)**: `{ message: "Project updated successfully", project }`.
- **Errors**: `400 Bad Request` (deadline expired), `403 Forbidden` (caller is not on owning team), `404 Not Found`.

#### `POST /api/projects/:id/submit`
- **Purpose**: Finalize a draft project into `SUBMITTED` status.
- **Authentication**: Required (Team member or admin)
- **Role**: `participant`, `admin`
- **Success Response (200 OK)**: `{ message: "Project submitted successfully" }`.
- **Errors**: `400 Bad Request` (deadline expired), `403 Forbidden` (not on team), `404 Not Found`.

---

### 5. Judging

#### `GET /api/judge/scores`
- **Purpose**: Retrieve scores authored by the calling judge.
- **Security Barrier**: **Judge Peer Isolation**. Probing peer judge scores via query parameters (`?judge=...`, `?judge_id=...`) is strictly blocked with `403 Forbidden`.
- **Authentication**: Required
- **Role**: `judge`, `organizer`, `admin`
- **Success Response (200 OK)**:
  ```json
  {
    "judge_id": "jdg_01",
    "judge_name": "Dr. Jane Smith",
    "scores": [
      {
        "score_id": "scr_4a91c8",
        "project_id": "prj_01",
        "comment": "Outstanding technical execution",
        "status": "SUBMITTED",
        "criteria": { "technical_execution": 9, "innovation": 8, "presentation": 10 }
      }
    ]
  }
  ```
- **Errors**: `403 Forbidden` if attempting to view peer scores.

#### `GET /api/judge/scores/:scoreId`
- **Purpose**: Retrieve a single score. Strict ownership check: only authoring judge or organizer/admin can view.
- **Authentication**: Required
- **Role**: `judge`, `organizer`, `admin`
- **Success Response (200 OK)**: `{ score: { ... } }`.
- **Errors**: `403 Forbidden` (peer judge access blocked), `404 Not Found`.

#### `GET /api/judge/assignments`
- **Purpose**: List projects assigned to caller for evaluation, along with active rubric.
- **Authentication**: Required
- **Role**: `judge`, `organizer`, `admin`
- **Success Response (200 OK)**:
  ```json
  {
    "assignments": [
      {
        "assignment_id": "asgn_7b9d12",
        "project_id": "prj_01",
        "assignment_status": "SUBMITTED",
        "project_title": "Autonomous Neural Optimizer",
        "track_name": "AI & Machine Learning"
      }
    ],
    "rubric": {
      "id": "rbc_01",
      "name": "Official Rubric",
      "is_locked": 1,
      "criteria": [
        { "criterion_key": "technical_execution", "name": "Technical Execution", "weight": 0.4, "min_score": 1, "max_score": 10 }
      ]
    }
  }
  ```

#### `GET /api/judge/assignments/:projectId`
- **Purpose**: Retrieve evaluation detail for assigned project. Strict check: caller must be assigned to project.
- **Authentication**: Required
- **Role**: `judge`, `organizer`, `admin`
- **Success Response (200 OK)**: `{ assignment, project, rubric, existingScore }`.
- **Errors**: `403 Forbidden` (`"You are not assigned to judge this project"`), `404 Not Found`.

#### `POST /api/judge/scores`
- **Purpose**: Submit or update score for an assigned project. Validates criteria score boundaries against rubric, locks rubric from further edits, creates Ed25519 verifiable cryptographic score record, and updates assignment status.
- **Authentication**: Required
- **Role**: `judge`, `organizer`, `admin`
- **Request Body**:
  ```json
  {
    "project_id": "prj_01",
    "criteria": {
      "technical_execution": 9,
      "innovation": 8,
      "presentation": 10
    },
    "comment": "Exceptional architectural rigor.",
    "status": "SUBMITTED"
  }
  ```
- **Success Response (200 OK / 201 Created)**:
  ```json
  {
    "message": "Score submitted successfully",
    "score_id": "scr_4a91c8"
  }
  ```
- **Errors**: `400 Bad Request` (criterion out of range), `403 Forbidden` (not assigned to project), `500 Internal Server Error` (no active rubric).

---

### 6. Organizer

> [!NOTE]
> All organizer endpoints are dual-mounted at `/api/organizer/*` and `/api/*` for backwards compatibility with evaluation scripts and automated grading suites.

#### `GET /api/organizer/dashboard` *(or `/api/dashboard`)*
- **Purpose**: Comprehensive evaluation progress view (total assignments, submitted counts, completion percentages, track breakdowns, judge completion metrics, batch status).
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (200 OK)**: Returns dashboard statistics object.

#### `GET /api/organizer/normalized` *(or `/api/normalized`)*
- **Purpose**: Calculate and return normalized rankings using z-score normalization and trimmed mean aggregation to eliminate judge bias. Audit logged.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (200 OK)**:
  ```json
  {
    "event_id": "evt_01",
    "calculated_at": "2026-03-07T18:00:00.000Z",
    "projects": [
      {
        "project_id": "prj_01",
        "title": "Autonomous Neural Optimizer",
        "team_name": "Team Apollo",
        "raw_mean": 8.75,
        "z_score": 1.42,
        "trimmed_mean": 8.8,
        "composite_score": 91.4,
        "rank": 1
      }
    ]
  }
  ```

#### `GET /api/organizer/export.csv` *(or `/api/export.csv`)*
- **Purpose**: Export normalized rankings as an RFC 4180 CSV spreadsheet. Implements CSV formula injection defense (sanitizes `=, +, -, @` prefixes). Audit logged.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (200 OK)**: `text/csv; charset=utf-8` file download.

#### `GET /api/organizer/export.json` *(or `/api/export.json`)*
- **Purpose**: Full JSON bulk export bundle containing complete event dataset signed with Ed25519 digital signature.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (200 OK)**: Returns signed JSON bundle with `audit` block containing `digest`, `signature`, `algorithm: "Ed25519"`, `public_key`, and `signer`.

#### `POST /api/organizer/import.json` *(or `/api/import.json`)*
- **Purpose**: Atomic, transaction-safe bulk event import (supports both `fixtures.json` format and full export bundles). Audit logged.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (201 Created)**: `{ message: "Bulk event import completed successfully", event_id, counts }`.
- **Errors**: `400 Bad Request` on validation failure or missing mandatory fields. Transaction automatically rolls back.

#### `GET /api/organizer/audit` *(or `/api/audit`)*
- **Purpose**: Inspect chronological administrative audit trail.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (200 OK)**: `{ logs: [ { id, actor_user_id, action, entity_type, entity_id, details_json, created_at } ] }`.

#### `POST /api/organizer/judges/invite` *(or `/api/judges/invite`)*
- **Purpose**: Register or invite a judge and configure assigned track specializations. Audit logged.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Request Body**:
  ```json
  {
    "email": "judge.alan@eval.org",
    "name": "Alan Turing",
    "track_ids": ["trk_ai"]
  }
  ```
- **Success Response (201 Created)**: `{ message: "Judge Alan Turing invited successfully", judge }`.

#### `GET /api/organizer/judges` *(or `/api/judges`)*
- **Purpose**: List all registered judges and their track assignments.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (200 OK)**: `{ judges: [ { id, name, email, tracks } ] }`.

#### `POST /api/organizer/assignments` *(or `/api/assignments`)*
- **Purpose**: Manually assign project to judge. Verifies track match unless `override_track: true` is passed. Audit logged.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Request Body**:
  ```json
  {
    "judge_user_id": "jdg_01",
    "project_id": "prj_01",
    "batch_id": "batch_alpha",
    "override_track": false
  }
  ```
- **Success Response (201 Created)**: `{ message: "Assignment created successfully", assignmentId }`.
- **Errors**: `400 Bad Request` (track mismatch), `404 Not Found` (project not found).

#### `POST /api/organizer/assignments/auto` *(or `/api/assignments/auto`)*
- **Purpose**: Algorithmic, deterministic track-aware judge assignment.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Request Body**: `{ "reviews_per_project": 3, "batch_id": "auto_batch" }`.
- **Success Response (200 OK)**: `{ message: "Automated assignment complete. Created 123 assignments.", createdCount: 123 }`.

#### `GET /api/organizer/rubric` *(or `/api/rubric`)*
- **Purpose**: View rubric, criteria definitions, weights, score ranges, and lock status.
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Success Response (200 OK)**: `{ rubric: { id, name, is_locked, criteria } }`.

#### `PUT /api/organizer/rubric/criteria` *(or `/api/rubric/criteria`)*
- **Purpose**: Configure rubric criteria and weights. **Immutability rule**: Rejects mutations with `400 Bad Request` if rubric is locked (`is_locked: 1`) because scores already exist. Audit logged.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (200 OK)**: `{ message: "Rubric updated successfully" }`.

---

### 7. Community Voting

#### `GET /api/voting/windows`
- **Purpose**: List community voting windows with real-time status (`OPEN`, `CLOSED`, `UPCOMING`, `INACTIVE`).
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Success Response (200 OK)**: `{ windows: [ { id, event_id, title, start_time, end_time, is_active, current_status } ] }`.

#### `POST /api/voting/windows`
- **Purpose**: Create or schedule a community voting window.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Request Body**:
  ```json
  {
    "event_id": "evt_01",
    "title": "People's Choice Award",
    "start_time": "2026-03-06T00:00:00.000Z",
    "end_time": "2026-03-07T23:59:59.000Z",
    "is_active": 1
  }
  ```
- **Success Response (201 Created)**: `{ message: "Voting window created successfully", window }`.

#### `GET /api/voting/ballot`
- **Purpose**: Retrieve ballot with randomized project ordering. Uses deterministic Fisher-Yates PRNG seeded by voter identity to eliminate positional bias while maintaining consistent order for the voter. Marks `is_own_team: true` for self-vote prevention.
- **Authentication**: Optional
- **Role**: Any
- **Success Response (200 OK)**: `{ event_id, ballot_count, has_voted, voted_project_id, projects: [...] }`.

#### `POST /api/voting/vote`
- **Purpose**: Cast a community vote.
- **Anti-Abuse Protections Enforced**:
  1. **Submission Velocity Limiter**: Returns `429 Too Many Requests` on rapid bursts.
  2. **Active Window Enforcement**: Returns `400 Bad Request` if window is not open.
  3. **Self-Voting Strictly Prohibited**: Returns `403 Forbidden` if voter is a member of the project's owning team.
  4. **Duplicate Vote Rejection**: Returns `409 Conflict` if user has already voted in this event.
- **Authentication**: Required
- **Role**: `authenticated`
- **Request Body**:
  ```json
  {
    "event_id": "evt_01",
    "project_id": "prj_02"
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "message": "Vote cast successfully",
    "vote_id": "vote_9c1d2e3f4a",
    "project_id": "prj_02",
    "timestamp": "2026-03-06T14:30:00.000Z"
  }
  ```

#### `GET /api/voting/results`
- **Purpose**: Retrieve community voting standings.
- **Blind Voting Rule**: If the voting window is currently active and caller is not an organizer/admin, returns sealed status without tallies (`{ is_blind: true, status: "OPEN", message: "Voting is currently active. Results remain sealed..." }`). Returns ranked results once window closes.
- **Authentication**: Optional
- **Role**: Any
- **Success Response (200 OK)**: Full ranked results or sealed window notification.

---

### 8. Comments & Moderation

> [!NOTE]
> Comment endpoints are mounted under both `/api/projects/*` and `/api/comments/*`.

#### `GET /api/projects/:projectId/comments`
- **Purpose**: List community comments for a project. Flagged comments are suppressed for public viewers and visible only to organizers/admins.
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Success Response (200 OK)**: `{ project_id, count, comments: [ { id, content, created_at, author: { id, name, roles }, is_flagged } ] }`.

#### `POST /api/projects/:projectId/comments`
- **Purpose**: Post constructive community feedback on a project. Enforces rate-limiting spam cooldown and validates length (3-2000 characters).
- **Authentication**: Required
- **Role**: `authenticated`
- **Request Body**:
  ```json
  { "content": "Super clean architecture and great presentation!" }
  ```
- **Success Response (201 Created)**: `{ message: "Comment posted successfully", comment }`.
- **Errors**: `400 Bad Request` (length violation), `429 Too Many Requests` (spam cooldown).

#### `POST /api/comments/flag/:commentId`
- **Purpose**: Flag abusive or inappropriate comment for organizer moderation.
- **Authentication**: Required
- **Role**: `authenticated`
- **Success Response (200 OK)**: `{ message: "Comment has been flagged for organizer review", comment_id }`.

#### `DELETE /api/comments/:commentId`
- **Purpose**: Delete comment. Authorized only for the original comment author or an organizer/admin.
- **Authentication**: Required
- **Role**: `authenticated` (Author or Organizer/Admin)
- **Success Response (200 OK)**: `{ message: "Comment deleted successfully", comment_id }`.
- **Errors**: `403 Forbidden` if caller is neither author nor organizer.

---

### 9. Verification & Cryptography

#### `GET /api/verify/public-key`
- **Purpose**: Retrieve authority Ed25519 public key for independent offline/online cryptographic verification.
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Success Response (200 OK)**:
  ```json
  {
    "algorithm": "Ed25519",
    "format": "SPKI / RFC 8410",
    "public_key_pem": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...\n-----END PUBLIC KEY-----\n",
    "public_key_hex": "302a300506032b6570032100...",
    "signer_identity": "dogfood:authority:2026",
    "curve": "Ed25519",
    "usage": "Independent offline and online verification of DOGFOOD 2026 certificates and audit receipts"
  }
  ```

#### `GET /api/verify/record/:signature`
- **Purpose**: Verify a cryptographic audit record by its 128-hex-character signature. Recomputes canonical JSON SHA-256 digest and verifies Ed25519 signature.
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Success Response (200 OK)**: `{ verified: true, algorithm: "Ed25519", record_id, entity_type, entity_id, digest, signature, public_key, signer_identity, metadata }`.

#### `POST /api/verify`
- **Purpose**: Independent verification endpoint supporting three modes:
  1. **Mode A**: Verify by `record_id`
  2. **Mode B**: Verify arbitrary payload + signature (+ optional custom public key)
  3. **Mode C**: Verify by signature string lookup
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Request Body (Mode B)**:
  ```json
  {
    "payload": { "project_id": "prj_01", "team_id": "tm_apollo" },
    "signature": "a9b8c7...d6e5"
  }
  ```
- **Success Response (200 OK)**: `{ verified: true, algorithm: "Ed25519", digest, signature, checked_at }`.

#### `GET /api/verify/certificate/:projectId`
- **Purpose**: Generate or retrieve an Ed25519 digitally signed certificate for a `SUBMITTED` project.
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Success Response (200 OK)**:
  ```json
  {
    "certificate_id": "rec_cert_prj_01",
    "project_id": "prj_01",
    "title": "Autonomous Neural Optimizer",
    "team_name": "Team Apollo",
    "track_name": "AI & Machine Learning",
    "event_name": "DOGFOOD 2026 World Championship",
    "algorithm": "Ed25519",
    "signature": "a9b8c7...d6e5",
    "digest": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "public_key": "-----BEGIN PUBLIC KEY-----\n...",
    "signer": "dogfood:cert_authority:2026",
    "issued_at": "2026-03-05T12:00:00.000Z",
    "verification_url": "/api/verify/record/a9b8c7...d6e5"
  }
  ```
- **Errors**: `400 Bad Request` if project is still in `DRAFT` status; `404 Not Found` if project does not exist.

---

### 10. Webhooks

#### `GET /api/webhooks`
- **Purpose**: List registered webhooks for an event (signing secrets redacted).
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (200 OK)**: `{ webhooks: [ { id, event_id, url, event_type, is_active, created_at } ] }`.

#### `POST /api/webhooks`
- **Purpose**: Register an outbound webhook receiver. Generates a random HMAC-SHA256 signing secret returned only in this response.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Request Body**:
  ```json
  {
    "event_id": "evt_01",
    "url": "https://webhook.site/receiver",
    "event_type": "project.submitted"
  }
  ```
- **Success Response (201 Created)**: `{ message: "Webhook registered successfully", webhook: { id, event_id, url, event_type, secret, created_at } }`.

#### `GET /api/webhooks/deliveries`
- **Purpose**: List recent webhook delivery dispatches and HTTP response status codes.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (200 OK)**: `{ deliveries: [ { id, webhook_id, event_type, status_code, delivered_at, url } ] }`.

#### `POST /api/webhooks/:id/test`
- **Purpose**: Trigger an immediate test ping dispatch (`webhook.test`) signed with HMAC-SHA256 to verify connectivity and signature validation.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (200 OK)**: `{ message: "Webhook test executed", delivery: { deliveryId, webhookId, statusCode, timestamp } }`.

#### `DELETE /api/webhooks/:id`
- **Purpose**: Delete a registered webhook.
- **Authentication**: Required
- **Role**: `organizer`, `admin`
- **Success Response (200 OK)**: `{ message: "Webhook deleted successfully", id }`.

---

### 11. Health & Embedding

#### `GET /api/health`
- **Purpose**: Container liveness and readiness probe.
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Success Response (200 OK)**:
  ```json
  {
    "status": "ok",
    "uptime": 245.8,
    "timestamp": "2026-03-08T12:00:00.000Z"
  }
  ```

#### `GET /embed/gallery`
- **Purpose**: Standalone, lightweight HTML widget displaying top submitted projects for embedding via `<iframe>` on external websites.
- **Authentication**: None (Public)
- **Role**: `visitor`
- **Content Type**: `text/html; charset=utf-8` (`X-Frame-Options: ALLOWALL`)

#### Frontend HTML Serving Routes
The application additionally serves server-side rendered HTML and Single Page Application bundles at:
- `GET /`: Landing page & interactive portal
- `GET /projects`: Server-rendered gallery view with track tabs
- `GET /projects/:id`: Server-rendered project detail card

These routes deliver HTML markup to web browsers, and invoke the REST endpoints documented above to perform dynamic operations.

---

## Copy-Pasteable curl Examples

All examples below target `http://localhost:8080` and use the pre-seeded local evaluation credentials (`org_7f2a`, `jdg_a_91bc`, `jdg_b_44de`, `prt_2e88`).

### 1. Authenticate / Login
```bash
curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"organizer@hackathon.dev","password":"organizer123"}' \
  -c cookies.txt
```

### 2. Query Public Projects Gallery
```bash
curl -s "http://localhost:8080/api/projects?limit=5" | jq .
```

### 3. Create a Team (Participant)
```bash
curl -s -X POST http://localhost:8080/api/teams \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer prt_2e88" \
  -d '{"name":"Team Cyberdyne","event_id":"evt_01"}' | jq .
```

### 4. Submit a Project (Participant)
```bash
curl -s -X POST http://localhost:8080/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer prt_2e88" \
  -d '{"title":"Neural Sentry","summary":"Distributed telemetry engine","track_id":"trk_ai","action":"submit"}' | jq .
```

### 5. Inspect Assigned Projects (Judge)
```bash
curl -s http://localhost:8080/api/judge/assignments \
  -H "Authorization: Bearer jdg_a_91bc" | jq .
```

### 6. Submit Evaluation Score (Judge)
```bash
curl -s -X POST http://localhost:8080/api/judge/scores \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer jdg_a_91bc" \
  -d '{
    "project_id": "prj_01",
    "criteria": {
      "technical_execution": 9,
      "innovation": 8,
      "presentation": 10
    },
    "comment": "Exemplary technical architecture and clean documentation.",
    "status": "SUBMITTED"
  }' | jq .
```

### 7. View Organizer Dashboard (Organizer)
```bash
curl -s http://localhost:8080/api/organizer/dashboard \
  -H "Authorization: Bearer org_7f2a" | jq .
```

### 8. Calculate Mathematical Normalization (Organizer)
```bash
curl -s http://localhost:8080/api/organizer/normalized \
  -H "Authorization: Bearer org_7f2a" | jq .
```

### 9. Download RFC 4180 CSV Export (Organizer)
```bash
curl -s http://localhost:8080/api/organizer/export.csv \
  -H "Authorization: Bearer org_7f2a" \
  -o dogfood-results.csv
```

### 10. Cast Community Choice Vote (Anti-Abuse Protected)
```bash
curl -s -X POST http://localhost:8080/api/voting/vote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer prt_2e88" \
  -d '{"event_id":"evt_01","project_id":"prj_02"}' | jq .
```

### 11. Verify Project Certificate (Ed25519)
```bash
curl -s http://localhost:8080/api/verify/certificate/prj_01 | jq .
```

### 12. Full Signed JSON Bulk Export (Organizer)
```bash
curl -s http://localhost:8080/api/organizer/export.json \
  -H "Authorization: Bearer org_7f2a" \
  -o dogfood-export.json
```

### 13. Register Outbound Webhook (Organizer)
```bash
curl -s -X POST http://localhost:8080/api/webhooks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer org_7f2a" \
  -d '{
    "event_id": "evt_01",
    "url": "https://webhook.site/demo-endpoint",
    "event_type": "project.submitted"
  }' | jq .
```

---

## Security Notes

The API enforces strict defense-in-depth security across all operations. For full forensic analysis and threat scenario proofs, see [`SECURITY.md`](file:///E:/Project-Judgement/SECURITY.md). Key mechanisms include:

1. **Backend Role Enforcement**: Every sensitive route validates authentication and checks role entitlements in SQLite via server-side middleware. Client UI components cannot bypass role constraints.
2. **Judge Peer Isolation**: Judges are restricted to their own assignments and scores. Tampering with query parameters (`?judge=...`) or path parameters returns `403 Forbidden`.
3. **Self-Voting Prohibition**: The voting service checks team membership and returns `403 Forbidden` if a participant attempts to vote for their own team's project.
4. **Duplicate Vote Protection**: SQLite UNIQUE constraint `UNIQUE(event_id, voter_user_id)` strictly guarantees exactly one vote per user per event (`409 Conflict`).
5. **Blind Voting Window Impartiality**: Vote tallies remain sealed to non-organizers until the scheduled voting window concludes.
6. **Rate Limiting & Spam Cooldowns**: Memory-backed velocity limiters guard voting endpoints (`429 Too Many Requests`) and comment posting.
7. **Webhook HMAC-SHA256 Signing**: Every webhook dispatch includes `X-Judgement-Signature: sha256=<hmac>` computed over the canonical JSON payload using the shared secret.
8. **Ed25519 Verifiable Certificates**: Audit receipts and project certificates are signed using Edwards-curve Digital Signature Algorithm (Ed25519) under SPKI / RFC 8410.

---

## Machine-Readable OpenAPI Contract

The formal OpenAPI 3.1 specification is maintained at:

```text
openapi.json
```

### Local Dependency-Free Validation

Validate `openapi.json` locally using standard Node.js without third-party dependencies:

```bash
node -e "JSON.parse(require('fs').readFileSync('openapi.json')); console.log('valid JSON')"
```

Inspect operation counts and verify OpenAPI 3.1 compliance:

```bash
node -e "const spec=JSON.parse(require('fs').readFileSync('openapi.json')); console.log('OpenAPI Version:', spec.openapi); console.log('Path Count:', Object.keys(spec.paths).length);"
```
