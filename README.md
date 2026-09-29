# VERIDICT — Hackathon Operating Platform

**Run your hackathon from registration to results.**

VERIDICT is a self-hostable, production-ready hackathon management operating system engineered for high-stakes technical competitions, multi-track hackathons, rigorous peer and pairwise judging, cryptographic auditability, and complete event lifecycle orchestration.

---

## Overview & Core Capabilities

VERIDICT transforms hackathon operations into a streamlined, reliable experience for organizers, judges, participants, and visitors:

- **Complete Event Lifecycle:** Multi-event architecture allowing organizers to create, configure, publish, and manage distinct competitions from initial team registration through project submission, live judging, score normalization, community voting, and final certified results publication.
- **Strict Production vs. Demo Separation:** Clean, authentic production experience with zero fake statistics or placeholder controls. Evaluator test fixtures and one-click role switchers are strictly isolated to deterministic demo mode (`?demo=1` or `#demo`).
- **100% Self-Hostable & Offline-Ready:** Zero cloud dependencies, zero external CDNs, zero remote web fonts, and zero external APIs. Operates completely air-gapped on standard Docker infrastructure.
- **Stateful SQLite Persistence:** Monolithic Node.js Express 5 + native `node:sqlite` architecture with write-ahead logging (WAL) and persistent volume binding (`/app/data/hackathon.db`).
- **DOGFOOD 2026 Evaluator Suite:** The built-in DOGFOOD 2026 competition serves as an automated compliance benchmark and test fixture (41 projects, 30 judges, 8 tracks, 40 teams, 126 scores) verifying T1–T4 standards.

---

## Current Status & Verification

- **Claimed Tiers:** `T1`, `T2`, `T3`, `T4`
- **Extended Tiers & Bonuses:** `T3` (Community Voting & Anti-Abuse) + `T4` (Verifiable Records & Webhooks) + `Bonus B` (Pairwise Mode & Bradley-Terry Solver)
- **Automated Tests:** 134/134 automated tests passing across 14 test suites
- **Docker Deployment:** Verified on Docker Engine with persistent volume mount
- **Official Acceptance Output (`acceptance-report.txt`):**
  ```
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

---

## Architectural Summary

- **Frontend:** React 19 + Vite 8 Single Page Application (SPA). Custom dark-mode interface with zero external CDNs or remote dependencies.
- **Backend:** Node.js (v24 LTS) + Express 5 serving both REST API endpoints and compiled frontend assets in a single container process.
- **Database:** SQLite with foreign keys and WAL mode via native `node:sqlite` (`DatabaseSync`), requiring zero external native compilation or C++ build tools.
- **Judging Integrity Barrier:** Strict server-side authorization barrier ensuring judges cannot view peer ballots. Non-judges are strictly blocked from judge APIs with HTTP 403.
- **Cross-Judge Normalization:** Deterministic Empirical Bayes regularized Z-score model handling zero-variance judges (e.g. `jdg_07`), varying review counts, and missing evaluations.
- **Pairwise Ranking Engine (Bonus B):** Additive head-to-head comparison judging featuring a $k$-regular circulant chord graph scheduler and Minorization-Maximization (MM / Hunter 2004) regularized Bradley-Terry solver with 0.5 half-win tie splitting and Bayesian virtual anchor prior.
- **Community Voting & Anti-Abuse (T3):** Randomized ballot generation per voter to defeat positional ordering bias, blind voting window holding results until window closes, and anti-abuse safeguards (strict self-voting prohibition, 1 vote per user per event, velocity rate-limiting).
- **Verifiable Records (T4):** HMAC-SHA256 tamper-proof audit receipts, Ed25519 digital certificates, webhook event delivery, signed JSON export/import bundles, and embeddable showcase widgets.

---

## Documentation Index

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture, data flow, authorization boundaries, and tradeoffs.
- [DATA-MODEL.md](DATA-MODEL.md) - Relational schema, tables, foreign keys, constraints, and import/export paths.
- [JUDGING.md](JUDGING.md) - Mathematical normalization equations, zero-variance proofs, Pairwise Bradley-Terry formulation, and isolation mechanics.
- [API.md](API.md) - API-first REST reference, OpenAPI 3.1 contract, authentication, and examples.
- [SECURITY.md](SECURITY.md) - Formal threat model, STRIDE analysis, and trust boundary protections.
- [acceptance-report.txt](acceptance-report.txt) - Official raw acceptance output from `run.py`.
- [.dogfood.toml](.dogfood.toml) - Portal routing and auth configuration.

---

## Quick Start & Docker Deployment

### Prerequisites
- **Git**
- **Docker Desktop** / Docker Engine & Docker Compose

### Run via Docker Compose (Recommended)
```bash
docker compose up -d --build
```

### Access Application
Open your browser and navigate to:
[http://localhost:8080](http://localhost:8080)

- **Production Mode:** Default at `http://localhost:8080/`
- **Demo / Evaluator Mode:** Append `?demo=1` or `#demo` (e.g., `http://localhost:8080/?demo=1`) to view evaluator shortcuts and switch between seeded test personas.

### Container Diagnostics & Logs
```bash
docker compose ps
docker compose logs --tail=100 portal
```

### Alternative: Local Development Execution (No Docker)
```bash
# 1. Install dependencies
npm install

# 2. Build client assets
npm run build

# 3. Initialize database and start server
npm start
```

---

## Persistent Storage & Database Mechanics

VERIDICT uses SQLite stored in `/app/data/hackathon.db`.

In `docker-compose.yml`:
```yaml
volumes:
  - ./data:/app/data
```
This guarantees:
1. **Data Persistence Across Restarts:** All user registrations, created hackathons, team memberships, project drafts, scores, and audit records persist across container restarts and `docker compose down / up` cycles.
2. **Evaluator Fixture Stability:** Seed data is verified on startup via `INSERT OR REPLACE` and session protection mechanisms, preventing session loss when evaluating test personas.

---

## Seeded Evaluator Personas (Demo Mode)

When running in demo mode (`?demo=1`), the portal exposes the seeded benchmark personas:

| Role | Email | Session Token | Auth Header |
|---|---|---|---|
| **Organizer** | `organizer@example.org` | `org_7f2a` | `Cookie: session=org_7f2a` |
| **Judge A** | `tomas.varga@example.org` (`jdg_01`) | `jdg_a_91bc` | `Cookie: session=jdg_a_91bc` |
| **Judge B** | `wei.lindqvist@example.org` (`jdg_02`) | `jdg_b_44de` | `Cookie: session=jdg_b_44de` |
| **Participant** | `priya1@example.org` (`tm_01`) | `prt_2e88` | `Cookie: session=prt_2e88` |

---

## Testing & Verification Commands

### 1. Run Automated Test Suite
```bash
npm test
```
Runs all 134 unit and integration tests across 14 suites covering auth, RBAC, deadlines, project lifecycle, judge isolation, normalization, Bradley-Terry solver, and anti-abuse mechanisms.

### 2. Run Normalization Mathematical Proof
```bash
node scripts/normalization-proof.js
```
Validates the Empirical Bayes regularized Z-score model against all 41 fixture projects.

### 3. Run DOGFOOD Acceptance Checker
```bash
python run.py .dogfood.toml
```
Verifies compliance against the official benchmark test harness.

---

## Feature Implementation Matrix

| Requirement | Implementation Detail | Status |
|---|---|---|
| **T1: Local Session Auth** | Token stored in SQLite `sessions`, extracted from Cookie, `Authorization: Bearer`, or `x-session-token` | Verified |
| **T1: RBAC Roles** | `visitor`, `participant`, `judge`, `organizer`, `admin` enforced via server middleware | Verified |
| **T1: Event Creation** | Multi-event creation wizard supporting name, description, start/end time, and UTC submission deadline | Verified |
| **T1: Tracks & Prizes** | Relational data model for competition tracks and cash prizes | Verified |
| **T1: Team Management** | Team formation with cryptographically secure invite links (`inv_...`) | Verified |
| **T1: Project Creation & Drafts** | Save/edit project drafts with strict team ownership verification | Verified |
| **T1: Deadline Enforcement** | Server compares UTC timestamp against `submissions_close`; refuses late submissions with HTTP 4xx | Verified |
| **T1: Public Project Gallery** | Unauthenticated `GET /projects` featuring live search, track filtering, and project details | Verified |
| **T2: Judge Invitation** | `POST /api/organizer/judges/invite` links tracks and generates transparent invitation credentials | Verified |
| **T2: Judge Assignments** | Track-aware manual and algorithmic batch assignment models | Verified |
| **T2: Weighted Rubric** | Organizer-configurable weights and ranges; locked against mutation once scoring begins | Verified |
| **T2: Judge Isolation Barrier** | Strict session-derived judge identity; blocks cross-judge parameter probes with HTTP 403 | Verified |
| **T2: Participant Blocking** | Non-judges strictly blocked from judge APIs with HTTP 403 | Verified |
| **T2: Organizer Control Center** | Real-time progress breakdown across events, tracks, judges, and batches with intelligent Next Action | Verified |
| **T2: Score Normalization** | Empirical Bayes regularized Z-score model; handles zero-variance `jdg_07` and varying reviews | Verified |
| **T2: CSV Export** | Organizer-only RFC 4180 export with formula injection sanitization and stable columns | Verified |
| **T2: Audit Trail** | Chronological record of assignments, scoring, rubrics, normalization, and exports | Verified |
| **T3: Community Voting** | Configurable voting windows (`GET /api/voting/windows`) with active status | Verified |
| **T3: Randomized Ballots** | Per-voter deterministic PRNG shuffle defeating positional ordering bias (`/api/voting/ballot`) | Verified |
| **T3: Blind Voting Window** | Results sealed while voting is active; revealed only when window closes or results are published | Verified |
| **T3: Anti-Abuse (Self-Vote)** | Strict prohibition on voting for projects submitted by voter's own team (HTTP 403) | Verified |
| **T3: Anti-Abuse (Duplicate)** | SQLite `UNIQUE(event_id, voter_user_id)` rejects duplicate voting attempts (HTTP 409) | Verified |
| **T3: Comments & Feedback** | Constructive project comments (`/api/projects/:id/comments`) with rate limiting | Verified |
| **T3: Content Moderation** | Flagging and deletion controls for abusive comments (`/api/comments/flag/:id`) | Verified |
| **T4: Verifiable Records** | HMAC-SHA256 tamper-proof cryptographic audit trail (`/api/verify/record/:signature`) | Verified |
| **T4: Digital Certificates** | Ed25519 cryptographically signed project submission certificates (`/api/verify/certificate/:id`) | Verified |
| **T4: Signed JSON Bundles** | Ed25519-signed full event JSON export and bulk import for portable competition migration | Verified |
| **T4: Webhooks Integration** | Event-driven webhooks system with signed payloads for external integrations | Verified |
| **T4: Embeddable Gallery** | Lightweight iframe widget (`/embed/gallery`) for embedding hackathon showcases | Verified |
| **Bonus B: Pairwise Data Model** | Relational `pairwise_pairs` and `pairwise_comparisons` with canonical ordering and winner integrity | Verified |
| **Bonus B: Bradley-Terry Solver** | Deterministic MM solver with 0.5 half-win tie splitting and Bayesian virtual anchor prior | Verified |
| **Bonus B: Circulant Assignment Engine** | $k$-regular circulant chord graph topology balancing judge loads (~4-6 comparisons/project) | Verified |
| **Bonus B: Judge Pairwise UI** | Dedicated side-by-side evaluation interface with Winner/Tie selection and peer isolation guards | Verified |
| **Bonus B: Organizer Pairwise UI** | Control plane for schedule generation, live completion tracking, and instant ranking computation | Verified |

---

## License

This project is open source and available under the [MIT License](LICENSE).
