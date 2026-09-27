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

## 4. Normalization Impact on Real Fixture Data

When evaluated against the 41 fixture projects and 126 scores:
- **Top Ranked Project:** `prj_35` (Final Score: 4.4172, 5 reviews).
- **Projects with Varied Review Counts:** Projects with 2 reviews are stabilized against projects with 5 reviews, rewarding consistent excellence across multiple reviewers.
- **Harsh Judges:** Projects rated 3.0 by an exceptionally harsh judge (e.g. `jdg_14` mean 3.0) receive a positive Z-score boost, elevating their standing.
- **Generous Judges:** Projects rated 4.0 by an exceptionally lenient judge (e.g. `jdg_02` mean 4.22) are appropriately scaled down.

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
