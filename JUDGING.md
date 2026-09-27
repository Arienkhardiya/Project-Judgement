# JUDGING.md

## DOGFOOD 2026 Judging Engine & Normalization Mathematics

This document specifies the judging assignment architecture, weighted rubric mechanics, cross-judge normalization equations, edge-case proofs, and judge privacy protections.

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

## 3. Mathematical Normalization Methodology

Hackathons suffer from two primary statistical distortions:
1. **Inter-Judge Tendency Variance:** Some judges are harsh (mean 2.5), while others are generous (mean 4.5).
2. **Reviewer Coverage Disparity:** Different projects receive varying review counts (in the real fixtures, projects receive between 2 and 5 reviews).
3. **Constant-Score Judges:** Judges who award identical scores across all evaluations (e.g. `jdg_07` awarded 4 to every project, resulting in sample variance $s_j^2 = 0$). Naive Z-score models produce division by zero ($0/0 = \text{NaN}$).

Our engine solves this using **Empirical Bayes Regularized Z-Score Normalization with Shrinkage Aggregation**.

### Stage 1: Raw Weighted Score
For an evaluation by judge $j$ on project $p$ across criteria $c \in C$:
$$R_{j,p} = \frac{\sum_{c \in C} w_c \cdot v_{j,p,c}}{\sum_{c \in C} w_c}$$

### Stage 2: Global Statistics
Across all completed evaluations $M$ in the event:
$$\mu_{\text{global}} = \frac{1}{M} \sum R_{j,p}$$
$$\sigma^2_{\text{global}} = \frac{1}{M} \sum (R_{j,p} - \mu_{\text{global}})^2$$
*(In the fixture dataset, $\mu_{\text{global}} \approx 3.5608$ and $\sigma_{\text{global}} \approx 0.6481$).*

### Stage 3: Judge Tendencies & Empirical Bayes Variance Smoothing
For judge $j$ with $N_j$ total evaluations:
$$\mu_j = \frac{1}{N_j} \sum_{k=1}^{N_j} R_{j,k}$$
$$s_j^2 = \frac{1}{N_j} \sum_{k=1}^{N_j} (R_{j,k} - \mu_j)^2$$

To prevent division by zero when $s_j = 0$ or $N_j = 1$, we regularize the judge's variance towards the global prior variance $\sigma^2_{\text{global}}$ with a prior weight of $m = 2.0$ pseudocounts:
$$\sigma_{j,\text{reg}} = \sqrt{\frac{N_j \cdot s_j^2 + m \cdot \sigma^2_{\text{global}}}{N_j + m}}$$

#### Proof for Constant-Score Judge (`jdg_07`):
- `jdg_07` has $N_j = 3$ evaluations, all scored 4 across all criteria.
- $\mu_j = 4.0$ and $s_j^2 = 0.0$.
- With our formula:
  $$\sigma_{j,\text{reg}} = \sqrt{\frac{3 \cdot 0 + 2 \cdot (0.6481)^2}{3 + 2}} = \sqrt{0.4} \cdot 0.6481 \approx 0.4099 > 0$$
- Division by zero is strictly avoided.

### Stage 4: Standardized Z-Score & Rescaling
Each evaluation is standardized relative to the judge's tendency and regularized spread:
$$Z_{j,p} = \frac{R_{j,p} - \mu_j}{\sigma_{j,\text{reg}}}$$

The Z-score is then mapped back to the global hackathon scale $[S_{\text{min}}, S_{\text{max}}]$:
$$S_{j,p} = \text{clamp}\left(\mu_{\text{global}} + Z_{j,p} \cdot \sigma_{\text{global}}, \, S_{\text{min}}, \, S_{\text{max}}\right)$$

For `jdg_07`, $R_{j,p} = 4.0$ and $\mu_j = 4.0$, yielding $Z_{j,p} = 0.0$ and $S_{j,p} = \mu_{\text{global}}$, correctly treating constant ratings as neutral performance relative to the field.

### Stage 5: Project Aggregation with Bayesian Shrinkage Mean
Projects have different review counts $K_p \in [2, 5]$. To prevent high-variance outliers on projects with few reviews, we compute the final score using a Bayesian shrinkage mean towards the global average:
$$\text{FinalScore}_p = \frac{\sum_{j} S_{j,p} + k_0 \cdot \mu_{\text{global}}}{K_p + k_0}$$
where $k_0 = 1.0$ represents a neutral prior evaluation.

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

---

## 6. Community Award Integration & Verifiable Audit Records (T3 & T4)

1. **Award Separation:**
   - **Track & Category Prizes:** Derived directly from the Empirical Bayes normalized judge rankings.
   - **Community Choice Prize (`prz_community`):** Derived from T3 community ballots under blind voting windows, ensuring public popularity cannot distort normalized technical evaluations.

2. **Cryptographically Verifiable Scoring Records:**
   - Every submitted evaluation produces an immutable audit receipt in `verifiable_records`.
   - The digest $\text{SHA256}(\text{canonical}(\text{score\_data}))$ is signed with the authority key.
   - Independent observers and external auditors can verify that a judging record was recorded by the platform and has not been altered, without exposing confidential peer judge ballots.

