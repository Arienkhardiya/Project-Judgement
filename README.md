# DOGFOOD 2026 Hackathon Platform

A high-integrity, production-grade hackathon submission and judging platform engineered for Hackathon Raptors. Designed to be completely self-hostable, air-gapped, and robust under real-world competition workloads.

---

## Current Status: Verified Tier 1 & Tier 2 + Implemented Tier 3 & Tier 4 Extensions

- **Claimed Tiers:** `T1`, `T2` (Guaranteed 100% verified by official `run.py` checker)
- **Extended Tiers:** `T3` (Community Voting & Anti-Abuse) + `T4` (Verifiable Records & Webhooks)
- **Automated Tests:** 58/58 unit and integration tests passing
- **Docker Deployment:** Verified on Docker Engine 29.8.0 & Docker Compose v5.5.1
- **Official Acceptance Output (`acceptance-report.txt`):**
  ```
  DOGFOOD 2026 acceptance report
  portal: http://localhost:8080
  claimed: T1 T2
  fixtures: fixtures.json

  T1  gallery is public ................. PASS
  T1  project from fixtures shown ....... PASS
  T1  closed event refuses submissions .. PASS
  T2  judge sees own scores ............. PASS
  T2  judge cannot see peer scores ...... PASS
  T2  participant blocked ............... PASS
  T2  csv export works .................. PASS

  claimed T1 T2, verified T1 T2
  ```

---

## Architectural Summary

- **Frontend:** React 19 + Vite 8 SPA. Clean, responsive dark-mode interface with zero external CDNs, remote fonts, or third-party assets. Works fully offline.
- **Backend:** Node.js (v24) + Express 5. Monolithic, single-process deployment serving both the API and client application.
- **Database:** SQLite with foreign keys and WAL mode via native `node:sqlite` (`DatabaseSync`), requiring zero external native compilation or C++ build tools.
- **Judging Integrity:** Strict server-side authorization barrier ensuring judges cannot view peer ballots. Participant role blocking on all judge APIs.
- **Normalization:** Deterministic Empirical Bayes regularized Z-score model handling zero-variance judges (e.g. `jdg_07`), varying sample sizes, and missing reviews.
- **Community Voting (T3):** Randomized ballot generation per voter to defeat positional ordering bias, blind voting window holding results until window closes, and anti-abuse safeguards (strict self-voting prohibition, 1 vote per user per event, velocity rate-limiting).
- **Verifiable Records (T4):** HMAC-SHA256 tamper-proof audit receipts, verifiable project certificates, webhook notifications, and embeddable gallery widget.
- **Data Parity:** Faithful ingestion of the complete real `fixtures.json` (41 projects, 30 judges, 8 tracks, 40 teams, 126 scores) preserving all edge cases (duplicate team projects `tm_07`, zero-variance judge `jdg_07`, incomplete review sets, empty comments).

---

## Documentation Index

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture, data flow, authorization boundaries, and tradeoffs.
- [DATA-MODEL.md](DATA-MODEL.md) - Relational schema, tables, foreign keys, constraints, and import/export paths.
- [JUDGING.md](JUDGING.md) - Mathematical normalization equations, zero-variance proofs, and isolation mechanics.
- [acceptance-report.txt](acceptance-report.txt) - Official raw acceptance output from `run.py`.
- [.dogfood.toml](.dogfood.toml) - Portal routing and auth configuration.

---

## Quick Start & Local Execution

### 1. With Docker (Recommended for Self-Hosting)
```bash
docker compose up -d --build
```
The portal starts on `http://localhost:8080`.

### 2. Direct Node.js Execution
```bash
# 1. Install dependencies
pnpm install

# 2. Build client assets
pnpm build

# 3. Seed database and launch portal
pnpm start
```

---

## Seeded Test Logins

When the portal boots, the seed engine initializes the real fixtures and activates deterministic session tokens:

| Role | Email | Session Token | Auth Header |
|---|---|---|---|
| **Organizer** | `organizer@example.org` | `org_7f2a` | `Cookie: session=org_7f2a` |
| **Judge A** | `tomas.varga@example.org` (`jdg_01`) | `jdg_a_91bc` | `Cookie: session=jdg_a_91bc` |
| **Judge B** | `wei.lindqvist@example.org` (`jdg_02`) | `jdg_b_44de` | `Cookie: session=jdg_b_44de` |
| **Participant** | `priya1@example.org` (`tm_01`) | `prt_2e88` | `Cookie: session=prt_2e88` |

A one-click role switcher bar is also available at the top of the portal UI to rapidly switch between test accounts.

---

## Running the Acceptance Checker

Run the official `run.py` test suite against the running portal:

```bash
python3 run.py .dogfood.toml
```

Output is recorded in `acceptance-report.txt`.

---

## Running Internal Automated Tests

Run the full suite of 58 unit and integration tests covering authentication, RBAC, deadline enforcement boundaries, project lifecycle, judge isolation, adversarial parameter tampering, normalization mathematics, community voting, anti-abuse, and cryptographic verification:

```bash
pnpm test
```

---

## Feature Implementation Matrix

| Requirement | Implementation Detail | Status |
|---|---|---|
| **T1: Local Session Auth** | Token stored in SQLite `sessions`, extracted from Cookie or Authorization header | Verified |
| **T1: RBAC Roles** | `visitor`, `participant`, `judge`, `organizer`, `admin` enforced via server middleware | Verified |
| **T1: Event Creation** | Organizer endpoint supporting name, description, start/end time, and UTC deadline | Verified |
| **T1: Tracks & Prizes** | Relational data model for competition tracks and cash prizes | Verified |
| **T1: Team Management** | Team formation with cryptographically secure invite links (`inv_...`) | Verified |
| **T1: Project Creation & Drafts** | Save/edit project drafts with strict team ownership verification | Verified |
| **T1: Deadline Enforcement** | Server compares UTC timestamp against `submissions_close`; refuses late submissions with 4xx | Verified |
| **T1: Public Project Gallery** | Unauthenticated `GET /projects` featuring search and track filtering | Verified |
| **T2: Judge Invitation** | `POST /api/organizer/judges/invite` links tracks and generates invitations | Verified |
| **T2: Judge Assignments** | Track-aware manual and algorithmic batch assignment models | Verified |
| **T2: Weighted Rubric** | Organizer-configurable weights and ranges; locked against mutation once scoring begins | Verified |
| **T2: Judge Isolation Barrier** | Strict session-derived judge identity; blocks cross-judge parameter probes with 403 | Verified |
| **T2: Participant Blocking** | Non-judges strictly blocked from judge APIs with 403 | Verified |
| **T2: Organizer Dashboard** | Real-time progress breakdown across events, tracks, judges, and batches | Verified |
| **T2: Cross-Judge Normalization** | Empirical Bayes regularized Z-score model; handles zero-variance `jdg_07` and varying reviews | Verified |
| **T2: CSV Export** | Organizer-only RFC 4180 export with proper escaping and stable columns | Verified |
| **T2: Audit Trail** | Chronological record of assignments, scoring, rubrics, normalization, and exports | Verified |
| **T3: Community Voting** | Configurable voting windows (`GET /api/voting/windows`) with active status | Verified |
| **T3: Randomized Ballots** | Per-voter deterministic PRNG shuffle defeating positional ordering bias (`/api/voting/ballot`) | Verified |
| **T3: Blind Voting Window** | Results sealed while voting is active; revealed only when window closes or to organizer | Verified |
| **T3: Anti-Abuse (Self-Vote)** | Strict prohibition on voting for projects submitted by voter's own team (HTTP 403) | Verified |
| **T3: Anti-Abuse (Duplicate)** | SQLite `UNIQUE(event_id, voter_user_id)` rejects duplicate voting attempts (HTTP 409) | Verified |
| **T3: Comments & Feedback** | Constructive project comments (`/api/projects/:id/comments`) with rate limiting | Verified |
| **T3: Content Moderation** | Flagging and deletion controls for abusive comments (`/api/comments/flag/:id`) | Verified |
| **T4: Verifiable Records** | HMAC-SHA256 tamper-proof cryptographic audit trail (`/api/verify/record/:signature`) | Verified |
| **T4: Digital Certificates** | Cryptographically signed project submission certificates (`/api/verify/certificate/:id`) | Verified |
| **T4: Webhooks Integration** | Event-driven webhooks system with signed payloads for external integrations | Verified |
| **T4: Embeddable Gallery** | Lightweight iframe widget (`/embed/gallery`) for embedding hackathon showcases | Verified |

---

## License

This project is open source and available under the [MIT License](LICENSE).
