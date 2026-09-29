# JUDGING.md

## DOGFOOD 2026 Judging Engine, Normalization Mathematics & Cryptographic Verification

This document specifies the judging assignment architecture, weighted rubric mechanics, cross-judge normalization equations, mathematical proofs for edge cases, judge privacy protections, and asymmetric Ed25519 cryptographic verification.

---

## 1. Judging Workload & Assignment Architecture

### Assignment Strategy
1. **Track-Aware Restrictions:** Judges are designated to specific tracks (e.g. `trk_03` Accessibility). The assignment engine verifies that a project's track matches one of the judge's authorized tracks (`judge_tracks`). Organizers can selectively override this constraint if cross-track evaluation is desired.
2. **Batch Abstraction:** Assignments support an optional `batch_id` attribute (e.g. `batch_1`, `semifinals`). This enables organizers to assign, monitor, and normalize judging in discrete cohorts.
3. **Manual & Algorithmic Coexistence:**
   - Manual assignments can be created via `POST /api/organizer/assignments`.
   - Algorithmic balancing can be dispatched via `POST /api/organizer/assignments/auto`, distributing projects evenly across available judges within each track.

---

## 2. Weighted Rubric & Immutability Guarantee

### Rubric Configuration
An organizer can define criteria with custom weights and score boundaries:
- `criterion_key`: Unique identifier (e.g. `functionality`, `quality`, `innovation`).
- `weight`: Relative positive multiplier $w_c > 0$.
- `min_score` and `max_score`: Valid range (e.g. $1.0 \le v \le 5.0$).

### Immutability Rule
Once a single score has been recorded against a rubric, the rubric transitions to `is_locked = 1`. Any subsequent attempt by an organizer to mutate criterion weights, names, or score ranges on the active rubric is rejected by the server with `HTTP 400 Bad Request`. This guarantees that all projects in an event are evaluated against an unchanging standard.

---

## 3. Mathematical Normalization Methodology & Defensible Proofs

Hackathons suffer from four major statistical distortions:
1. **Inter-Judge Tendency Variance:** Some judges are systematically harsh (e.g. `jdg_14` with sample mean $\mu_j \approx 3.0$), while others are systematically generous (e.g. `jdg_02` with $\mu_j \approx 4.22$).
2. **Reviewer Coverage Disparity (Incomplete Batches):** Real-world hackathons have uneven reviewer coverage. In the official fixture dataset, projects receive between 2 and 5 reviews ($K_p \in [2, 5]$). A naive average would allow a project with 2 lucky scores to outrank a project with 5 thorough, high reviews.
3. **Zero-Variance Judges:** Judges who assign the exact same score across all assigned projects (e.g. `jdg_07` awarded 4 across every criterion for all 3 reviews, producing sample variance $s_j^2 = 0$). In naive Z-score models, dividing by $s_j = 0$ results in $0/0 = \text{NaN}$ or crash.
4. **Unusually Narrow or Wide Judges:** A judge who reviews only 1 project ($N_j = 1$) has $s_j = 0$. A judge who assigns tightly clustered scores (e.g. 4.0, 4.1, 4.0) has an artificially tiny $s_j$, which would cause a naive Z-score $(R - \mu)/s_j$ to blow up to $\pm 15$, dominating the leaderboard.

Our platform eliminates these distortions using **Empirical Bayes Regularized Z-Score Normalization with Shrinkage Aggregation**.

### Stage 1: Raw Weighted Score
For an evaluation by judge $j$ on project $p$ across criteria $c \in C$:
$$R_{j,p} = \frac{\sum_{c \in C} w_c \cdot v_{j,p,c}}{\sum_{c \in C} w_c}$$
Since $v_{j,p,c} \in [\min_c, \max_c]$ and $w_c > 0$, $R_{j,p} \in [\min_c, \max_c]$ (standard scale $[1.0, 5.0]$).

### Stage 2: Global Population Statistics
Across all completed evaluations $M$ in the event:
$$\mu_{\text{global}} = \frac{1}{M} \sum_{i=1}^M R_i$$
$$\sigma^2_{\text{global}} = \frac{1}{M} \sum_{i=1}^M (R_i - \mu_{\text{global}})^2$$
*(In the 41-project, 126-score fixture dataset, $\mu_{\text{global}} \approx 3.5608$ and $\sigma_{\text{global}} \approx 0.6481$).*

### Stage 3: Judge Tendencies & Empirical Bayes Variance Regularization
For judge $j$ with $N_j$ total evaluations:
$$\mu_j = \frac{1}{N_j} \sum_{k=1}^{N_j} R_{j,k}$$
$$s_j^2 = \frac{1}{N_j} \sum_{k=1}^{N_j} (R_{j,k} - \mu_j)^2$$

To prevent division by zero and eliminate small-sample noise, we regularize the judge's sample variance toward the global prior variance $\sigma^2_{\text{global}}$ with a prior weight of $m = 2.0$ pseudocounts:
$$\sigma_{j,\text{reg}} = \sqrt{\frac{N_j \cdot s_j^2 + m \cdot \sigma^2_{\text{global}}}{N_j + m}}$$

#### Proof 1: Zero-Variance Judge (`jdg_07`)
- In `fixtures.json`, `jdg_07` evaluated 3 projects (`prj_03`, `prj_11`, `prj_38`), giving identical ratings of 4.0 to all.
- $N_j = 3$, $\mu_j = 4.0$, and sample variance $s_j^2 = 0.0$.
- Under Empirical Bayes regularization ($m = 2.0$):
  $$\sigma_{j,\text{reg}} = \sqrt{\frac{3 \cdot 0 + 2 \cdot (0.6481)^2}{3 + 2}} = \sqrt{0.4} \cdot 0.6481 \approx 0.4099 > 0$$
- Result: Division by zero is completely impossible ($\sigma_{j,\text{reg}} > 0$).
- Standardized evaluation:
  $$Z_{j,p} = \frac{4.0 - 4.0}{0.4099} = 0.0$$
- Scaled score:
  $$S_{j,p} = \mu_{\text{global}} + 0.0 \cdot \sigma_{\text{global}} = \mu_{\text{global}} \approx 3.5608$$
- Interpretation: A judge who gives everyone a 4.0 provides no discriminatory signal; their reviews are correctly treated as neutral relative to the field.

#### Proof 2: Single-Review Judges (`jdg_01`, `jdg_23`)
- A judge who has submitted only $N_j = 1$ evaluation has $s_j^2 = 0$ by definition.
- Under Empirical Bayes:
  $$\sigma_{j,\text{reg}} = \sqrt{\frac{1 \cdot 0 + 2 \cdot \sigma^2_{\text{global}}}{1 + 2}} = \sqrt{\frac{2}{3}} \cdot \sigma_{\text{global}} \approx 0.5292 > 0$$
- Result: Perfectly stable, strictly positive variance with zero division errors.

#### Proof 3: Narrow vs. Wide Scoring Judges
- **Narrow Judge ($s_j \approx 0.05$):** Naive Z-score would divide by 0.05, multiplying score differences by 20x. With Empirical Bayes regularization ($N_j = 3, m = 2$), the denominator is smoothed to $\sqrt{(3(0.0025) + 2(0.42))/5} \approx 0.41$, preventing artificial blowout.
- **Wide Judge ($s_j \approx 1.2$):** As $N_j$ grows, $\frac{N_j}{N_j + m} \to 1$, allowing the judge's true spread to be accurately reflected without distortion.

### Stage 4: Standardized Z-Score & Rescaling to Global Scale
Each evaluation is normalized against the judge's calibrated distribution:
$$Z_{j,p} = \frac{R_{j,p} - \mu_j}{\sigma_{j,\text{reg}}}$$
The Z-score is then projected back onto the global scale $[S_{\text{min}}, S_{\text{max}}]$ ($[1.0, 5.0]$):
$$S_{j,p} = \text{clamp}\left(\mu_{\text{global}} + Z_{j,p} \cdot \sigma_{\text{global}}, \, S_{\text{min}}, \, S_{\text{max}}\right)$$

### Stage 5: Project Aggregation with Bayesian Shrinkage Mean
In real hackathons, incomplete batches cause variable review counts $K_p \in [2, 5]$. A project with only 2 reviews cannot be treated identically to a project with 5 reviews.
We apply Bayesian shrinkage toward the event prior mean $\mu_{\text{global}}$ with a prior review weight of $k_0 = 1.0$:
$$\text{FinalScore}_p = \frac{\sum_{j=1}^{K_p} S_{j,p} + k_0 \cdot \mu_{\text{global}}}{K_p + k_0}$$

#### Proof 4: Incomplete Batches & Review Count Balancing
- **Case A (High score, 2 reviews):** Suppose a project receives two normalized scores of 4.8 ($K_p = 2$).
  $$\text{FinalScore} = \frac{4.8 + 4.8 + 1.0(3.5608)}{2 + 1} = \frac{13.1608}{3} \approx 4.3869$$
- **Case B (High score, 5 reviews):** Suppose another project receives five normalized scores of 4.8 ($K_p = 5$).
  $$\text{FinalScore} = \frac{5(4.8) + 1.0(3.5608)}{5 + 1} = \frac{27.5608}{6} \approx 4.5935$$
- Result: Both projects performed excellently, but the project with 5 consistent high scores rightfully outranks the project with only 2 reviews due to greater statistical confidence.
- **Case C (Unreviewed project, $K_p = 0$):**
  $$\text{FinalScore} = \frac{0 + 1.0(\mu_{\text{global}})}{0 + 1} = \mu_{\text{global}}$$
  An unreviewed project receives the neutral prior mean without arbitrary penalties or unfair rewards.

### Stage 6: Deterministic Ordering
Projects are sorted strictly deterministically:
1. `final_score` DESC
2. `raw_avg_score` DESC
3. `project_id` ASC (tiebreaker)
This guarantees 100% reproducible rankings across every platform execution.

---

## 4. Fixture Data Normalization Proof

This section provides the complete, mathematically grounded proof demonstrating the normalization engine operating across the canonical `fixtures.json` dataset (**41 projects, 30 judges, 126 evaluations**).

### 4.1. Core Concepts & Definitions

1. **Raw Ranking (`Rank Before`):**
   - The project's position sorted strictly by its raw unadjusted evaluation average:
     $$\text{RawScore}_p = \frac{1}{K_p} \sum_{j=1}^{K_p} R_{j,p}$$
   - When raw averages tie, projects are ordered deterministically by `project_id` ascending.
2. **Normalized Ranking (`Rank After`):**
   - The project's position sorted by its regularized Bayesian shrinkage final score:
     $$\text{FinalScore}_p = \frac{\sum_{j=1}^{K_p} S_{j,p} + k_0 \cdot \mu_{\text{global}}}{K_p + k_0}$$
   - Followed by `raw_avg_score` descending and `project_id` ascending as deterministic tiebreakers.
3. **Rank Delta Convention:**
   - $\text{Delta} = \text{Rank Before} - \text{Rank After}$
   - **Positive ($>0$):** Project moved **upward** (closer to 1st place) after compensating for harsh reviewers or recognizing consistent high marks across larger sample sizes.
   - **Negative ($<0$):** Project moved **downward** after correcting for overly lenient judges or discounting small, noisy sample sizes.
   - **Zero ($0$):** Project ranking remained identical.

### 4.2. Mathematical Correction of Real-World Distortions

- **Judge Severity Correction:**
  In the fixture set, judge means vary significantly (e.g., `jdg_14` mean $\approx 3.0$ vs. `jdg_02` mean $\approx 4.22$). Unadjusted scores artificially penalize projects evaluated by harsh judges and unfairly reward projects reviewed by lenient judges. By centering evaluations around judge-specific means ($Z_{j,p} = (R_{j,p} - \mu_j) / \sigma_{j,\text{reg}}$), the engine isolates intrinsic project merit from judge personality.
- **Incomplete Batches & Sample-Size Shrinkage:**
  Projects receive between $2$ and $5$ reviews ($K_p \in [2, 5]$). A naive average would let a project with only 2 lucky scores outrank a project with 5 thorough evaluations. Applying Bayesian shrinkage toward $\mu_{\text{global}}$ with prior weight $k_0 = 1.0$ appropriately pulls small-sample scores toward the population mean until verified by additional reviewers.
- **Zero-Variance Resilience (`jdg_07`):**
  Judge `jdg_07` assigned $4.0$ to all 3 evaluated projects ($s_j^2 = 0$). Empirical Bayes variance regularization ($m = 2.0$) guarantees $\sigma_{j,\text{reg}} = 0.4099 > 0$, eliminating division-by-zero crashes while neutrally weighting zero-information evaluations ($Z = 0.0$).
- **Single-Review Resilience (`jdg_01`, `jdg_23`):**
  Judges with only 1 evaluation ($N_j = 1$) have sample variance $s_j = 0$ by definition. The prior regularization smoothly establishes $\sigma_{j,\text{reg}} \approx 0.5292 > 0$ with zero NaN artifacts.
- **Deterministic Tie-Breaking:**
  All evaluations and rankings are deterministic: `final_score` DESC $\to$ `raw_avg_score` DESC $\to$ `project_id` ASC. Multi-run executions produce 100% identical rankings.

### 4.3. Fixture Summary Statistics

- **Total Evaluated Projects:** 41
- **Total Ingested Judges:** 30
- **Total Evaluations:** 126
- **Global Score Mean ($\mu_{\text{global}}$):** 3.5661
- **Global Score StdDev ($\sigma_{\text{global}}$):** 0.6483
- **Review Count Range:** 2 to 5 reviews per project
- **Single-Review Judges:** `jdg_01`, `jdg_23` (2 judges; regularized variance strictly $>0$)
- **Zero-Variance Judges:** `jdg_07` (1 judge; regularized variance strictly $>0$)
- **Projects Changing Rank:** 40 / 41 projects (97.6%)
- **Largest Upward Move:** `prj_07` ("Dry Harbour"): **+22 positions** (Rank 31 $\to$ Rank 9, Raw 3.3333 $\to$ Normalized 3.6909; rewarded for consistent performance across 5 reviews evaluated by tough judges).
- **Largest Downward Move:** `prj_19` ("Small Relay"): **-15 positions** (Rank 14 $\to$ Rank 29, Raw 3.6667 $\to$ Normalized 3.4766; discounted due to lenient reviewers and low review count $K_p = 2$).
- **Top Project Before Normalization:** `prj_11` ("Salt Ledger", Raw Score 4.3333)
- **Top Project After Normalization:** `prj_34` ("Iron Switch", Final Score 4.1515)

### 4.4. Complete 41-Project Normalization Proof Table

| Rank Before | Rank After | Delta | Project ID | Project Title | Track | Reviews | Raw Score | Normalized Score |
|---|---|---|---|---|---|---|---|---|
| 2 | 1 | +1 | prj_34 | Iron Switch | Open hardware | 3 | 4.3333 | 4.1515 |
| 7 | 2 | +5 | prj_33 | Slow Trail | Developer tools | 3 | 4.0000 | 3.9939 |
| 1 | 3 | -2 | prj_11 | Salt Ledger | Data and analytics | 4 | 4.3333 | 3.9839 |
| 5 | 4 | +1 | prj_37 | Salt Loom | Education | 4 | 4.0833 | 3.9683 |
| 6 | 5 | +1 | prj_16 | Salt Kiln | Security | 3 | 4.0000 | 3.8689 |
| 4 | 6 | -2 | prj_25 | Dry Relay | Data and analytics | 3 | 4.1111 | 3.8560 |
| 3 | 7 | -4 | prj_10 | Still Beacon | Open hardware | 2 | 4.1667 | 3.8186 |
| 9 | 8 | +1 | prj_41 | Dry Harbour | Accessibility | 4 | 3.8333 | 3.7840 |
| 31 | 9 | +22 | prj_07 | Dry Harbour | Accessibility | 5 | 3.3333 | 3.6909 |
| 10 | 10 | 0 | prj_08 | North Drift | Security | 5 | 3.8000 | 3.6730 |
| 8 | 11 | -3 | prj_21 | Copper Kiln | Data and analytics | 3 | 3.8889 | 3.6659 |
| 11 | 12 | -1 | prj_04 | Green Switch | Education | 3 | 3.7778 | 3.6564 |
| 17 | 13 | +4 | prj_09 | Hollow Signal | Health | 3 | 3.5556 | 3.6359 |
| 21 | 14 | +7 | prj_24 | Glass Beacon | Accessibility | 2 | 3.5000 | 3.6297 |
| 19 | 15 | +4 | prj_31 | Salt Ferry | Developer tools | 3 | 3.5556 | 3.6166 |
| 15 | 16 | -1 | prj_36 | Salt Drift | Open hardware | 3 | 3.6667 | 3.6124 |
| 13 | 17 | -4 | prj_15 | Copper Orbit | Security | 2 | 3.6667 | 3.6122 |
| 25 | 18 | +7 | prj_12 | Open Beacon | Education | 3 | 3.4444 | 3.6089 |
| 18 | 19 | -1 | prj_17 | Small Loom | Health | 3 | 3.5556 | 3.6038 |
| 12 | 20 | -8 | prj_38 | Deep Beacon | Data and analytics | 3 | 3.7778 | 3.5949 |
| 24 | 21 | +3 | prj_01 | Glass Signal | Security | 3 | 3.4444 | 3.5752 |
| 20 | 22 | -2 | prj_18 | Open Kiln | Education | 2 | 3.5000 | 3.5683 |
| 26 | 23 | +3 | prj_27 | Flat Thread | Open hardware | 3 | 3.4444 | 3.5582 |
| 29 | 24 | +5 | prj_14 | Green Lantern | Education | 5 | 3.4000 | 3.5290 |
| 33 | 25 | +8 | prj_29 | Flat Relay | Developer tools | 2 | 3.3333 | 3.5273 |
| 16 | 26 | -10 | prj_02 | Small Meadow | Accessibility | 3 | 3.5556 | 3.5244 |
| 22 | 27 | -5 | prj_39 | Paper Anchor | Accessibility | 2 | 3.5000 | 3.5184 |
| 23 | 28 | -5 | prj_35 | Warm Beacon | Climate | 5 | 3.4667 | 3.4925 |
| 14 | 29 | -15 | prj_19 | Small Relay | Health | 2 | 3.6667 | 3.4766 |
| 28 | 30 | -2 | prj_32 | Loud Ledger | Developer tools | 3 | 3.4444 | 3.4685 |
| 30 | 31 | -1 | prj_03 | Deep Compass | Accessibility | 3 | 3.3333 | 3.4094 |
| 38 | 32 | +6 | prj_30 | Paper Harbour | Education | 3 | 3.1111 | 3.3853 |
| 32 | 33 | -1 | prj_13 | Quiet Anchor | Climate | 3 | 3.3333 | 3.3839 |
| 35 | 34 | +1 | prj_26 | Amber Hours | Climate | 3 | 3.2222 | 3.3672 |
| 37 | 35 | +2 | prj_22 | Dry Bridge | Security | 3 | 3.1111 | 3.3002 |
| 34 | 36 | -2 | prj_20 | Paper Thread | Open hardware | 3 | 3.2222 | 3.2638 |
| 36 | 37 | -1 | prj_06 | Dry Compass | Developer tools | 3 | 3.1111 | 3.2004 |
| 39 | 38 | +1 | prj_40 | Slow Loom | Developer tools | 2 | 3.0000 | 3.1561 |
| 27 | 39 | -12 | prj_28 | Flat Meadow | Data and analytics | 3 | 3.4444 | 3.1541 |
| 41 | 40 | +1 | prj_23 | Slow Quarry | Open hardware | 3 | 2.8889 | 3.0404 |
| 40 | 41 | -1 | prj_05 | North Compass | Data and analytics | 3 | 2.8889 | 2.9118 |

### 4.5. Reproducibility & Independent Verification

The full proof is verified deterministically on any machine using:

```bash
node scripts/normalization-proof.js
```

The script executes directly against `fixtures.json` using the production normalization engine (`src/server/services/normalization.js`), performs programmatic assertion checks on row counts, uniqueness, and non-NaN scores, and exits with return code `0` on success.

---

## 5. Judge Isolation & Security Architecture

1. **Strict Session Identity:** All judge endpoints derive the user identity solely from the server-validated session cookie (`sessions.user_id`).
2. **Peer Score Isolation Barrier:**
   - A judge calling `/api/judge/scores?judge=judge_a` or `/api/judge/scores?judge=jdg_01` is checked against `req.user.id`.
   - If the requested target does not match the authenticated session, the server immediately emits `HTTP 403 Forbidden`.
3. **Queue Isolation:** A judge attempting to request `/api/judge/assignments/:projectId` or submit scores for a project not assigned to them is rejected with `HTTP 403 Forbidden`.
4. **Participant Blocking:** Participants attempting to query `/api/judge/*` are rejected with `HTTP 403 Forbidden`.
5. **Peer Score Anonymity:** At no point do judge endpoints return scores or comments authored by peer judges.
6. **CSV Formula Injection Sanitization:** Exported CSV text fields starting with `=, +, -, @, \t, \r` are prefixed with `'` to prevent remote spreadsheet code execution (CWE-1236).

---

## 6. Asymmetric Cryptographic Verification Architecture (T4)

### Shift to Asymmetric Ed25519 Cryptography
Symmetric HMAC-SHA256 requires distributing a shared secret to verifying parties. If an external auditor or third-party verifier holds the secret, they possess the ability to forge valid signatures, destroying the integrity of the audit trail.

DOGFOOD 2026 utilizes **Ed25519 (RFC 8032 / RFC 8410)** Edwards-curve digital signatures:
1. **Private Key (Server-Only):** The server holds an Ed25519 private key in memory or in a git-ignored directory (`.keys/`). Private keys are never committed to version control.
2. **Public Key (Global Distribution):** The platform distributes the corresponding Ed25519 public key in SPKI format via `GET /api/verify/public-key`.
3. **Deterministic Canonicalization:** Payloads are serialized using deterministic JSON stringification (`canonicalizeJson`) with sorted dictionary keys before hashing.
4. **Independent Offline Verification:** Any participant, judge, sponsor, or external third party can verify a certificate or audit receipt completely offline using standard tools (Node.js `crypto`, Python `cryptography`, or OpenSSL CLI):
   ```bash
   # Offline verification via OpenSSL
   echo -n "$DIGEST" > digest.txt
   openssl pkeyutl -verify -pubin -inkey pubkey.pem -rawin -in digest.txt -sigfile signature.bin
   ```
5. **Online Independent Verification:** `POST /api/verify` accepts `{ record_id }` or arbitrary `{ payload, signature, public_key }` to verify authenticity without requiring database access.

---

## 7. Webhooks Dispatch Architecture (T4)

1. **Event Triggers:** Webhooks are automatically dispatched on:
   - `project.submitted`
   - `judging.completed`
   - `voting.closed`
   - `webhook.test`
2. **Signed Requests:** Every outgoing webhook delivery includes:
   - `X-Judgement-Event`: Event name
   - `X-Judgement-Signature`: `sha256=<HMAC-SHA256>` computed over canonical JSON payload using the webhook's private secret
   - `X-Judgement-Timestamp`: ISO 8601 UTC timestamp
3. **Delivery Audit Receipts:** Outgoing delivery attempts and HTTP response status codes are permanently logged into the `webhook_deliveries` database table and inspectable by organizers via `GET /api/webhooks/deliveries`.
