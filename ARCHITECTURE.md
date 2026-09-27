# ARCHITECTURE.md

## DOGFOOD 2026 Platform Architecture

This document describes the design, data flow, authorization boundaries, and architectural tradeoffs of the DOGFOOD 2026 hackathon submission and judging platform.

---

## 1. System Overview & Monolithic Design

The platform is designed as an air-gapped, self-contained monolithic service optimized for operability, mathematical integrity, and strict access isolation.

```
+-----------------------------------------------------------------------------------+
|                                  DOGFOOD PORTAL                                   |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  [ Presentation Layer: React 19 + Vite 8 SPA ]                                   |
|  - Bundled into static dist/ (zero external CDNs, fonts, or tracking scripts)     |
|  - Role-adaptive interfaces: Public Gallery, Participant, Judge, Organizer        |
|  - Instant evaluation via Seeded Fast-Switcher bar                                |
|                                                                                   |
|                                | HTTP / JSON / Cookies                            |
|                                v                                                  |
|                                                                                   |
|  [ Application Layer: Node.js v24 + Express 5 ]                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Routers:                                                                    |  |
|  |   - /projects, /projects/new (Public gallery & deadline enforcement)        |  |
|  |   - /api/auth (Local server-side sessions, password hashing, switch-seeded) |  |
|  |   - /api/events (Event management, tracks, prizes, deadline validation)     |  |
|  |   - /api/teams (Team formation, invite links, roster membership)            |  |
|  |   - /api/judge (Assigned queue, rubric scoring, judge isolation barrier)    |  |
|  |   - /api/organizer (Dashboard metrics, normalization, CSV export, audit)    |  |
|  +-----------------------------------------------------------------------------+  |
|  | Middleware Pipeline:                                                        |  |
|  |   - cookieParser() -> sessionMiddleware -> RBAC Guards                      |  |
|  |   - requireAuth, requireParticipant, requireJudge, requireOrganizer          |  |
|  |   - Strict Isolation Barrier (rejection of cross-judge parameter probes)    |  |
|  +-----------------------------------------------------------------------------+  |
|  | Core Domain Engines:                                                        |  |
|  |   - Deadline Engine: UTC timestamp validation against submissions_close     |  |
|  |   - Judging Engine: Track-aware assignment, immutable rubric enforcement     |  |
|  |   - Normalization Engine: Empirical Bayes regularized Z-score model         |  |
|  |   - CSV Streamer: RFC 4180 compliant escaping with stable columns            |  |
|  +-----------------------------------------------------------------------------+  |
|  | Persistence Layer: Native node:sqlite (DatabaseSync / SQLite 3.53)          |  |
|  |   - WAL journal mode, enforced foreign key constraints, parameterized SQL   |  |
|  +-----------------------------------------------------------------------------+  |
|                                                                                   |
|  [ Data Store: hackathon.db ]                                                     |
+-----------------------------------------------------------------------------------+
```

---

## 2. Core Architectural Decisions & Tradeoffs

### Decision 1: Native SQLite (`node:sqlite`) vs External ORM / PostgreSQL
- **Rationale:** Node.js 22+ includes native synchronous SQLite bindings (`DatabaseSync`) compiling zero C++ add-ons during installation. This guarantees 100% deterministic builds across Windows, macOS, and Linux Alpine Docker containers without compiler dependencies (`gcc`, `make`, `python node-gyp`).
- **Tradeoff:** Database writes require serialization. For hackathons (< 1,000 concurrent participants, ~30–50 judges), SQLite in WAL mode handles over 10,000 transactions per second locally with zero maintenance overhead.

### Decision 2: Monolithic Single-Port Deployment
- **Rationale:** Express serves both the REST API and the pre-built React static distribution from `dist/` on port 8080.
- **Tradeoff:** No need for a separate reverse proxy (Nginx) or multi-container networking complexity. Works out-of-the-box in air-gapped environments with network disconnected.

### Decision 3: Server-Side State & Session Tokens
- **Rationale:** Sessions are stored in the SQLite `sessions` table. Session cookies (`Cookie: session=...`) and bearer tokens are supported interchangeably.
- **Tradeoff:** Server lookup on each request ensures immediate revocation capability and prevents client-side claim forgery.

---

## 3. Authorization Model & Judge Isolation Barrier

The system enforces strict server-side authorization:

1. **Role-Based Access Control (RBAC):**
   - `visitor`: Unauthenticated access to public gallery and project details.
   - `participant`: Team creation, joining via invite codes, project creation/drafting before deadline.
   - `judge`: Viewing only their assigned projects and submitting evaluations.
   - `organizer` / `admin`: Event creation, track/prize configuration, judge assignment, dashboard access, normalization execution, and CSV export.

2. **The Judge Isolation Barrier (Critical Security Requirement):**
   - When a judge requests `GET /api/judge/scores`, the backend derives the judge ID strictly from the authenticated session token.
   - If an adversary attempts to append query parameters (`?judge=judge_a` or `?judge=jdg_01`) or access another judge's path:
     ```javascript
     if (resolvedTarget !== currentJudgeId && !isOrganizer(req.user)) {
       return res.status(403).json({ error: 'Forbidden: Access to peer judge scores is strictly prohibited' });
     }
     ```
   - Participants attempting to access judge endpoints are blocked with `403 Forbidden`.
   - Judges attempting to access projects not assigned to them are blocked with `403 Forbidden`.

---

## 4. Deadline Enforcement Flow

1. An event stores its submission deadline as an ISO 8601 UTC string (`submissions_close`).
2. When a participant calls `POST /projects/new` or updates a submission:
   ```javascript
   if (new Date().toISOString() >= event.submissions_close) {
     return res.status(400).json({ error: 'Submissions are closed for this event' });
   }
   ```
3. Frontend buttons cannot bypass this check; curl, scripts, and `run.py` are strictly rejected by the server with HTTP 4xx.

---

## 5. Deployment & Containerization

- Multi-stage `Dockerfile`:
  - **Stage 1 (Builder):** Uses `node:22-alpine` with `corepack` to install dependencies and run `vite build`.
  - **Stage 2 (Runner):** Minimal runtime container copying `dist/`, `src/`, `package.json`, and `fixtures.json`.
- `docker-compose.yml`: Maps port `8080:8080` and starts the application with automatic migration and seeding.

---

## 6. Community Voting & Anti-Abuse Architecture (T3)

1. **Ballot Randomization Engine:**
   - Standard hackathons suffer from significant *first-entry positional bias*, where projects listed near the top of the ballot receive disproportionately more votes.
   - The platform generates a deterministic PRNG Fisher-Yates shuffle parameterized by the voter's identity or session token (`deterministicShuffle(projects, voterId)`).
   - Every voter receives a uniquely shuffled ballot ordering that remains stable across reloads during their evaluation session.

2. **Blind Voting Window:**
   - Community voting results remain sealed while the voting window is active (`start_time <= now <= end_time`).
   - Querying `/api/voting/results` during an active window returns `{ is_blind: true }` with all vote counts withheld from participants to prevent herd voting behavior.
   - Once the voting window closes (or when requested by organizers), the ranked vote tally is unveiled.

3. **Multi-Layered Anti-Abuse Architecture:**
   - **Self-Voting Barrier:** Strict relational join against `team_members` prevents participants from voting for projects submitted by their own team (HTTP 403 Forbidden).
   - **Single Vote Constraint:** SQLite database enforces `UNIQUE(event_id, voter_user_id)`, rejecting any repeat voting attempt with HTTP 409 Conflict.
   - **Velocity Throttling:** Rapid automated vote casting is throttled via sliding-window rate limiters.
   - **Comment Moderation:** Project comments support author removal, rate-limiting, and an organizer moderation flag (`is_flagged`) that immediately hides abusive content from the public.

---

## 7. Cryptographic Verification & Stretch Extensions (T4)

1. **Tamper-Proof Audit Receipts:**
   - Submissions, scores, and certificates are transformed into sorted, canonical JSON strings (`canonicalizeJson`) and hashed with SHA-256.
   - An HMAC-SHA256 digital signature is produced using the event's master signing key (`signDigest(digest)`).
   - Any external observer can verify that a record has not been altered via `/api/verify/record/:signature` with constant-time verification (`crypto.timingSafeEqual`).

2. **Digital Submission Certificates:**
   - Submitted projects can generate cryptographic completion certificates (`/api/verify/certificate/:projectId`) containing the project digest, timestamp, and verifiable digital signature.

3. **Webhooks Dispatcher:**
   - Organizers can register webhook endpoints triggered on key hackathon events (`project.submitted`, `judging.completed`, `voting.closed`).
   - Payloads are signed with an `X-Dogfood-Signature: sha256=...` header.

4. **Embeddable Gallery Widget:**
   - External partner sites or hackathon landing pages can embed the live project gallery using a lightweight iframe endpoint (`/embed/gallery`) with responsive styles and zero dependencies.

