# SECURITY.md — DOGFOOD 2026 Formal Threat Model & Security Specification

This document provides the formal, defensible threat model, trust boundary analysis, attack surface catalog, and security control matrix for the **DOGFOOD 2026 Hackathon Submission, Judging, and Community Platform** (`Project-Judgement`).

---

## 1. System Overview & Security Objectives

The DOGFOOD 2026 platform is an air-gapped, self-hosted, multi-tenant web application designed to govern hackathon project lifecycles: registration, team formation, project drafting, hard-deadline submission, track-aware judge assignment, multi-criterion rubric evaluation, mathematical cross-judge normalization, blind community voting, and cryptographically verifiable audit archiving.

The platform enforces the following core security objectives:

1. **Judge Confidentiality & Peer Isolation:** Complete isolation of individual judge scores, pairwise comparison assignments, and evaluation comments from peer judges, participants, and visitors.
2. **Role-Based Access Separation (RBAC):** Strict operational boundaries separating Visitors, Participants, Judges, and Organizers/Administrators.
3. **Score & Rubric Integrity:** Cryptographic immutability of scoring criteria once active evaluation begins, coupled with deterministic mathematical normalization.
4. **Community Voting Integrity:** Elimination of first-entry positional bias, enforcement of exactly one vote per authenticated voter per event, strict prevention of team self-voting, and blind voting windows that suppress herd behavior.
5. **Submission Authenticity & Deadline Enforcement:** Server-side UTC ISO 8601 deadline enforcement that cannot be bypassed by client-side clock tampering or API spoofing.
6. **Comprehensive Auditability:** Detailed, unalterable system audit trail recording all administrative, scoring, and lifecycle actions without leaking authentication credentials or secrets.
7. **Cryptographic Record Authenticity:** Offline verifiable, tamper-evident digital signatures utilizing asymmetric **Ed25519** (RFC 8032) cryptography for evaluations, submission certificates, and full-state bulk exports.
8. **Data Export Safety:** Defense against CSV Formula Injection (CWE-1236) to prevent Remote Code Execution (RCE) in spreadsheet software used by organizers.
9. **Offline Trust Boundary:** Complete, self-contained operational independence within air-gapped Docker environments without external cloud telemetry, third-party authentication dependencies, or network leakage.

---

## 2. Trust Boundaries & Architecture

```
[ UNTRUSTED ZONE: Web Browser / Public Internet / Adversarial Clients ]
                               |
                               | (HTTP / JSON / Cookies / Bearer Tokens)
                               v
+-----------------------------------------------------------------------------------------+
| TRUST BOUNDARY 1: Transport & Gateway Layer (Express 5 Application)                     |
| - CORS isolation, Body parsing limiters, Request parameter sanitization                 |
+-----------------------------------------------------------------------------------------+
                               |
                               v
+-----------------------------------------------------------------------------------------+
| TRUST BOUNDARY 2: Authentication Layer (src/server/middleware/auth.js)                  |
| - Session Token Extraction (Cookie `session=...`, Bearer header, x-session-token)       |
| - Active Session Validation against SQLite `sessions` store                             |
| - Anonymous identity fallback (Visitor role)                                            |
+-----------------------------------------------------------------------------------------+
                               |
                               v
+-----------------------------------------------------------------------------------------+
| TRUST BOUNDARY 3: Role-Based Authorization Layer (RBAC Guards)                          |
| - requireAuth, requireParticipant, requireJudge, requireOrganizer, requireRole          |
| - Strict identity derivation: req.user.id derived solely from validated session        |
+-----------------------------------------------------------------------------------------+
       |                               |                               |
       v                               v                               v
+-----------------------+   +-----------------------+   +-----------------------+
| TRUST BOUNDARY 4:     |   | TRUST BOUNDARY 5:     |   | TRUST BOUNDARY 6:     |
| Participant & Voting  |   | Judge Evaluation      |   | Organizer Operations  |
| Realm                 |   | Realm                 |   | & Administration      |
| - Self-Vote Guard     |   | - Peer Isolation Guard|   | - Event & Track Mgmt  |
| - Unique Vote Guard   |   | - Assignment Guard    |   | - Rubric Locking Guard|
| - Deadline UTC Guard  |   | - Rubric Range Guard  |   | - Normalization Engine|
| - Velocity Limiter    |   | - Cryptographic Signer|   | - Signed Bulk Export  |
+-----------------------+   +-----------------------+   +-----------------------+
       |                               |                               |
       +-------------------------------+-------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------------+
| TRUST BOUNDARY 7: Persistence Layer (src/server/db/database.js)                         |
| - Native Node.js `node:sqlite` (DatabaseSync engine)                                    |
| - 100% Parameterized Prepared Statements (Zero Dynamic SQL Concatenation)               |
| - Enforced Foreign Keys (`PRAGMA foreign_keys = ON`), WAL Journaling Mode               |
| - Relational Integrity Constraints (UNIQUE indexes preventing duplicate state)          |
+-----------------------------------------------------------------------------------------+
       |                               |                               |
       v                               v                               v
+-----------------------+   +-----------------------+   +-----------------------+
| TRUST BOUNDARY 8:     |   | TRUST BOUNDARY 9:     |   | TRUST BOUNDARY 10:    |
| Outbound Webhooks     |   | Cryptographic Service |   | Data Export Streamer  |
| - HMAC-SHA256 Signing |   | - Ed25519 SPKI Keys   |   | - RFC 4180 Escaping   |
| - 4s AbortController  |   | - Canonical JSON Hash |   | - Formula Injection   |
| - Delivery Audit Log  |   | - Public Verifier     |   |   Sanitization        |
+-----------------------+   +-----------------------+   +-----------------------+
```

### Detailed Trust Boundary Specifications

1. **Browser / Untrusted Client $\to$ Express Gateway:** All inbound HTTP requests (headers, query parameters, URL path segments, JSON request bodies) are treated as hostile. No client-supplied role or identity claim is trusted.
2. **Session Identification:** The user's identity is derived exclusively on the server by resolving the session token against `sessions.token`. Client-supplied user ID parameters (e.g., `?judge=...`, `?user_id=...`, `{ voter_id: ... }`) are rejected or verified against the authenticated session token.
3. **Internal Component Boundaries:** Domain routers (`src/server/routes/*`) rely on upstream middleware guards to establish authorization before business logic executes.
4. **Database Execution Boundary:** The persistence layer accepts only parameterized queries. Raw user input never touches the SQL grammar parser.
5. **Outbound Network Boundary:** Webhook dispatches are executed with timeout circuit breakers (`AbortController` set to 4000ms) to ensure slow external endpoints cannot exhaust platform socket pools.

---

## 3. STRIDE Threat Model Classification

| STRIDE Category | Primary Threat Vectors | Platform Mitigations | Enforcement Mechanism |
|:---|:---|:---|:---|
| **Spoofing** | Session hijacking, forged judge headers, forged voter identity | High-entropy session tokens, server-side session store, session-derived user resolution. | `src/server/middleware/auth.js` |
| **Tampering** | Deadline evasion, rubric criteria tampering, vote manipulation, SQL injection | Server-side UTC comparisons, rubric immutability locking, composite UNIQUE database constraints, parameterized queries. | `src/server/routes/projects.js`, `src/server/routes/organizer.js`, `node:sqlite` |
| **Repudiation** | Denying evaluation submissions, unauthorized administrative modifications | Append-only `audit_logs` table, Ed25519 digital signatures with SHA-256 canonical digests. | `src/server/services/verification.js`, `src/server/routes/organizer.js` |
| **Information Disclosure** | Peer judge snooping, unblinded live vote inspection, private project leak | Hardened Peer Isolation Barrier, blind voting window enforcement, SQL projection filtering of drafts/passwords. | `src/server/routes/judging.js`, `src/server/routes/voting.js`, `src/server/app.js` |
| **Denial of Service** | Vote flooding, spam comment injection, webhook connection starvation | Sliding-window velocity rate limiting, 4s webhook delivery timeouts. | `src/server/routes/voting.js`, `src/server/services/webhook.js` |
| **Elevation of Privilege** | Participant accessing judge/organizer views, horizontal judge-to-judge escalation | Layered RBAC route guards (`requireJudge`, `requireOrganizer`), ownership verification checks. | `src/server/middleware/auth.js`, `src/server/routes/judging.js` |

---

## 4. Mandatory DOGFOOD Threat Analysis

Each of the 10 mandatory DOGFOOD threat scenarios is analyzed below using a consistent, forensic engineering structure.

---

### Threat 1: Sybil Voting

- **Threat Class:** Spoofing / Tampering
- **Attacker:** Malicious participant or coordinated group attempting to artificially inflate a project's community vote tally by registering multiple fraudulent accounts.
- **Asset:** Integrity and impartiality of community voting results.
- **Attack Surface:** `POST /api/auth/register` (or rapid alternate account creation) $\to$ `POST /api/voting/vote`.
- **Attack Scenario:** An attacker writes a script to register dozens of synthetic user accounts, obtain valid session tokens for each, and cast votes for a target project to dominate the community prize.
- **Existing Mitigation:**
  1. The database strictly enforces uniqueness on email addresses: `UNIQUE(email)` in `users`.
  2. Each account must maintain a valid, server-issued session token in `sessions`.
  3. Voting strictly requires authentication (`requireAuth`).
  4. The platform enforces exactly one vote per authenticated account via `UNIQUE(event_id, voter_user_id)` in the `votes` table.
- **Enforcement Layer:** Database Unique Constraints (`users`, `votes`) & Authentication Middleware (`src/server/middleware/auth.js`).
- **Relevant Code:**
  - `src/server/db/schema.sql` (`CREATE TABLE users (... email TEXT UNIQUE NOT NULL ...)` and `CREATE TABLE votes (... UNIQUE(event_id, voter_user_id) ...)`)
  - `src/server/routes/voting.js` (`router.post('/vote', requireAuth, ...)` lines 168–259)
- **Verification:**
  - `tests/integration/t3_voting.test.js` (Test #4, #5)
  - `tests/unit/auth.test.js`
- **Residual Risk:**
  - *Honest Disclosure:* In an air-gapped, self-hosted hackathon portal with network isolation, third-party identity proofing (e.g., Google OAuth, SMS OTP, reCAPTCHA, WorldID) is unavailable by design. If registration is open, an adversary with programmatic access can create multiple distinct email accounts. The platform guarantees that **one authenticated account equals exactly one vote**, but **one human equals one account is NOT cryptographically established**.
- **Status:** **MITIGATED / ACCEPTED RESIDUAL RISK**

---

### Threat 2: Ballot Stuffing

- **Threat Class:** Tampering
- **Attacker:** Authenticated voter attempting to submit multiple votes for their preferred project.
- **Asset:** Democratic vote weighting (1 vote per person).
- **Attack Surface:** `POST /api/voting/vote`.
- **Attack Scenario:** A voter submits the vote API call multiple times sequentially or concurrently using automated scripts or curl.
- **Existing Mitigation:**
  1. Application-level check: Before inserting, the route checks if a record exists for `(event_id, voter_user_id)`. If found, it immediately responds with `HTTP 409 Conflict`.
  2. Database-level barrier: The `votes` table enforces `UNIQUE(event_id, voter_user_id)`. Even in the event of concurrent requests, SQLite's atomic write lock ensures only the first insert succeeds; the second violates the constraint and triggers an immediate rollback.
- **Enforcement Layer:** Database Relational Engine (`node:sqlite`) & Application Logic (`src/server/routes/voting.js`).
- **Relevant Code:**
  - `src/server/routes/voting.js` (lines 229–251)
  - `src/server/db/schema.sql` (lines 176–177)
- **Verification:**
  - `tests/integration/t3_voting.test.js` (Test #5: *"Anti-Abuse: Duplicate vote by same user in same event is rejected (HTTP 409 Conflict)"*)
- **Residual Risk:** None for a given account. All duplicate attempts are rejected.
- **Status:** **PREVENTED**

---

### Threat 3: Duplicate Voting (Race Conditions & Replay)

- **Threat Class:** Tampering
- **Attacker:** Network adversary or client script firing concurrent, near-simultaneous HTTP requests to exploit race conditions before the database writes.
- **Asset:** Single-vote invariant per voter per event.
- **Attack Surface:** `POST /api/voting/vote`.
- **Attack Scenario:** An attacker sends 50 parallel HTTP POST requests across multiple connection threads with the same session cookie, hoping to exploit a "check-then-act" time-of-check to time-of-use (TOCTOU) gap.
- **Existing Mitigation:**
  1. Synchronous serialization: The backend uses synchronous `node:sqlite` (`DatabaseSync`), which serializes all write transactions through SQLite's transactional lock.
  2. Composite uniqueness: `UNIQUE(event_id, voter_user_id)` acts as a hardware-level gate at the persistence layer. Any thread attempting to write an identical tuple is rejected by SQLite with `SqliteError: UNIQUE constraint failed`.
  3. The route catches SQLite constraint violations and maps them cleanly to `HTTP 409 Conflict`.
- **Enforcement Layer:** Database Engine (`node:sqlite` B-tree index uniqueness).
- **Relevant Code:**
  - `src/server/routes/voting.js` (lines 241–251)
- **Verification:**
  - `tests/integration/t3_voting.test.js` (Test #5)
- **Residual Risk:** None. The single-writer model of SQLite completely eliminates concurrent insert races.
- **Status:** **PREVENTED**

---

### Threat 4: Self-Voting

- **Threat Class:** Tampering / Unfair Advantage
- **Attacker:** Registered hackathon participant attempting to vote for their own team's submission.
- **Asset:** Fairness of the community voting leaderboard.
- **Attack Surface:** `POST /api/voting/vote`.
- **Attack Scenario:** A participant discovers the project ID of their team's submission (`prj_01`), crafts an API request `{"event_id": "evt_01", "project_id": "prj_01"}`, and submits it to the voting endpoint.
- **Existing Mitigation:**
  1. The server identifies the project's owning team via `projects.team_id`.
  2. The server executes an authoritative SQL query checking whether the authenticated voter (`req.user.id`) exists in `team_members` for that team:
     ```javascript
     const isMemberOfTeam = db.prepare(`
       SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?
     `).get(project.team_id, voterId);
     if (isMemberOfTeam) {
       return res.status(403).json({ error: 'Self-voting is strictly prohibited.' });
     }
     ```
  3. The request is rejected with `HTTP 403 Forbidden` before any vote record can be created.
- **Enforcement Layer:** Application Authorization Controller (`src/server/routes/voting.js`).
- **Relevant Code:**
  - `src/server/routes/voting.js` (lines 218–226)
- **Verification:**
  - `tests/integration/t3_voting.test.js` (Test #3: *"Anti-Abuse: Self-voting is strictly forbidden (HTTP 403)"*)
- **Residual Risk:** Applies to all registered members of the team. If a teammate registers an undisclosed alternate account that was never added to the team roster, that unlinked account is not detected by this check (see Threat 1: Sybil Voting).
- **Status:** **PREVENTED (for all roster members)**

---

### Threat 5: Vote Automation & API Flooding

- **Threat Class:** Denial of Service / Tampering
- **Attacker:** Scripted client attempting to flood the voting or comments endpoints with hundreds of requests per second.
- **Asset:** Server CPU, memory, and database availability.
- **Attack Surface:** `POST /api/voting/vote`, `POST /api/projects/:projectId/comments`.
- **Attack Scenario:** An automated bot sends hundreds of requests per minute to hammer the voting and commenting endpoints.
- **Existing Mitigation:**
  1. The platform implements an in-memory sliding-window velocity limiter (`isRateLimited(voterId)`).
  2. In production mode, the voting velocity window enforces a minimum cooldown (default 2000ms between attempts per user ID; configurable via `RATE_LIMIT_WINDOW_MS`).
  3. In production mode, commenting enforces a minimum cooldown of 3000ms per author.
  4. Rapid requests violating the window are immediately terminated with `HTTP 429 Too Many Requests` without performing database queries.
  5. In test environments (`NODE_ENV=test`), cooldown windows collapse to 0ms to allow high-speed regression test suites while preserving limiter validation logic.
- **Enforcement Layer:** Application Memory Middleware (`src/server/routes/voting.js`, `src/server/routes/comments.js`).
- **Relevant Code:**
  - `src/server/routes/voting.js` (lines 8–31, 178–180)
  - `src/server/routes/comments.js` (lines 14–31, 85–88)
- **Verification:**
  - `tests/unit/rate_limit.test.js` (7 unit tests covering production defaults, rapid duplicate vote rate limiting, comment cooldown, and test mode overrides)
- **Residual Risk:**
  - *Honest Disclosure:* The rate-limiting cache is process-local (`recentVotes = new Map()`). A container restart resets the rate-limiting map. This is an accepted engineering design for a self-hosted single-container hackathon portal.
- **Status:** **MITIGATED**

---

### Threat 6: Participant Collusion & Herd Voting

- **Threat Class:** Unfair Advantage / Social Engineering
- **Attacker:** Groups of participants agreeing to trade votes ("vote swapping"), or voters following early leaders due to visible live scores.
- **Asset:** Impartial, unskewed community evaluation.
- **Attack Surface:** `GET /api/voting/ballot`, `GET /api/voting/results`.
- **Attack Scenario:**
  - **Scenario A (Positional Bias):** Voters lazily vote for the first three projects displayed at the top of the gallery page.
  - **Scenario B (Herd Mentality):** Voters see project A leading with 50 votes and bandwagon their votes to project A.
- **Existing Mitigation:**
  1. **Ballot Randomization Engine:** The server implements a deterministic PRNG Fisher-Yates shuffle seeded by the voter's identity (`deterministicShuffle(projects, voterId)`). Every voter receives a uniquely shuffled ballot ordering that remains stable for them during their session, completely destroying first-entry positional bias.
  2. **Blind Voting Window:** While the voting window is open (`start_time <= now <= end_time`), `GET /api/voting/results` returns `{ is_blind: true }` and suppresses all vote counts and project ranks from participants and visitors. Live counts are only exposed to authenticated organizers.
- **Enforcement Layer:** Cryptographic Shuffle Engine (`crypto.createHash('sha256')`) & Controller (`src/server/routes/voting.js`).
- **Relevant Code:**
  - `src/server/routes/voting.js` (lines 33–58, 146–149, 276–288)
- **Verification:**
  - `tests/integration/t3_voting.test.js` (Test #2: *"Ballot returns randomized project ordering per voter (eliminating positional bias)"*)
  - `tests/integration/t3_voting.test.js` (Test #6: *"Blind Voting Window: Active window seals results from participants"*)
  - `tests/integration/t3_voting.test.js` (Test #7: *"Organizer can view live unblinded voting results during active window"*)
- **Residual Risk:**
  - Technical controls successfully eliminate positional bias and herd bandwagoning. However, out-of-band social coordination (e.g., participants messaging each other on Discord or WhatsApp to trade votes) cannot be prevented by software.
- **Status:** **MITIGATED / TECHNICAL CONTROLS PREVENTED (Human collusion accepted residual risk)**

---

### Threat 7: Submission Scraping & Metadata Harvesting

- **Threat Class:** Information Disclosure
- **Attacker:** Competitor or external web scraper attempting to access draft submissions, harvesting participant emails, or extracting unpublished repository links.
- **Asset:** Confidentiality of in-progress drafts and participant PII.
- **Attack Surface:** `GET /projects`, `GET /api/projects`, `GET /projects/:id`.
- **Attack Scenario:** A competing team crawls the `/api/projects` endpoint to find draft projects that have not been submitted, looking to copy ideas before the deadline.
- **Existing Mitigation:**
  1. All public gallery queries (`GET /projects`, `GET /api/projects`, `/embed/gallery`) strictly include `WHERE p.status = 'SUBMITTED'`.
  2. Draft projects (`status = 'DRAFT'`) are completely invisible to anyone except the authoring team members (checked via `team_members` join in `GET /api/teams/my-team`).
  3. Sensitive metadata (user password hashes, session tokens, judge assignment IDs) is strictly omitted from all public projection queries.
  4. Submitted project details (title, summary, track, repo URL, demo URL) are intentionally public by design to serve as the hackathon gallery.
- **Enforcement Layer:** SQL Query Projection & Status Filtering (`src/server/app.js`, `src/server/routes/projects.js`).
- **Relevant Code:**
  - `src/server/app.js` (lines 70, 342, 366)
  - `src/server/routes/projects.js` (lines 36–58, 97–114)
- **Verification:**
  - `tests/integration/t1-api.test.js` (Test #1, #2, #3, #4, #12)
- **Residual Risk:** Public submitted projects are accessible to any unauthenticated client, as required by the hackathon gallery specification.
- **Status:** **PREVENTED (Drafts and sensitive PII are fully protected)**

---

### Threat 8: Judge Collusion, Harshness & Zero-Variance Bias

- **Threat Class:** Tampering / Unfair Evaluation
- **Attacker:** Corrupt, biased, or negligent judge attempting to penalize certain teams, artificially boost favored teams, or assign uniform low/high scores across their assigned projects.
- **Asset:** Mathematical fairness, accuracy, and defensibility of final competition rankings.
- **Attack Surface:** `POST /api/judge/scores` $\to$ Scoring Aggregation $\to$ Final Leaderboard.
- **Attack Scenario:**
  - **Scenario A (Harsh Judge):** Judge `jdg_14` gives consistently harsh marks (mean 3.0), penalizing unlucky projects assigned to them.
  - **Scenario B (Zero-Variance Judge):** Judge `jdg_07` awards a flat 4.0 across every criterion for all assigned projects, providing zero discriminatory signal.
  - **Scenario C (Score Manipulation):** A judge tries to score projects outside their assigned track.
- **Existing Mitigation (Layered Defense):**
  1. **Layer 1: Assignment Isolation:** Judges cannot score arbitrary projects. `POST /api/judge/scores` verifies that an active assignment exists in `judge_assignments` (`WHERE judge_user_id = ? AND project_id = ?`). Unassigned scoring attempts are rejected with `HTTP 403 Forbidden`.
  2. **Layer 2: Track Restriction:** Automatic and manual assignments enforce `judge_tracks` alignment unless an organizer explicitly overrides.
  3. **Layer 3: Peer Score Anonymity:** Judges cannot view scores or feedback submitted by peer judges, preventing anchoring bias and groupthink.
  4. **Layer 4: Empirical Bayes Regularized Z-Score Normalization:**
     - Judge means $\mu_j$ are centered ($Z_{j,p} = (R_{j,p} - \mu_j) / \sigma_{j,\text{reg}}$), converting absolute marks to relative standard deviations.
     - Judge sample variances $s_j^2$ are regularized toward the event prior variance $\sigma^2_{\text{global}}$ ($m = 2.0$ pseudocounts):
       $$\sigma_{j,\text{reg}} = \sqrt{\frac{N_j \cdot s_j^2 + m \cdot \sigma^2_{\text{global}}}{N_j + m}}$$
       Zero-variance judges (`jdg_07`) receive $\sigma_{j,\text{reg}} \approx 0.4099 > 0$ and $Z = 0.0$ (neutral), completely preventing division by zero and score blowout.
     - Bayesian shrinkage mean ($k_0 = 1.0$) pulls projects with small review counts toward the population mean, preventing lucky 2-review projects from outranking robust 5-review projects.
  5. **Layer 5: Non-Repudiable Cryptographic Receipts:** Every submitted score generates an immutable Ed25519 digital signature stored in `verifiable_records`.
- **Enforcement Layer:** Application Controller (`src/server/routes/judging.js`), Normalization Engine (`src/server/services/normalization.js`), Cryptographic Verifier (`src/server/services/verification.js`).
- **Relevant Code:**
  - `src/server/routes/judging.js` (lines 264–273, 363–380)
  - `src/server/services/normalization.js` (lines 148–177, 224–226)
  - `scripts/normalization-proof.js`
- **Verification:**
  - `tests/integration/t2-judging.test.js` (Tests #8, #9, #14)
  - `tests/unit/normalization.test.js` (4 tests validating zero-variance resilience, single-review stability, and deterministic rankings)
- **Residual Risk:**
  - If a cabal of multiple corrupt judges explicitly coordinates offline to give low scores to a target project, Z-score normalization will soften the blow but cannot invent positive scores. Organizers must monitor the audit log and progress dashboard for anomalies.
- **Status:** **MITIGATED / MATHEMATICALLY BOUNDED**

---

### Threat 9: Deadline Gaming & Late Submission

- **Threat Class:** Tampering
- **Attacker:** Participant attempting to edit code, update demo links, or submit a project after the hackathon submission window has closed.
- **Asset:** Equal competition time window for all teams.
- **Attack Surface:** `POST /projects/new`, `POST /api/projects`, `PUT /api/projects/:id`, `POST /api/projects/:id/submit`.
- **Attack Scenario:** An attacker alters their local system clock or scripts automated HTTP PUT requests after `submissions_close` has passed, hoping client-side validation is the only gate.
- **Existing Mitigation:**
  1. The server stores the deadline as an immutable ISO 8601 UTC timestamp in `events.submissions_close`.
  2. Every creation, update, and finalization endpoint executes a strict server-side UTC comparison:
     ```javascript
     if (new Date().toISOString() >= event.submissions_close) {
       return res.status(400).json({ error: 'Submissions are closed for this event' });
     }
     ```
  3. Client-side clocks, browser state, and request headers have zero bearing on the evaluation.
  4. The official fixture dataset deliberately sets `submissions_close: "2026-03-01T18:00:00Z"` (in the past), proving that seeded environments refuse submissions immediately.
- **Enforcement Layer:** Server Application Routing Middleware (`src/server/routes/projects.js`).
- **Relevant Code:**
  - `src/server/routes/projects.js` (lines 145–148, 265–268, 321–324)
  - `src/server/db/seed.js`
- **Verification:**
  - `tests/integration/t1-api.test.js` (Test #5: *"Closed event strictly refuses submissions with HTTP 4xx"*)
  - `tests/unit/deadline.test.js` (3 unit tests verifying expired deadlines, open deadlines, and exact boundary conditions)
  - `run.py` (Acceptance Check T1.3: *"closed event refuses submissions .. PASS"*)
- **Residual Risk:** None. The check is completely server-side and UTC-enforced.
- **Status:** **PREVENTED**

---

### Threat 10: Unauthorized Score Access & Peer Score Tampering

- **Threat Class:** Information Disclosure / Elevation of Privilege
- **Attacker:** Authenticated judge attempting to spy on peer judges' scoring, or a participant attempting to inspect internal judging marks before winners are announced.
- **Asset:** Confidentiality and independence of judging evaluations.
- **Attack Surface:** `GET /api/judge/scores`, `GET /api/judge/scores/:scoreId`, `GET /api/export.csv`.
- **Attack Scenario:**
  - **Scenario A (Parameter Probe):** Judge B logs in, inspects network traffic, and issues `GET /api/judge/scores?judge=jdg_01` or `GET /api/judge/scores?judge=judge_a` to read Judge A's evaluations.
  - **Scenario B (Participant Intrusion):** A participant attempts to query `/api/judge/scores` or `/api/export.csv`.
- **Existing Mitigation (Hardened Isolation Barrier):**
  1. **Strict Session Derivation:** When a judge calls `GET /api/judge/scores`, the database query filters exclusively by `WHERE s.judge_user_id = ?`, passing `req.user.id` (derived from the server session).
  2. **Parameter Probe Hardening:** The server intercepts any query parameter that attempts to specify a target judge (`judge`, `judge_id`, `judge_user_id`, `user_id`, `judgeId`, `userId`, `target`, `target_judge`). If the resolved target does not match `req.user.id` and the user is not an organizer/admin, the server immediately emits `HTTP 403 Forbidden`:
     ```javascript
     if (resolvedTarget !== currentJudgeId && !isOrganizer(req.user)) {
       return res.status(403).json({ error: 'Forbidden: Access to peer judge scores is strictly prohibited' });
     }
     ```
  3. **Single Score Detail Ownership:** `GET /api/judge/scores/:scoreId` asserts `score.judge_user_id === req.user.id`. Peer judges are blocked with `HTTP 403 Forbidden`.
  4. **RBAC Endpoint Protection:** Participants calling `/api/judge/*` are rejected with `HTTP 403 Forbidden` by `requireJudge`.
  5. **Participant Export Blocking:** Participants calling `/api/export.csv` are rejected with `HTTP 403 Forbidden` by `requireOrganizer`.
- **Enforcement Layer:** Application Security Middleware & Endpoint Guards (`src/server/middleware/auth.js`, `src/server/routes/judging.js`, `src/server/routes/organizer.js`).
- **Relevant Code:**
  - `src/server/routes/judging.js` (lines 23–45, 89–127)
  - `src/server/middleware/auth.js` (`requireJudge`, `requireOrganizer`)
- **Verification:**
  - `tests/integration/t2-judging.test.js`:
    - Test #1: Judge A can view their own scores (HTTP 200)
    - Test #2: Judge B is FORBIDDEN from viewing Judge A scores via `?judge=jdg_01` (HTTP 403)
    - Test #3: Judge B is FORBIDDEN from viewing Judge A scores via `?judge=judge_a` alias (HTTP 403)
    - Test #4: Participant is BLOCKED from accessing judge scores (HTTP 403)
    - Test #5: Unauthenticated request to judge scores returns 401 Unauthorized
    - Test #7: Participant is BLOCKED from exporting CSV (HTTP 403)
    - Test #17: Parameter probe hardening: Alternate parameter names are strictly blocked with 403
    - Test #18: Score detail ownership: Judge B is FORBIDDEN from viewing Judge A's single score with 403
  - `run.py` (Acceptance Checks T2.1, T2.2, T2.3, T2.4)
- **Residual Risk:** None. The peer isolation barrier is enforced in code, verified by 8 independent automated tests, and validated by the official DOGFOOD checker.
- **Status:** **PREVENTED**

---

## 5. Data, Application & Transport Security Controls

### 5.1. SQL Injection Defense
- **Architecture:** The application utilizes Node.js native `node:sqlite` (`DatabaseSync`).
- **Implementation:** 100% of SQL statements across the codebase use parameterized query placeholders (`?`). String interpolation and dynamic concatenation into SQL grammar are strictly prohibited.
- **Proof:** Audited across all 11 router and service files. Zero instances of string template literals (`${...}`) inside `.prepare()` or `.run()` queries.

### 5.2. Cross-Site Scripting (XSS) Defense
- **Client-Side:** The presentation layer is authored in React 19 / JSX, which automatically contextualizes and escapes text nodes before DOM insertion. No usage of `dangerouslySetInnerHTML`.
- **Server-Side Fallback:** The server-side HTML gallery generator (`src/server/app.js`) implements a strict sanitization helper (`escapeHtml`):
  ```javascript
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  ```
  Applied across all project titles, summaries, team names, and track descriptions.

### 5.3. CSV Formula Injection Defense (CWE-1236)
- **Vulnerability:** When hackathon results are exported to CSV, malicious team or project titles starting with formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) can execute arbitrary code inside Microsoft Excel or Google Sheets.
- **Mitigation:** The CSV generator (`src/server/services/csv.js`) inspects every text field. If the first character matches a trigger character, it is prepended with a single apostrophe (`'`):
  ```javascript
  function sanitizeField(value) {
    if (typeof value !== 'string') return value;
    if (/^[=+\-@\t\r]/.test(value)) {
      return "'" + value;
    }
    return value;
  }
  ```
  Numeric values (ranks, scores, review counts) remain unquoted numbers.
- **Verification:** `tests/unit/csv.test.js` (Test #3: *"neutralizes formula injection characters (=, +, -, @, \t) to prevent CWE-1236"*).

### 5.4. Insecure Direct Object References (IDOR)
- **Defense:**
  - Project mutation (`PUT /api/projects/:id`): Asserts that the authenticated user is a verified member of the project's owning team. Non-members receive `HTTP 403 Forbidden`.
  - Project deletion / submission: Restricted to team leaders.
  - Score mutation (`POST /api/judge/scores`): Enforces that the authenticated judge is explicitly assigned to that project in `judge_assignments`.

### 5.5. Outbound Webhook Security
- **HMAC Signatures:** Every webhook dispatch includes `X-Judgement-Signature: sha256=<HMAC-SHA256>`, computed using the webhook's private secret over the canonical JSON payload.
- **Resource Exhaustion Defense:** Outbound HTTP calls via `fetch` wrap their execution in an `AbortController` with a 4000ms timeout (`src/server/services/webhook.js`), preventing slow external listener endpoints from hanging the server thread pool.
- **Audit Tracking:** Every dispatch attempt, timestamp, and HTTP response code is logged to `webhook_deliveries`.

### 5.6. Transactional Bulk Import Safety
- **Atomic Operations:** When importing event datasets (`POST /api/organizer/import.json`), the entire payload is executed within an atomic SQLite transaction (`BEGIN TRANSACTION` / `COMMIT`).
- **Failure Recovery:** Any validation error or foreign key inconsistency immediately triggers an automatic `ROLLBACK`, guaranteeing that malformed imports never leave the database in an inconsistent state.
- **Verification:** `tests/integration/t4_bulk.test.js` (Test #5: *"Bulk Import Validation: Malformed data without event details is rejected (HTTP 400)"*).

---

## 6. Cryptographic Trust Model (Ed25519)

### 6.1. Asymmetric Edwards-Curve Signatures
Unlike symmetric HMAC-SHA256 (where third-party verifiers must be given the shared secret, granting them the ability to forge valid signatures), DOGFOOD 2026 utilizes **Ed25519** (RFC 8032 / RFC 8410) asymmetric digital signatures.

1. **Private Authority Key:** Held exclusively in server memory or stored in a git-ignored directory (`.keys/`). Private keys are never committed or returned over APIs.
2. **Public SPKI Distribution:** The corresponding public key is published in standard SubjectPublicKeyInfo (SPKI) PEM format and raw 32-byte hex format via `GET /api/verify/public-key`.
3. **Deterministic Canonicalization:** Payloads are serialized using deterministic JSON stringification (`canonicalizeJson`) with sorted dictionary keys before hashing.
4. **Independent Offline Verification:** Any participant, judge, sponsor, or external auditor can verify submission certificates or judging records completely offline using standard OpenSSL CLI:
   ```bash
   # Offline verification via OpenSSL
   echo -n "$CANONICAL_PAYLOAD" | sha256sum | xxd -r -p > digest.bin
   openssl pkeyutl -verify -pubin -inkey pubkey.pem -rawin -in digest.bin -sigfile signature.bin
   ```

### 6.2. Cryptographic Guarantees & Honest Boundaries

- **What Ed25519 Signatures Prove:**
  1. **Payload Integrity:** The evaluation criteria, scores, and timestamp have not been altered by a single byte since signature issuance.
  2. **Issuer Non-Repudiation:** The signature was produced by the holder of the authority's private key.
  3. **Temporal Anchoring:** The recorded event occurred at or before the signed timestamp.
- **What Ed25519 Signatures Do NOT Prove:**
  1. Signatures do **NOT** prove the physical identity of the human behind the session.
  2. Signatures do **NOT** guarantee that a judge's subjective evaluation is truthful or accurate.
  3. Signatures only establish that the server authorized and sealed that specific evaluation payload.

---

## 7. Security Control Matrix

| # | Threat Scenario | Primary Control | Enforcement Layer | Test Proof Reference | Security Status | Residual Risk Summary |
|:---:|:---|:---|:---|:---|:---:|:---|
| **1** | Sybil Voting | Unique email constraint + authenticated session requirement | Database (`users`) & Middleware | `t3_voting.test.js` #4, `auth.test.js` | **MITIGATED** | Offline portal cannot verify human uniqueness without external KYC/OAuth. |
| **2** | Ballot Stuffing | Unique constraint `(event_id, voter_user_id)` | Database (`votes`) | `t3_voting.test.js` #5 | **PREVENTED** | None. Second vote rejected with 409 Conflict. |
| **3** | Duplicate Voting | SQLite single-writer lock + composite index | Database Engine | `t3_voting.test.js` #5 | **PREVENTED** | None. Concurrency serialized atomically. |
| **4** | Self-Voting | Team roster relational verification query | Controller (`voting.js`) | `t3_voting.test.js` #3 | **PREVENTED** | Prevented for all roster members. Unlinked alts not detected. |
| **5** | Vote Automation | Sliding-window velocity rate limiting | Memory Middleware | `rate_limit.test.js` (7 tests) | **MITIGATED** | Process-local memory store resets on server restart. |
| **6** | Participant Collusion | Blind voting window + PRNG Fisher-Yates ballot shuffle | Controller (`voting.js`) | `t3_voting.test.js` #2, #6, #7 | **MITIGATED** | Technical bias prevented. Out-of-band social agreements accepted. |
| **7** | Submission Scraping | SQL query projection filtering (`WHERE status = 'SUBMITTED'`) | SQL Data Layer | `t1-api.test.js` #1, #2, #4, #12 | **PREVENTED** | Drafts and credentials protected. Public gallery is public. |
| **8** | Judge Collusion / Bias | Assignment isolation + Peer barrier + Empirical Bayes Z-score | Judging & Normalization Engines | `t2-judging.test.js`, `normalization.test.js` | **MITIGATED** | Bias mathematically standardized. Massive cabals require audit review. |
| **9** | Deadline Gaming | Server-side UTC ISO 8601 timestamp comparison | Routing Controller (`projects.js`) | `t1-api.test.js` #5, `deadline.test.js` | **PREVENTED** | None. Client clocks have zero influence. |
| **10**| Unauthorized Score Access| Session derivation + Parameter probe barrier (`403`) | Security Middleware & Router | `t2-judging.test.js` #2, #3, #17, #18 | **PREVENTED** | None. Proven by automated suites and `run.py`. |

---

## 8. Practical Abuse Case & System Response Table

| Attacker Role | Malicious Objective | Action Attempted | Expected System Response | HTTP Status | Audit / Telemetry Event | Residual Risk |
|:---|:---|:---|:---|:---:|:---|:---|
| **Voter** | Cast multiple votes | Repeated `POST /api/voting/vote` | Rejects duplicate vote | `409 Conflict` | Constraint error logged | None (Prevented) |
| **Participant** | Vote for own project | `POST /api/voting/vote` with team project ID | Rejects self-vote | `403 Forbidden` | Rejection response | None for team roster |
| **Judge B** | Spy on Judge A's scores | `GET /api/judge/scores?judge=jdg_01` | Intercepts parameter probe | `403 Forbidden` | Barrier rejection | None (Hardened) |
| **Judge B** | Spy via alias | `GET /api/judge/scores?judge=judge_a` | Intercepts alias probe | `403 Forbidden` | Barrier rejection | None (Hardened) |
| **Participant** | Access judge scores | `GET /api/judge/scores` | RBAC guard blocks non-judge | `403 Forbidden` | RBAC failure | None (Prevented) |
| **Participant** | Export CSV results | `GET /api/export.csv` | RBAC guard blocks non-organizer | `403 Forbidden` | RBAC failure | None (Prevented) |
| **Adversary** | Unauthenticated score read | `GET /api/judge/scores` (no session) | Rejects unauthenticated request | `401 Unauthorized` | Auth failure | None (Prevented) |
| **Judge** | Score unassigned project | `POST /api/judge/scores` for unassigned ID | Blocks unassigned score | `403 Forbidden` | Assignment mismatch | None (Prevented) |
| **Judge** | Out-of-bounds score | `POST /api/judge/scores` with value 99.0 | Validates against rubric min/max | `400 Bad Request` | Validation failure | None (Prevented) |
| **Organizer** | Mutate active rubric | `PUT /api/organizer/rubric/criteria` after scores exist | Rejects mutation on locked rubric | `400 Bad Request` | Immutability lock | None (Prevented) |
| **Bot** | High-speed vote spam | Rapid repeated calls within 2000ms | Throttles submission velocity | `429 Too Many Requests`| Rate limiter active | Resets on restart |
| **Participant** | Post-deadline submission | `POST /projects/new` after `submissions_close` | Server UTC check rejects submission | `400 Bad Request` | Deadline rejection | None (Prevented) |
| **Participant** | Edit other team's code | `PUT /api/projects/:id` for peer team | Ownership check blocks non-member | `403 Forbidden` | Ownership violation | None (Prevented) |
| **Attacker** | CSV formula injection | Submit project title `=CMD|' /C calc'!A0` | Prepends `'` to trigger character | `200 OK` (Escaped) | Neutralized in CSV output | None (Prevented) |
| **Attacker** | Forged digital signature | `POST /api/verify` with altered payload | Cryptographic check fails | `200 OK` (`verified: false`) | Verification mismatch | None (Detected) |

---

## 9. Security Test Verification Mapping

The platform's security controls are comprehensively validated across **81 automated integration and unit tests** organized in 11 test suites:

### Suite 1: Milestone 1 — T1 Integration Tests (`tests/integration/t1-api.test.js`)
- `Public Anonymous Gallery returns 200 without auth`: Verifies public visibility of submitted projects.
- `Closed event strictly refuses submissions with HTTP 4xx`: Verifies server-side UTC deadline enforcement.
- `Participant cannot create an event (RBAC: 403 Forbidden)`: Verifies role separation.
- `Adversarial Ownership: Participant cannot edit another team’s project`: Verifies IDOR protection.

### Suite 2: Milestone 2 — T2 Judging & Security Tests (`tests/integration/t2-judging.test.js`)
- `Judge A can view their own scores (HTTP 200)`: Baseline authorized access.
- `Judge B is FORBIDDEN from viewing Judge A scores via ?judge=jdg_01 (HTTP 403)`: Verifies peer isolation.
- `Judge B is FORBIDDEN from viewing Judge A scores via ?judge=judge_a alias (HTTP 403)`: Verifies alias isolation.
- `Participant is BLOCKED from accessing judge scores (HTTP 403)`: Verifies role isolation.
- `Unauthenticated request to judge scores returns 401 Unauthorized`: Verifies session gating.
- `Participant is BLOCKED from exporting CSV (HTTP 403)`: Verifies export protection.
- `Judge cannot access project details for unassigned project (HTTP 403)`: Verifies assignment boundaries.
- `Judge cannot submit scores for unassigned project (HTTP 403)`: Verifies assignment write isolation.
- `Score out of rubric range is rejected with 400`: Verifies rubric range validation.
- `Locked rubric prevents silent mutation once scores exist (HTTP 400)`: Verifies immutability locking.
- `Parameter probe hardening: Alternate parameter names (?user_id, ?judge_user_id) are strictly blocked with 403`: Verifies parameter tampering defense.
- `Score detail ownership: Judge A can view own score, but Judge B is FORBIDDEN with 403`: Verifies individual score ownership.

### Suite 3: Milestone 3 — T3 Community Voting Tests (`tests/integration/t3_voting.test.js`)
- `Ballot returns randomized project ordering per voter`: Verifies PRNG positional bias neutralization.
- `Anti-Abuse: Self-voting is strictly forbidden (HTTP 403)`: Verifies team member self-vote prevention.
- `Anti-Abuse: Duplicate vote by same user in same event is rejected (HTTP 409 Conflict)`: Verifies single-vote enforcement.
- `Blind Voting Window: Active window seals results from participants`: Verifies herd behavior defense.
- `Organizer can view live unblinded voting results during active window`: Verifies administrative visibility.
- `Community Comments: Moderation flagging hides comment from public`: Verifies content moderation.

### Suite 4: T4 Cryptographic Verification Tests (`tests/integration/t4_ed25519_security.test.js`)
- `Public Key Distribution: GET /api/verify/public-key returns valid Ed25519 SPKI key`: Verifies asymmetric key distribution.
- `Genuine Offline Asymmetric Verification`: Verifies external independent verification.
- `Tamper Resistance: Payload alteration fails verification`: Verifies cryptographic tamper detection.
- `Rogue Keypair Attack: Signatures created with unauthorized keys are rejected`: Verifies key authority pinning.
- `Webhook Deliveries: Test ping execution and delivery audit log`: Verifies webhook execution and logging.

### Suite 5: Unit Security Tests
- `tests/unit/auth.test.js`: Validates session token extraction across cookies, bearer tokens, and headers.
- `tests/unit/deadline.test.js`: Validates UTC deadline edge cases and boundary conditions.
- `tests/unit/csv.test.js`: Validates RFC 4180 escaping and CWE-1236 formula injection neutralization.
- `tests/unit/rate_limit.test.js`: Validates sliding-window velocity throttling across production and test environments.
- `tests/unit/normalization.test.js`: Validates zero-variance resilience, single-review stability, and deterministic tie-breaking.
- `tests/unit/pairwise.test.js`: Validates Bradley-Terry MM solver convergence, 0.5 half-win tie splitting, virtual anchor prior regularization, and deterministic tie-breaking.
- `tests/unit/pairwise_persistence.test.js`: Validates relational schema integrity, canonical order constraints ($A < B$), winner integrity, and UNIQUE pair constraints.
- `tests/integration/pairwise_api.test.js`: Validates end-to-end judge and organizer pairwise workflows, peer-probing parameter neutralization (403), duplicate submission rejection (409), and circulant assignment scheduling.

---

## 10. Known Limitations & Honest Architectural Disclosures

To uphold rigorous security standards, the platform explicitly documents the following architectural boundaries and accepted residual risks:

1. **Absence of Cryptographic Human Identity Proofing:**
   - The platform strictly enforces "one authenticated account = one vote". However, in an offline, air-gapped Docker environment without external identity providers (OAuth, SMS OTP, Government ID, reCAPTCHA), the platform cannot cryptographically guarantee that one human does not control multiple accounts. This is an accepted engineering constraint for offline operability.
2. **Process-Local Velocity Limiting:**
   - The rate-limiting cache is held in process memory (`Map`). Restarting the Node.js server clears the in-memory window history. In a single-container hackathon deployment, this is an acceptable tradeoff against the operational overhead of running external Redis instances.
3. **Out-of-Band Social Collusion:**
   - Software controls successfully eliminate technical exploits (ballot stuffing, positional bias, live score herd mentality, peer judge snooping). However, off-platform human collusion (e.g., participants privately agreeing to vote for each other or judges meeting in private rooms to synchronize scores) remains a human threat that must be addressed via organizer audit oversight.
4. **Public Gallery Openness:**
   - Submitted projects, team names, summaries, repo links, and demo URLs are intentionally accessible without authentication. The gallery is designed to be an open public showcase. Confidentiality controls strictly protect drafts, email addresses, passwords, session tokens, and peer judge scores.
5. **Organizer Authority Trust Root:**
   - The platform assumes the hackathon organizer is a trusted administrator. Organizers have authority to configure events, invite judges, lock rubrics, run normalization, and inspect audit logs. Malicious actions by a compromised organizer account are recorded in `audit_logs` but are not prevented by software guards.

---

## 11. Security Operations & Event Monitoring Guide

Platform organizers should execute the following verification steps during hackathon operations:

### 11.1. Pre-Event Verification
- Verify that `submissions_close` is set to the exact UTC deadline.
- Confirm that rubric criteria weights and score boundaries are finalized before judging begins. Once the first score is submitted, the rubric locks permanently.
- Export and securely store the Ed25519 authority public key (`GET /api/verify/public-key`).

### 11.2. Active Event Monitoring
- **Inspect Audit Trail:** Periodically query `GET /api/organizer/audit` to review administrative actions, judge invitations, and batch assignments.
- **Monitor Judging Progress:** Use `GET /api/organizer/dashboard` to identify incomplete review batches or inactive judges before normalization.
- **Inspect Moderation Queue:** Monitor flagged comments on `GET /api/projects/:projectId/comments` and delete abusive content via `DELETE /api/comments/:id`.

### 11.3. Post-Event & Closing Operations
- Close the community voting window to unblind results (`POST /api/voting/windows`).
- Execute cross-judge normalization via `GET /api/organizer/normalized` and verify deterministic ranking output.
- Generate and download the signed JSON archive (`GET /api/organizer/export.json`) and RFC 4180 CSV results (`GET /api/export.csv`).
- Store the signed export bundle permanently as an immutable cryptographic record of the competition.
