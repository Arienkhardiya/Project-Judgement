/**
 * Deterministic Bradley-Terry Pairwise Ranking Engine (Pure Service)
 *
 * Mathematical Formulation:
 * 1. Bradley-Terry Model:
 *    For items i and j with positive latent strengths pi_i, pi_j > 0
 *    (or log-ability lambda_i = ln(pi_i)):
 *      P(i beats j) = pi_i / (pi_i + pi_j) = exp(lambda_i) / (exp(lambda_i) + exp(lambda_j))
 *
 * 2. Tie Policy Approximation:
 *    Each tie comparison is treated as 0.5 wins for project A and 0.5 wins for project B
 *    in the numerator, and counts as 1 total comparison in the denominator.
 *    NOTE: This is the standard, well-documented half-win approximation for ties in
 *    Bradley-Terry models (cf. Rao & Kupper 1967; Davidson 1970). It is a computationally
 *    tractable approximation rather than a full threshold-parameterized Davidson or
 *    Rao-Kupper tie model.
 *
 * 3. Regularization & Disconnected Graph Handling (Virtual Anchor Prior):
 *    Unregularized Bradley-Terry maximum likelihood can diverge to +Infinity for undefeated
 *    projects, to 0 for winless projects, and is mathematically ill-posed on disconnected
 *    graphs (components without mutual comparisons cannot be placed on a shared scale).
 *    To ensure finite, strictly positive ratings and guaranteed scale alignment across
 *    disconnected components, a Bayesian virtual anchor prior (pseudo-observation) is
 *    incorporated with weight alpha > 0 against a reference baseline with strength pi_0 = 1.0:
 *      Numerator:   W_i + alpha
 *      Denominator: sum_{j != i} [ n_{ij} / (pi_i + pi_j) ] + [ 2 * alpha / (pi_i + 1.0) ]
 *    This grounds all components to a common finite reference scale, prevents division by zero,
 *    and guarantees strictly positive, finite latent strengths for any valid comparison graph.
 *
 * 4. Deterministic Iterative Solver:
 *    Minorization-Maximization (MM / Hunter 2004) algorithm with:
 *    - Finite iteration cap (maxIterations, default 100)
 *    - Convergence tolerance (tolerance, default 1e-6)
 *    - Deterministic initialization (pi_i = 1.0 for all i)
 *    - Numerical sanity checks guarding against NaN / Infinity
 *
 * 5. Deterministic Ranking & Tie-Breaking:
 *    Ranked primary by latent rating (lambda) descending.
 *    Ties within floating-point precision (1e-12) broken by:
 *      1. total comparisons descending
 *      2. project_id ascending (lexicographical)
 *    Ranks assigned 1..N.
 */

/**
 * Calculates deterministic Bradley-Terry pairwise rankings.
 *
 * @param {Array<Object>} comparisons - List of comparison objects { project_a_id, project_b_id, winner_id, is_tie }
 * @param {Array<string>} projectIds - Explicit list of all project IDs to rank
 * @param {Object} [options] - Solver hyper-parameters
 * @param {number} [options.alpha=1.0] - Prior pseudocount weight (must be > 0)
 * @param {number} [options.maxIterations=100] - Maximum MM solver iterations (must be positive integer)
 * @param {number} [options.tolerance=1e-6] - Convergence tolerance on max absolute parameter change
 * @returns {{ converged: boolean, iterations: number, projects: Array<Object> }}
 */
export function calculatePairwiseRanking(comparisons, projectIds, options = {}) {
  // 1. Validate projectIds
  if (!Array.isArray(projectIds)) {
    throw new TypeError('projectIds must be an array of strings');
  }

  const K = projectIds.length;
  if (K === 0) {
    return {
      converged: true,
      iterations: 0,
      projects: []
    };
  }

  const seenProjectIds = new Set();
  for (let i = 0; i < K; i++) {
    const id = projectIds[i];
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new Error(`Invalid project ID at index ${i}: must be a non-empty string`);
    }
    if (seenProjectIds.has(id)) {
      throw new Error(`Duplicate project ID in projectIds: "${id}"`);
    }
    seenProjectIds.add(id);
  }

  // 2. Validate options
  const alpha = typeof options.alpha === 'number' && Number.isFinite(options.alpha) && options.alpha > 0
    ? options.alpha
    : 1.0;
  const maxIterations = typeof options.maxIterations === 'number' && Number.isInteger(options.maxIterations) && options.maxIterations > 0
    ? options.maxIterations
    : 100;
  const tolerance = typeof options.tolerance === 'number' && Number.isFinite(options.tolerance) && options.tolerance > 0
    ? options.tolerance
    : 1e-6;

  // 3. Validate comparisons input
  if (!Array.isArray(comparisons)) {
    throw new TypeError('comparisons must be an array');
  }

  const projectIndex = new Map();
  projectIds.forEach((id, idx) => projectIndex.set(id, idx));

  // Initialize per-project metrics
  const stats = projectIds.map(id => ({
    project_id: id,
    wins: 0,
    losses: 0,
    ties: 0,
    comparisons: 0,
    weightedWins: 0.0
  }));

  // Match count matrix: n_matrix[i][j] = total comparisons between project i and project j
  const n_matrix = Array.from({ length: K }, () => new Float64Array(K));

  // Process comparisons with strict validation
  for (let cIdx = 0; cIdx < comparisons.length; cIdx++) {
    const cmp = comparisons[cIdx];
    if (!cmp || typeof cmp !== 'object') {
      throw new Error(`Invalid comparison record at index ${cIdx}: must be an object`);
    }

    const { project_a_id, project_b_id, winner_id } = cmp;

    // Validate project existence
    if (typeof project_a_id !== 'string' || !projectIndex.has(project_a_id)) {
      throw new Error(`Comparison at index ${cIdx} references unknown or invalid project_a_id: ${project_a_id}`);
    }
    if (typeof project_b_id !== 'string' || !projectIndex.has(project_b_id)) {
      throw new Error(`Comparison at index ${cIdx} references unknown or invalid project_b_id: ${project_b_id}`);
    }
    if (project_a_id === project_b_id) {
      throw new Error(`Comparison at index ${cIdx} has identical project_a_id and project_b_id: ${project_a_id}`);
    }

    // Validate is_tie
    const isTieRaw = cmp.is_tie;
    if (typeof isTieRaw !== 'boolean' && isTieRaw !== 0 && isTieRaw !== 1) {
      throw new TypeError(`Comparison at index ${cIdx} has invalid is_tie value: must be boolean or 0/1`);
    }
    const isTie = isTieRaw === true || isTieRaw === 1;

    const idxA = projectIndex.get(project_a_id);
    const idxB = projectIndex.get(project_b_id);

    if (isTie) {
      // Tie must not have winner_id
      if (winner_id !== null && winner_id !== undefined) {
        throw new Error(`Comparison at index ${cIdx} is marked as tie but provides winner_id: ${winner_id}`);
      }
      stats[idxA].ties += 1;
      stats[idxB].ties += 1;
      stats[idxA].weightedWins += 0.5;
      stats[idxB].weightedWins += 0.5;
    } else {
      // Non-tie requires winner_id to be project_a_id or project_b_id
      if (winner_id !== project_a_id && winner_id !== project_b_id) {
        throw new Error(
          `Comparison at index ${cIdx} has winner_id "${winner_id}" which is neither project_a_id "${project_a_id}" nor project_b_id "${project_b_id}"`
        );
      }
      if (winner_id === project_a_id) {
        stats[idxA].wins += 1;
        stats[idxB].losses += 1;
        stats[idxA].weightedWins += 1.0;
      } else {
        stats[idxB].wins += 1;
        stats[idxA].losses += 1;
        stats[idxB].weightedWins += 1.0;
      }
    }

    stats[idxA].comparisons += 1;
    stats[idxB].comparisons += 1;
    n_matrix[idxA][idxB] += 1;
    n_matrix[idxB][idxA] += 1;
  }

  // 4. Single project trivial case
  if (K === 1) {
    return {
      converged: true,
      iterations: 0,
      projects: [
        {
          project_id: projectIds[0],
          wins: stats[0].wins,
          losses: stats[0].losses,
          ties: stats[0].ties,
          comparisons: stats[0].comparisons,
          strength: 1.0,
          lambda: 0.0,
          rank: 1
        }
      ]
    };
  }

  // 5. Iterative Minorization-Maximization (MM) Solver
  let pi = new Float64Array(K).fill(1.0);
  let converged = false;
  let iter = 0;

  for (iter = 0; iter < maxIterations; iter++) {
    const nextPi = new Float64Array(K);
    let maxDelta = 0.0;

    for (let i = 0; i < K; i++) {
      // Numerator: observed effective wins + prior pseudo-wins
      const num = stats[i].weightedWins + alpha;

      // Denominator: virtual anchor baseline term + pairwise comparison terms
      let den = (2.0 * alpha) / (pi[i] + 1.0);

      for (let j = 0; j < K; j++) {
        if (i === j) continue;
        const count = n_matrix[i][j];
        if (count > 0) {
          den += count / (pi[i] + pi[j]);
        }
      }

      // Safeguard denominator against non-positive/NaN values
      if (!Number.isFinite(den) || den <= 0) {
        den = 1e-12;
      }

      let updated = num / den;

      // Safeguard updated strength
      if (!Number.isFinite(updated) || Number.isNaN(updated) || updated <= 0) {
        updated = 1e-6;
      }

      nextPi[i] = updated;

      const delta = Math.abs(updated - pi[i]);
      if (delta > maxDelta) {
        maxDelta = delta;
      }
    }

    pi = nextPi;

    if (maxDelta < tolerance) {
      converged = true;
      iter++; // Record completed iteration count
      break;
    }
  }

  // If reached loop bound without early break, iter equals maxIterations
  if (!converged && iter === maxIterations) {
    // completed maxIterations
  }

  // 6. Build ranked output with deterministic tie-breaking
  const projects = stats.map((s, idx) => {
    const rawStrength = pi[idx];
    const rawLambda = Math.log(rawStrength);

    // Final numerical sanity check
    const strengthSafe = Number.isFinite(rawStrength) && rawStrength > 0 ? rawStrength : 1.0;
    const lambdaSafe = Number.isFinite(rawLambda) ? rawLambda : 0.0;

    return {
      project_id: s.project_id,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      comparisons: s.comparisons,
      strength: Number(strengthSafe.toFixed(6)),
      lambda: Number(lambdaSafe.toFixed(6)),
      _raw_lambda: lambdaSafe,
      _comparisons: s.comparisons
    };
  });

  // Deterministic sorting:
  // 1. Latent rating descending (within 1e-12 considered identical)
  // 2. Total comparisons descending
  // 3. Project ID ascending (lexicographical)
  projects.sort((a, b) => {
    const diff = b._raw_lambda - a._raw_lambda;
    if (Math.abs(diff) > 1e-12) {
      return diff;
    }
    if (b._comparisons !== a._comparisons) {
      return b._comparisons - a._comparisons;
    }
    return a.project_id.localeCompare(b.project_id);
  });

  // Assign clean ranks 1..N and remove internal sort keys
  projects.forEach((p, idx) => {
    p.rank = idx + 1;
    delete p._raw_lambda;
    delete p._comparisons;
  });

  return {
    converged,
    iterations: iter,
    projects
  };
}

/**
 * Generates balanced, track-aware pairwise assignments deterministically.
 *
 * Enforces:
 * - Only eligible projects paired.
 * - No self-pairs (project_a_id != project_b_id).
 * - Canonical ordering (project_a_id < project_b_id).
 * - No duplicate pairs for the same judge.
 * - Circulant graph topologies ensuring balanced coverage targeting ~4-6 reviews.
 * - Safe handling of small graphs (0, 1, 2 projects) with documented under-coverage rationale.
 *
 * @param {Array<Object|string>} projects - Projects eligible for comparison
 * @param {Array<Object|string>} judges - Judges eligible to receive assignments
 * @param {Object} [options]
 * @param {number} [options.comparisonsPerProject=5] - Target comparisons per project
 * @param {string} [options.eventId='evt_default'] - Event ID
 * @param {string} [options.trackId=null] - Optional track ID filter
 * @returns {{ pairs: Array<Object>, metadata: Object }}
 */
export function generatePairAssignments(projects, judges, options = {}) {
  const comparisonsPerProject = Number.isInteger(options.comparisonsPerProject) && options.comparisonsPerProject > 0
    ? options.comparisonsPerProject
    : 5;
  const eventId = options.eventId || 'evt_default';
  const trackId = options.trackId || null;

  // Normalize project IDs
  const projectList = (projects || [])
    .map(p => (typeof p === 'string' ? { id: p, track_id: trackId } : p))
    .filter(p => p && typeof p.id === 'string' && p.id.trim().length > 0);

  // Deduplicate and sort deterministically
  const uniqueProjectMap = new Map();
  for (const p of projectList) {
    if (!uniqueProjectMap.has(p.id)) uniqueProjectMap.set(p.id, p);
  }
  const sortedProjects = [...uniqueProjectMap.values()].sort((a, b) => a.id.localeCompare(b.id));

  // Normalize judge IDs
  const judgeList = (judges || [])
    .map(j => (typeof j === 'string' ? { id: j } : j))
    .filter(j => j && typeof j.id === 'string' && j.id.trim().length > 0);

  const uniqueJudgeMap = new Map();
  for (const j of judgeList) {
    if (!uniqueJudgeMap.has(j.id)) uniqueJudgeMap.set(j.id, j);
  }
  const sortedJudges = [...uniqueJudgeMap.values()].sort((a, b) => a.id.localeCompare(b.id));

  const N = sortedProjects.length;
  const M = sortedJudges.length;

  let underCoverageReason = null;

  if (N === 0) {
    underCoverageReason = 'No eligible projects available for pairing.';
    return { pairs: [], metadata: { projectCount: 0, judgeCount: M, underCoverageReason } };
  }
  if (N === 1) {
    underCoverageReason = 'At least 2 distinct projects are required to form a comparison pair.';
    return { pairs: [], metadata: { projectCount: 1, judgeCount: M, underCoverageReason } };
  }
  if (M === 0) {
    underCoverageReason = 'No eligible judges available to assign pairs.';
    return { pairs: [], metadata: { projectCount: N, judgeCount: 0, underCoverageReason } };
  }

  // Maximum achievable comparisons per project given N projects and M judges:
  const maxPossibleComparisons = (N - 1) * M;
  const targetComparisons = Math.min(comparisonsPerProject, maxPossibleComparisons);

  if (targetComparisons < comparisonsPerProject) {
    underCoverageReason = `Project count (${N}) and judge count (${M}) limit maximum comparisons per project to ${maxPossibleComparisons} (requested: ${comparisonsPerProject}).`;
  }

  // 1. Generate unique project pairs using circulant ladder steps for balanced coverage
  const canonicalPairs = [];
  const pairSet = new Set();

  function addPair(idxA, idxB) {
    if (idxA === idxB) return;
    const pA = sortedProjects[idxA].id;
    const pB = sortedProjects[idxB].id;
    const a = pA < pB ? pA : pB;
    const b = pA < pB ? pB : pA;
    const key = `${a}::${b}`;
    if (!pairSet.has(key)) {
      pairSet.add(key);
      canonicalPairs.push({
        project_a_id: a,
        project_b_id: b,
        track_id: sortedProjects[idxA].track_id || trackId
      });
    }
  }

  if (N === 2) {
    addPair(0, 1);
  } else {
    // Number of chords needed
    const chords = Math.ceil(Math.min(targetComparisons, N - 1) / 2);
    for (let s = 1; s <= chords; s++) {
      if (s > Math.floor(N / 2)) break;
      for (let i = 0; i < N; i++) {
        const j = (i + s) % N;
        addPair(i, j);
      }
    }
  }

  // 2. Distribute pairs to judges deterministically without duplicate assignments per judge
  const neededAssignments = Math.ceil((N * targetComparisons) / 2);
  const replicationsPerPair = Math.min(M, Math.max(1, Math.ceil(neededAssignments / canonicalPairs.length)));

  const assignments = [];
  const judgeAssignedPairs = new Map();
  for (const j of sortedJudges) {
    judgeAssignedPairs.set(j.id, new Set());
  }

  let judgeIdx = 0;
  for (let rep = 0; rep < replicationsPerPair; rep++) {
    for (let pIdx = 0; pIdx < canonicalPairs.length; pIdx++) {
      if (assignments.length >= neededAssignments && rep > 0) break;
      const pair = canonicalPairs[pIdx];
      const pairKey = `${pair.project_a_id}::${pair.project_b_id}`;

      let attempts = 0;
      while (attempts < M) {
        const judge = sortedJudges[judgeIdx % M];
        judgeIdx++;
        attempts++;

        const assignedSet = judgeAssignedPairs.get(judge.id);
        if (!assignedSet.has(pairKey)) {
          assignedSet.add(pairKey);
          assignments.push({
            id: `pwp_${judge.id}_${pair.project_a_id}_${pair.project_b_id}`,
            event_id: eventId,
            judge_user_id: judge.id,
            project_a_id: pair.project_a_id,
            project_b_id: pair.project_b_id,
            track_id: pair.track_id,
            status: 'PENDING'
          });
          break;
        }
      }
    }
  }

  return {
    pairs: assignments,
    metadata: {
      projectCount: N,
      judgeCount: M,
      canonicalPairCount: canonicalPairs.length,
      totalAssignments: assignments.length,
      targetComparisons,
      underCoverageReason
    }
  };
}

export default {
  calculatePairwiseRanking,
  generatePairAssignments
};
