# VERIDICT — Hackathon Operating System

VERIDICT is a self-hostable, production-ready hackathon operating platform that supports event creation, registration, team formation, project submissions, multi-track judging, community voting, score normalization, results publication, and end-to-end competition operations.

Built with an offline-first architecture, zero external runtime dependencies, and strict server-side authorization barriers, VERIDICT enables organizers to manage technical competitions of any scale—from local university hackathons to global multi-track benchmarks—entirely on standard self-hosted container infrastructure.

---

## Live Demo

Hosted Deployment:
**[https://verdict-production-5a56.up.railway.app](https://verdict-production-5a56.up.railway.app)**

*The live environment runs the exact containerized production build with persistent SQLite storage and the complete event lifecycle.*

---

## Why VERIDICT

Running a real-world hackathon requires coordinating multiple high-friction operational workflows:

* **Event Lifecycle Management:** Transitioning an event across distinct phases—registration, team formation, hacking, submission deadline, peer evaluation, community voting, and results reveal.
* **Participant & Team Coordination:** Managing participant onboarding, team formation via cryptographically unique invite codes, and project draft ownership.
* **Deadline Enforcement:** Ensuring project submission cutoffs are rigorously enforced at the server level against UTC clocks rather than reliant on cosmetic client-side UI disabling.
* **Judge Workload & Integrity:** Distributing hundreds of project reviews across specialized tracks, maintaining strict privacy barriers so judges cannot inspect peer evaluations, and eliminating reviewer bias.
* **Review Normalization:** Correcting for statistically lenient or harsh judges and uneven review counts so project rankings reflect intrinsic merit rather than reviewer luck.
* **Community Engagement:** Providing public galleries, constructive comments, and fraud-resistant community choice voting with randomized ballots and anti-abuse controls.
* **Independent Auditing:** Producing verifiable cryptographic receipts, tamper-evident audit trails, and signed completion certificates for every evaluated project.
* **True Self-Hosting:** Running entirely air-gapped on standard infrastructure with zero external SaaS dependencies, remote CDNs, or vendor lock-in.

VERIDICT unifies these capabilities into a single, cohesive, self-contained system.

---

## Core Capabilities

VERIDICT is built strictly around verified, working backend functionality and modern responsive interfaces:

* **Organizer Onboarding & Authentication:** Secure organizer and participant account registration, login, and session management backed by SQLite session persistence and SHA-256 password hashing.
* **Role-Aware Access Control (RBAC):** Five distinct authorization tiers (`visitor`, `participant`, `judge`, `organizer`, `admin`) enforced strictly via server middleware across all API routes.
* **Multi-Event Management:** Create and configure distinct hackathon events with custom slugs, descriptions, tracks, cash prizes, and UTC submission deadlines.
* **Event Lifecycle States:** Native state progression (`DRAFT` → `ACTIVE` → `JUDGING` → `CLOSED` → `ARCHIVED`) dictating submission acceptance, judging windows, and public visibility.
* **Public Event & Gallery Pages:** Unauthenticated public galleries with instantaneous client-side search, track filtering, and project detail modals.
* **Teams & Membership:** Create teams, generate secure invitation codes (`inv_...`), manage member rosters, and enforce team-based project ownership.
* **Project Creation & Editing:** Teams can create, preview, edit, and update project submissions with rich media links (demo video, repository, live preview) until the submission deadline.
* **Server-Side Deadline Enforcement:** Strict comparison against UTC `submissions_close` timestamps; late submission attempts are rejected with `HTTP 400 Bad Request`.
* **Judge Invitations & Credentials:** Organizers issue unique track-linked judge invitation links (`/invite/judge/:token`) allowing external evaluators to claim credentials and access assigned projects.
* **Rubric Configuration & Immutability:** Organizer-configurable criteria, positive weights ($w_c > 0$), and score ranges ($[1.0, 5.0]$). Rubrics permanently lock (`is_locked = 1`) upon ingestion of the first evaluation to guarantee evaluation consistency.
* **Strict Judge Role Isolation:** Complete backend isolation preventing judges from querying or viewing peer scores (`HTTP 403 Forbidden` on peer inspection parameters). Participants are strictly barred from judge endpoints.
* **Organizer Control Center:** Live real-time dashboard displaying evaluation completion percentages, track coverage, missing reviews, and actionable workflow guidance.
* **Cross-Judge Score Normalization:** Deterministic Empirical Bayes regularized Z-score model correcting for judge severity, zero-variance reviewers (`jdg_07`), and uneven review counts ($K_p \in [2, 5]$).
* **Pairwise Comparison Mode (Bonus B):** Additive head-to-head judging option featuring a $k$-regular circulant chord graph scheduler and Minorization-Maximization (MM / Hunter 2004) regularized Bradley-Terry solver with 0.5 half-win tie handling and a Bayesian virtual anchor prior.
* **Community Voting & Anti-Abuse (T3):** Public voting with randomized ballots per voter to eliminate positional ordering bias, blind voting window holding results until closed, self-voting prevention, single-vote uniqueness constraints, and velocity rate limiting.
* **Comment System & Moderation:** Constructive threaded comments on project submissions with submission velocity cooldowns and community flagging controls.
* **Certified Exports:** Organizer-only RFC 4180 CSV export with formula injection sanitization (neutralizing `=`, `+`, `-`, `@`, `\t`) and Ed25519-signed JSON competition bundles for full portability.
* **Verifiable Audit Records (T4):** HMAC-SHA256 audit receipts for score submissions and Ed25519 cryptographically signed project certificates verifiable offline or via public verification endpoints (`/api/verify/*`).
* **Embeddable Gallery Widget (T4):** Standalone embeddable gallery iframe (`/embed/gallery`) with customizable theme and track filtering for external sponsor and showcase sites.
* **Event-Driven Webhooks (T4):** Automated webhook dispatch with HMAC-SHA256 signature verification for downstream integration on submission, judging completion, and voting closure events.

---

## How a Hackathon Runs on VERIDICT

```
+---------------------------------------------------------------------------------------------------+
|                                      EVENT LIFECYCLE WORKFLOW                                     |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  1. ORGANIZER SETUP                                                                               |
|     * Register organizer account                                                                  |
|     * Create event with name, slug, UTC deadline, tracks, and prize tiers                         |
|     * Configure weighted judging rubric (e.g. Functionality, Innovation, Quality)                 |
|     * Publish event to ACTIVE status                                                              |
|                                                                                                   |
|  2. PARTICIPATION & SUBMISSION                                                                    |
|     * Participants register or sign in                                                            |
|     * Form or join teams via shareable invite codes                                               |
|     * Draft and refine project submissions (repo URL, demo video, description)                   |
|     * Submit project before the UTC deadline                                                      |
|     * Server closes submissions automatically at deadline boundary                                |
|                                                                                                   |
|  3. JUDGE ONBOARDING & ASSIGNMENT                                                                 |
|     * Organizer invites judges via track-linked invite tokens                                     |
|     * Dispatch assignments (manual allocation or algorithmic track-balanced distribution)         |
|     * Optional: Generate balanced pairwise comparison schedule (circulant chord graph)            |
|                                                                                                   |
|  4. EVALUATION & DELIBERATION                                                                     |
|     * Judges evaluate assigned projects via weighted rubric or side-by-side Pairwise UI           |
|     * Server enforces strict peer isolation (judges see only their own ballots)                   |
|     * Rubric locks permanently upon first submitted evaluation                                    |
|     * Organizer monitors real-time completion progress across tracks and judges                   |
|                                                                                                   |
|  5. COMMUNITY VOTING (OPTIONAL)                                                                   |
|     * Organizer opens voting window                                                               |
|     * Voters receive randomized ballots; blind window hides intermediate tallies                  |
|     * Anti-abuse rules prevent duplicate votes and self-voting for own team                       |
|                                                                                                   |
|  6. NORMALIZATION & RESULTS                                                                       |
|     * Organizer calculates regularized score normalization (Empirical Bayes Z-scores)             |
|     * Optional: Solve Bradley-Terry rankings from pairwise comparison outcomes                    |
|     * Publish final results and official track leaderboards                                       |
|     * Issue cryptographic Ed25519 completion certificates and export sanitized CSV                |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

---

## Roles & Access Control

Access control is strictly enforced on the server via Express middleware (`src/server/middleware/auth.js`) inspecting session tokens extracted from Cookies, `Authorization: Bearer`, or custom headers.

| Capability | Visitor | Participant | Judge | Organizer | Admin |
|:---|:---:|:---:|:---:|:---:|:---:|
| Browse Public Gallery & Projects | Yes | Yes | Yes | Yes | Yes |
| View Public Event Details & Tracks | Yes | Yes | Yes | Yes | Yes |
| Verify Certificates & Audit Receipts (`/api/verify/*`) | Yes | Yes | Yes | Yes | Yes |
| Create / Join Teams | No | Yes | No | Yes | Yes |
| Create / Edit Team Project Drafts | No | Yes | No | Yes | Yes |
| Submit Project (Before UTC Deadline) | No | Yes | No | Yes | Yes |
| Cast Community Choice Vote | No | Yes | Yes | Yes | Yes |
| Post Project Comments | No | Yes | Yes | Yes | Yes |
| Access Assigned Projects & Scoring Rubric | No | No | Yes | Yes | Yes |
| Submit Rubric Scores & Feedback | No | No | Yes | Yes | Yes |
| Perform Side-by-Side Pairwise Reviews | No | No | Yes | Yes | Yes |
| Inspect Peer Judge Ballots | **Blocked** | **Blocked** | **Blocked** | Yes | Yes |
| Create Events & Configure Rubrics | No | No | No | Yes | Yes |
| Invite Judges & Manage Assignments | No | No | No | Yes | Yes |
| Generate Pairwise Schedules & Run Solver | No | No | No | Yes | Yes |
| Calculate Normalized Leaderboard | No | No | No | Yes | Yes |
| Publish Results & Final Standings | No | No | No | Yes | Yes |
| Export Sanitized CSV & Signed JSON | No | No | No | Yes | Yes |
| Configure Webhooks & View Delivery Logs | No | No | No | Yes | Yes |

### Backend Judge Isolation Barrier
In accordance with the T2 evaluation specification, judge isolation is enforced at the route handler level:
* A judge requesting `GET /api/judge/scores` receives only their own evaluations.
* Any request containing peer inspection parameters (e.g. `?judge=...` or `?judge_id=...`) sent by an account with role `judge` is immediately rejected with `HTTP 403 Forbidden`.
* Non-judges (such as participants or visitors) attempting to access judge endpoints are rejected with `HTTP 403 Forbidden`.

---

## Judging Engine

VERIDICT includes two distinct, mathematically sound evaluation workflows:

### 1. Multi-Criterion Rubric Judging (Default T2)
* **Configurable Rubric:** Organizers define criteria with custom weights ($w_c > 0$) and score bounds ($[1.0, 5.0]$).
* **Immutability Lock:** When the first score is recorded in an event, the active rubric is automatically marked `is_locked = 1`. Any subsequent attempt to modify criteria weights or score ranges is rejected (`HTTP 400`), guaranteeing an identical evaluation baseline across all projects.
* **Track-Aware Assignments:** Judges are mapped to specific competition tracks. Algorithmic balancing (`POST /api/organizer/assignments/auto`) distributes projects evenly across qualified judges.
* **Empirical Bayes Score Normalization:**
  Raw evaluation averages fail in real hackathons due to judge severity variance, zero-variance scoring, and varying review counts ($K_p \in [2, 5]$). VERIDICT eliminates these distortions via a two-stage regularized model:
  1. *Judge Variance Regularization:* Samples are regularized toward the global population variance $\sigma^2_{\text{global}}$ with prior pseudocount $m = 2.0$:
     $$\sigma_{j,\text{reg}} = \sqrt{\frac{N_j \cdot s_j^2 + m \cdot \sigma^2_{\text{global}}}{N_j + m}}$$
     *This mathematically guarantees $\sigma_{j,\text{reg}} > 0$, eliminating division-by-zero crashes for zero-variance judges (such as `jdg_07`) and single-review judges.*
  2. *Standardized Z-Score Projection:*
     $$Z_{j,p} = \frac{R_{j,p} - \mu_j}{\sigma_{j,\text{reg}}}, \quad S_{j,p} = \text{clamp}\left(\mu_{\text{global}} + Z_{j,p} \cdot \sigma_{\text{global}}, \, S_{\text{min}}, \, S_{\text{max}}\right)$$
  3. *Bayesian Shrinkage Mean:* Corrects for uneven reviewer coverage using prior weight $k_0 = 1.0$:
     $$\text{FinalScore}_p = \frac{\sum_{j=1}^{K_p} S_{j,p} + k_0 \cdot \mu_{\text{global}}}{K_p + k_0}$$
  4. *Deterministic Sorting:* Ranked strictly by `final_score` DESC $\to$ `raw_avg_score` DESC $\to$ `project_id` ASC.

### 2. Pairwise Comparison Mode (Bonus B)
For events preferring head-to-head qualitative evaluation over numerical rubrics, VERIDICT provides an independent, additive Pairwise Comparison Mode:

* **$k$-Regular Circulant Graph Schedule:** Avoids the $O(K^2)$ all-pairs bottleneck by generating balanced chord graph topologies targeting $k \approx 4-6$ comparisons per project.
* **Canonical Pair Ordering:** Pairs are strictly stored with `project_a_id < project_b_id` in SQLite, preventing order-dependent duplicate assignments.
* **Duplicate & Collision Prevention:** Enforced at the schema level via `UNIQUE(judge_user_id, project_a_id, project_b_id)`.
* **Outcomes Supported:** Judges choose **Project A Wins**, **Project B Wins**, or **Tie / Equally Strong**. Schema-level CHECK constraints verify the winner is an assigned pair member.
* **0.5 Half-Win Tie Approximation:** Each tie contributes $0.5$ effective wins to both projects ($W_i = \text{Wins}_i + 0.5 \cdot \text{Ties}_i$), providing computational tractability without requiring multi-parameter threshold models.
* **Bayesian Virtual Anchor Prior:** Classical maximum likelihood Bradley-Terry diverges on undefeated or winless projects ($\lambda \to \pm \infty$) and cannot reconcile disconnected graph components. VERIDICT applies an anchor prior with weight $\alpha = 1.0$ against reference strength $\pi_0 = 1.0$:
  $$\pi_i^{(t+1)} = \frac{W_i + \alpha}{\sum_{j \ne i} \frac{n_{ij}}{\pi_i^{(t)} + \pi_j^{(t)}} + \frac{2\alpha}{\pi_i^{(t)} + 1.0}}$$
* **Hunter's Minorization-Maximization (MM) Solver:** Synchronous iterative solver converging when $\max_i |\pi_i^{(t+1)} - \pi_i^{(t)}| < 10^{-6}$ (capped at 100 iterations) with numerical guards ($10^{-12}$ minimum denominator).
* **Deterministic Output:** Ranks sorted by latent rating $\lambda_i = \ln \pi_i$ DESC $\to$ total comparisons DESC $\to$ `project_id` ASC.

*Detailed mathematical formulations and edge-case proofs are documented in [JUDGING.md](file:///E:/Project-Judgement/JUDGING.md).*

---

## DOGFOOD Tier Coverage

The DOGFOOD 2026 specification establishes four evaluation tiers and four optional bonus challenges. The table below outlines how each requirement is implemented and verified in VERIDICT:

| Tier | Specification Requirement | VERIDICT Implementation | Verification Method |
|:---|:---|:---|:---|
| **T1 Core** | Unauthenticated public project gallery | Unauthenticated `GET /projects` and `GET /api/projects` with real-time text search and track filtering. | Official checker PASS; unit & integration tests |
| **T1 Core** | Show projects from test fixtures | All 41 benchmark fixture projects loaded, rendered, and inspectable with complete metadata. | Official checker PASS; fixture integrity tests |
| **T1 Core** | Refuse submissions after event deadline | Server evaluates UTC timestamp against `submissions_close`; rejects late submissions with `HTTP 400`. | Official checker PASS; deadline unit tests |
| **T1 Core** | Local session authentication & roles | In-memory/SQLite sessions supporting Cookies, Bearer tokens, and custom headers across 5 roles. | Integration test suite (163 tests) |
| **T1 Core** | Team management & project drafts | Create teams, share invite tokens (`inv_...`), edit drafts, and bind submissions to team ownership. | Automated lifecycle integration tests |
| **T2 Judging** | Judge reads own scores | `GET /api/judge/scores` returns authenticated judge's submitted rubric evaluations. | Official checker PASS; auth middleware tests |
| **T2 Judging** | **Judge cannot read peer scores** | Strict server-side barrier rejects cross-judge queries (`?judge=...`) with `HTTP 403 Forbidden`. | Official checker PASS; security tests |
| **T2 Judging** | Participant blocked from judge APIs | Role middleware blocks non-judges from accessing judge routes with `HTTP 403 Forbidden`. | Official checker PASS; RBAC integration tests |
| **T2 Judging** | Organizer CSV export | Organizer-only RFC 4180 CSV export with formula injection sanitization (`=`, `+`, `-`, `@`, `\t`). | Official checker PASS; CSV unit tests |
| **T2 Judging** | Weighted rubric configuration | Organizer-configurable criteria and weights; automatically locked on first submitted review. | Rubric locking integration tests |
| **T2 Judging** | Score normalization | Empirical Bayes regularized Z-score model handling zero-variance reviewers and sample disparity. | Mathematical proof script (`41/41` PASS) |
| **T3 Public** | Community choice voting | Blind voting window holding tally visibility until closure; configurable voting windows. | T3 integration test suite |
| **T3 Public** | Randomized voter ballots | Deterministic PRNG shuffle per voter to eliminate positional ordering bias. | Ballot randomization tests |
| **T3 Public** | Anti-abuse safeguards | Self-voting blocked (`HTTP 403`); 1 vote per user per event (`UNIQUE` index, `HTTP 409`); rate limiting. | Anti-abuse integration tests |
| **T3 Public** | Comments & moderation | Project commentary with submission velocity limits and community flagging endpoints. | Comment service & route tests |
| **T4 Stretch** | REST API & Documentation | Full REST API documented in OpenAPI 3.1.0 format ([`openapi.json`](file:///E:/Project-Judgement/openapi.json)) and [`API.md`](file:///E:/Project-Judgement/API.md). | Contract inspection & route coverage |
| **T4 Stretch** | Cryptographic audit receipts | HMAC-SHA256 tamper-evident receipts generated on score ingestion (`/api/verify/record/:sig`). | T4 cryptographic integration tests |
| **T4 Stretch** | Digital project certificates | Ed25519 asymmetric signed submission certificates verifiable offline via OpenSSL or online. | Ed25519 signature tests |
| **T4 Stretch** | Event-driven webhooks | Outgoing webhook dispatch with HMAC-SHA256 signatures and permanent delivery audit logging. | Webhook delivery & RBAC tests |
| **T4 Stretch** | Embeddable showcase gallery | Lightweight, responsive standalone iframe widget (`/embed/gallery`) for external sites. | Embed route integration tests |
| **T4 Stretch** | Bulk export / import | Ed25519-signed full event JSON export and atomic bulk import with schema validation. | Bulk import/export tests |

### About the Official DOGFOOD Acceptance Checker
The official benchmark script (`python run.py .dogfood.toml`) tests **7 critical black-box acceptance criteria** across T1 and T2:
1. Public gallery is unauthenticated (`200 OK`)
2. Fixture project title is visible in public gallery
3. Closed event rejects submissions (`4xx`)
4. Judge can view their own submitted scores
5. **Judge cannot view peer scores (`401` or `403` on query probe)**
6. Participant is blocked from judge endpoints (`401` or `403`)
7. Organizer can export valid CSV

The acceptance checker verifies these 7 fundamental T1/T2 requirements. Extended capabilities in **T3** (Community Voting & Anti-Abuse) and **T4** (Verifiable Records, Certificates, Webhooks, Embeds) are independently covered and verified by the automated Node.js test suite (`npm test`, 163 tests across 16 suites).

---

## Bonus Capabilities

VERIDICT implements all four optional technical challenges specified in the DOGFOOD benchmark:

1. **Pairwise Judging Mode (Bonus B):** Additive head-to-head comparison engine with $k$-regular circulant chord scheduling, canonical ordering, half-win tie splitting, and Minorization-Maximization regularized Bradley-Terry solver.
2. **Normalization Mathematical Proof (Bonus A):** Executable proof script ([`scripts/normalization-proof.js`](file:///E:/Project-Judgement/scripts/normalization-proof.js)) running against the canonical 41-project, 30-judge, 126-score fixture dataset, demonstrating deterministic bias correction and zero-variance stability.
3. **Formal Threat Model (Bonus C):** Comprehensive STRIDE security analysis, trust boundary mapping, and mitigation matrix documented in [`SECURITY.md`](file:///E:/Project-Judgement/SECURITY.md).
4. **API-First Architecture (Bonus D):** Comprehensive REST interface with complete OpenAPI 3.1.0 specification ([`openapi.json`](file:///E:/Project-Judgement/openapi.json)) and exhaustive endpoint documentation in [`API.md`](file:///E:/Project-Judgement/API.md).

---

## Architecture

VERIDICT is engineered as a monolithic, self-contained system with zero external runtime infrastructure:

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT CONTAINER                                  |
|                                                                                   |
|  React 19 + Vite 8 SPA                                                            |
|  * Responsive Dark-Mode Design System (Pure CSS, 0 external font/CDN assets)      |
|  * Portals: Landing, Gallery, Participant, Judge, Organizer, Pairwise, Voting      |
|  * Direct fallback verification prompts for unconfigured email environments       |
+------------------------------------------+----------------------------------------+
                                           | HTTP / REST (Port 8080)
+------------------------------------------v----------------------------------------+
|                                 SERVER CONTAINER                                  |
|                                                                                   |
|  Node.js (v22/v24 LTS) + Express 5                                                |
|  * Static asset serving & SPA fallback                                            |
|  * Session Middleware (Cookie, Bearer, x-session-token)                           |
|  * Role-Based Access Control (RBAC) & Peer Isolation Guards                       |
|  * Services: Normalization, Pairwise, Verification, CSV, Webhooks, Email          |
+------------------------------------------+----------------------------------------+
                                           | Direct Driver (In-Process)
+------------------------------------------v----------------------------------------+
|                                STORAGE PERSISTENCE                                |
|                                                                                   |
|  Native SQLite (`node:sqlite` / `DatabaseSync`)                                   |
|  * Location: `/app/data/hackathon.db` (Persistent Docker Volume)                  |
|  * Write-Ahead Logging (WAL mode) & Enforced Foreign Key Constraints              |
|  * Zero C++ native compilation / Zero external database servers                   |
+-----------------------------------------------------------------------------------+
```

* **Frontend:** React 19 single-page application built with Vite 8. Dark-mode theme using local CSS variables without external font dependencies or CDNs, ensuring full air-gapped operation.
* **Backend:** Express 5 running on Node.js 22 LTS serving compiled assets and REST endpoints in a single unified process.
* **Database:** Native `node:sqlite` (`DatabaseSync`) with Write-Ahead Logging (`PRAGMA journal_mode = WAL`) and foreign key constraints enabled. No native binary dependencies (`better-sqlite3` or Python build tools) required.
* **Authentication:** Stateful token sessions stored in SQLite `sessions`, supporting cookies, `Authorization: Bearer`, and `x-session-token`.
* **Cryptographic Keys:** Ed25519 keypair for digital certificates and HMAC-SHA256 for audit receipts generated and stored securely in `.keys/`.
* **Container Runtime:** Multi-stage Docker build targeting `node:22-alpine` with an unprivileged runtime user and built-in container health check.

---

## Self-Hosting

### Requirements
* **Docker Engine** (v20.10+) & **Docker Compose** (v2.0+) OR
* **Node.js** (v22.0.0+ LTS recommended) & **pnpm** (or npm)

### Quick Start (Docker Compose)
The recommended deployment method runs the complete seeded portal in a persistent container:

```bash
# Clone the repository
git clone https://github.com/Arienkhardiya/VERDICT.git
cd VERDICT

# Launch the containerized application
docker compose up -d --build
```

Access the application in your browser:
* **Production Portal:** [http://localhost:8080](http://localhost:8080)
* **Evaluator / Demo Mode:** Append `?demo=1` (e.g. [http://localhost:8080/?demo=1](http://localhost:8080/?demo=1)) to display the evaluator toolbar and switch between seeded test personas.

### Container Diagnostics
```bash
# Check container status and health
docker compose ps

# View real-time container application logs
docker compose logs -f portal
```

### Data Persistence
VERIDICT stores its SQLite database at `/app/data/hackathon.db`.

In `docker-compose.yml`, this directory is bound to the named Docker volume `dogfood-data`:
```yaml
volumes:
  - dogfood-data:/app/data
```
All user registrations, created events, project submissions, submitted scores, and audit records persist permanently across container restarts, image upgrades, and `docker compose down / up` cycles.

### Environment Configuration
Copy `.env.example` to configure runtime options:

```bash
cp .env.example .env
```

| Variable | Default | Purpose |
|:---|:---|:---|
| `PORT` | `8080` | Server HTTP port |
| `NODE_ENV` | `production` | Node environment (`production` or `development`) |
| `DATABASE_PATH` | `/app/data/hackathon.db` | Filepath for persistent SQLite database |
| `RESEND_API_KEY` | *(unset)* | API key for Resend HTTPS transactional email transport |
| `EMAIL_FROM` | `VERIDICT <onboarding@resend.dev>` | From address for outgoing transactional emails |
| `VOTING_RATE_LIMIT_MS`| `2000` | Cooldown period between community vote attempts |
| `COMMENT_COOLDOWN_MS` | `3000` | Cooldown period between project comment submissions |

---

## Email Configuration & Transport Truthfulness

VERIDICT implements a modular transactional email service (`src/server/services/email.js`) supporting account verification, password resets, and judge invitation delivery:

* **Production Transport (Resend HTTPS API):** When `RESEND_API_KEY` is set in the environment, the server dispatches emails via `POST https://api.resend.com/emails` over outbound **port 443 (HTTPS)**. This eliminates socket timeouts on hosting platforms (such as Railway or restricted cloud networks) that block outbound SMTP ports (25, 465, 587).
* **Development / Local Fallback (SMTP):** If `RESEND_API_KEY` is not configured, the service falls back to standard SMTP if `SMTP_HOST` is provided.
* **Offline / Unconfigured Mode:** If neither provider is configured, the server operates in offline mode. Calls to send email return `success: false` with reason `EMAIL_NOT_CONFIGURED`.
* **Important Delivery Scope Limitation:** Under Resend's free evaluation tier using the default `onboarding@resend.dev` sender, emails can only be delivered to the registered email address of the Resend account owner. **Delivering to arbitrary external participants requires configuring and verifying a custom domain in Resend and setting `EMAIL_FROM`.**
* **Direct Verification Fallback:** To ensure unconfigured or restricted email environments never block user onboarding, VERIDICT's registration UI and API responses provide direct on-screen verification links. Users can activate accounts immediately without relying on an external mail provider.

---

## Seeded Benchmark Personas (Demo Mode)

For automated evaluators, judges, and local development, the database initializes four deterministic test personas matching the DOGFOOD benchmark specification:

| Role | Email | Session Token | Auth Header |
|:---|:---|:---|:---|
| **Organizer** | `organizer@example.org` | `org_7f2a` | `Cookie: session=org_7f2a` |
| **Judge Alpha** | `tomas.varga@example.org` (`jdg_01`) | `jdg_a_91bc` | `Cookie: session=jdg_a_91bc` |
| **Judge Beta** | `wei.lindqvist@example.org` (`jdg_02`) | `jdg_b_44de` | `Cookie: session=jdg_b_44de` |
| **Participant** | `priya1@example.org` (`tm_01`) | `prt_2e88` | `Cookie: session=prt_2e88` |

*In demo mode (`?demo=1`), the top navigation bar provides one-click switching between these seeded accounts.*

---

## Verification & Tests

All functionality in VERIDICT is validated by automated verification suites:

### 1. Automated Test Suite
```bash
npm test
```
* **Result:** **163 / 163 PASS** across **16 test suites** in ~7.5 seconds.
* Covers authentication, session extraction, RBAC boundaries, deadline enforcement, project lifecycle, judge role isolation, normalization mathematics, Bradley-Terry solver, anti-abuse velocity controls, and email service mocks.

### 2. Production Client Build
```bash
npm run build
```
* **Result:** **PASS**. Compiles React 19 frontend into production distribution (`dist/`) via Vite 8 in ~120ms with zero errors.

### 3. Official DOGFOOD Acceptance Checker
```bash
python run.py .dogfood.toml
```
* **Result:** **PASS**. Validates the running portal against the 7 official benchmark requirements:
```text
DOGFOOD 2026 acceptance report
portal: http://localhost:8080
claimed: T1 T2 T3 T4
fixtures: fixtures.json

T1  gallery is public ................. PASS
T1  project from fixtures shown ....... PASS
T1  closed event refuses submissions .. PASS
T2  judge sees own scores ............. PASS
T2  judge cannot see peer scores ...... PASS
T2  participant blocked ............... PASS
T2  csv export works .................. PASS

claimed T1 T2 T3 T4, verified T1 T2
note: claimed but not verified: T3 T4
```

### 4. Normalization Proof Script
```bash
node scripts/normalization-proof.js
```
* **Result:** **41 / 41 PASS**. Ingests the 41 projects, 30 judges, and 126 evaluations from `fixtures.json`, executes the Empirical Bayes regularized Z-score model, audits zero-variance judge `jdg_07` ($\sigma_{j,\text{reg}} = 0.4099 > 0$), and verifies deterministic rankings.

---

## Security & Integrity

* **Server-Side Authorization:** Every mutation and data access is guarded by backend middleware (`requireAuth`, `requireRole`, `requireJudge`, `requireOrganizer`). Hiding UI buttons is never treated as security.
* **Judge Peer Isolation Barrier:** Enforced server-side. Requests attempting to inspect peer scores receive `HTTP 403 Forbidden`.
* **Submission Deadline Guard:** Submissions and project edits verify the UTC timestamp against `submissions_close`. Late submissions are rejected (`HTTP 400`).
* **CSV Formula Injection Sanitization:** Exported CSV cells starting with formula triggers (`=`, `+`, `-`, `@`, `\t`) are prepended with an apostrophe to neutralize spreadsheet formula injection vulnerabilities (CWE-1236).
* **Anti-Abuse Voting Safeguards:** Voting endpoints enforce `UNIQUE(event_id, voter_user_id)`, prohibit self-voting for own-team projects (`HTTP 403`), and enforce IP/account velocity windows.
* **Safe Diagnostics:** Diagnostic endpoints (`/api/organizer/email-diagnostics`) mask API keys (`re_secr...`) and strictly omit raw credentials.
* **Cryptographic Signatures:** Audit records use HMAC-SHA256; completion certificates use asymmetric Ed25519 signing.

---

## API Reference Summary

The complete REST API is specified in OpenAPI 3.1.0 format in [`openapi.json`](file:///E:/Project-Judgement/openapi.json) and detailed in [`API.md`](file:///E:/Project-Judgement/API.md).

Representative endpoint groups:

| Area | Method | Endpoint | Description |
|:---|:---|:---|:---|
| **Health** | `GET` | `/api/health` | Service health check |
| **Auth** | `POST` | `/api/auth/register` | Register new account |
| **Auth** | `POST` | `/api/auth/login` | Authenticate and obtain session |
| **Auth** | `POST` | `/api/auth/logout` | Terminate session |
| **Auth** | `GET` | `/api/auth/me` | Current authenticated user profile |
| **Auth** | `POST` | `/api/auth/verify-email` | Verify account via token |
| **Events** | `GET` | `/api/events` | List visible hackathons |
| **Events** | `POST` | `/api/events` | Create new hackathon (Organizer) |
| **Events** | `GET` | `/api/events/:slug` | Event details, tracks, and prizes |
| **Teams** | `POST` | `/api/teams` | Create a new team |
| **Teams** | `POST` | `/api/teams/join` | Join team via invite code |
| **Projects** | `GET` | `/api/projects` | Search and list projects (Public) |
| **Projects** | `POST` | `/api/projects` | Submit project before deadline |
| **Projects** | `GET` | `/api/projects/:id` | Detailed project view |
| **Judging** | `GET` | `/api/judge/assignments` | List assigned projects for judge |
| **Judging** | `GET` | `/api/judge/scores` | Judge reads own scores |
| **Judging** | `POST` | `/api/judge/scores` | Submit rubric evaluation |
| **Pairwise** | `GET` | `/api/judge/pairwise/pairs` | List assigned comparison pairs |
| **Pairwise** | `POST` | `/api/judge/pairwise/compare` | Submit comparison outcome |
| **Organizer** | `GET` | `/api/organizer/dashboard` | Real-time judging progress metrics |
| **Organizer** | `POST` | `/api/organizer/assignments/auto` | Algorithmic track-balanced assignment |
| **Organizer** | `GET` | `/api/organizer/normalized` | Calculate normalized scores |
| **Organizer** | `POST` | `/api/organizer/pairwise/schedule` | Generate circulant pairwise schedule |
| **Organizer** | `GET` | `/api/organizer/pairwise/solve` | Execute Bradley-Terry solver |
| **Organizer** | `GET` | `/api/export.csv` | Export sanitized results CSV |
| **Voting** | `GET` | `/api/voting/ballot` | Retrieve randomized voter ballot |
| **Voting** | `POST` | `/api/voting/vote` | Cast community choice vote |
| **Comments** | `POST` | `/api/projects/:id/comments` | Post constructive comment |
| **Verify** | `GET` | `/api/verify/public-key` | Retrieve Ed25519 SPKI public key |
| **Verify** | `POST` | `/api/verify` | Verify cryptographic audit receipt |
| **Webhooks** | `GET` | `/api/webhooks` | List registered webhooks |
| **Webhooks** | `POST` | `/api/webhooks` | Register new webhook endpoint |

---

## Project Structure

```text
.
├── .dogfood.toml                  # Official DOGFOOD checker route and auth configuration
├── .env.example                   # Environment configuration template
├── acceptance-report.txt          # Committed raw acceptance receipt from run.py
├── API.md                         # Detailed REST API specification and contract guide
├── ARCHITECTURE.md                # System architecture, data flow, and trade-offs
├── DATA-MODEL.md                  # Relational database schema, foreign keys, and constraints
├── docker-compose.yml             # Production container definition with persistent volume
├── Dockerfile                     # Multi-stage production container build (Node 22 Alpine)
├── fixtures.json                  # Canonical 41-project benchmark dataset
├── JUDGING.md                     # Normalization equations, Bradley-Terry solver, and proofs
├── LICENSE                        # MIT Open Source License
├── openapi.json                   # Machine-readable OpenAPI 3.1.0 specification
├── package.json                   # Project metadata and test scripts
├── run.py                         # Official benchmark acceptance suite
├── SECURITY.md                    # Formal threat model, STRIDE analysis, and mitigations
├── vite.config.js                 # Vite bundler configuration
│
├── scripts/
│   └── normalization-proof.js     # Mathematical normalization proof across 41 projects
│
├── src/
│   ├── client/                    # React 19 Frontend SPA
│   │   ├── main.jsx               # Client application entry point
│   │   ├── App.jsx                # Router, state management, and navigation
│   │   ├── styles.css             # Local design system and responsive styles
│   │   └── components/            # Portals (Organizer, Judge, Participant, Gallery, Pairwise)
│   │
│   └── server/                    # Node.js Express 5 Backend
│       ├── index.js               # Application bootstrap and server entry
│       ├── app.js                 # Express application setup and route registration
│       ├── db/                    # Native SQLite database setup, migrations, and seed logic
│       ├── middleware/            # Session authentication and RBAC guards
│       ├── routes/                # Modular REST route handlers
│       └── services/              # Normalization, Pairwise, Email, CSV, Webhooks, Verification
│
└── tests/                         # Automated Test Suite (163 tests across 16 suites)
    ├── unit/                      # Unit tests (normalization, pairwise, email, csv, deadline)
    └── integration/               # Integration tests (lifecycle, RBAC, voting, webhooks, T1-T4)
```

---

## Development

```bash
# 1. Install dependencies
pnpm install # or npm install

# 2. Run client in development mode with HMR
npm run dev

# 3. Build frontend bundle for production
npm run build

# 4. Start production server locally
npm start

# 5. Run all automated tests (163 tests)
npm test

# 6. Run official DOGFOOD acceptance checker
python run.py .dogfood.toml

# 7. Run mathematical normalization proof
node scripts/normalization-proof.js
```

---

## Context & Origins

VERIDICT was engineered for the **DOGFOOD 2026** competition—a technical challenge tasked with designing and deploying a robust, self-hostable submission and judging platform for hackathons.

While DOGFOOD provided the benchmark criteria, awkward test fixtures, and verification harness, VERIDICT is built as a complete, real-world operating platform designed to serve hackathons well beyond the benchmark.

---

## License

VERIDICT is open-source software licensed under the [MIT License](LICENSE).
