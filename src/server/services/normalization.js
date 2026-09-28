import { getDatabase } from '../db/database.js';

/**
 * Deterministic Cross-Judge Normalization Engine
 * 
 * Mathematical Formulation:
 * 1. Raw Weighted Score:
 *    R_{j,p} = sum(w_c * v_{j,p,c}) / sum(w_c)
 * 
 * 2. Judge Statistics & Empirical Bayes Variance Regularization:
 *    mu_j = mean(R_{j,k})
 *    s_j^2 = var(R_{j,k})
 *    sigma_{j,reg} = sqrt( (N_j * s_j^2 + m * sigma_global^2) / (N_j + m) )
 *    where m = 2.0 (pseudocount weight) ensures sigma_{j,reg} > 0 even when s_j = 0 (e.g. jdg_07)
 * 
 * 3. Standardized Z-Score:
 *    Z_{j,p} = (R_{j,p} - mu_j) / sigma_{j,reg}
 * 
 * 4. Rescaling to Global Scale [1, 5]:
 *    S_{j,p} = clamp(mu_global + Z_{j,p} * sigma_global, min_score, max_score)
 * 
 * 5. Project Score Aggregation (Bayesian Shrinkage Mean for variable review counts):
 *    FinalScore_p = (sum(S_{j,p}) + k_0 * mu_global) / (K_p + k_0)
 *    where k_0 = 1.0 (prior review weight) prevents small sample distortion.
 */

export function calculateNormalization(eventId, customDb = null) {
  const db = customDb || getDatabase();

  // 1. Fetch event and active rubric criteria weights
  const event = eventId
    ? db.prepare('SELECT id, name FROM events WHERE id = ?').get(eventId)
    : db.prepare('SELECT id, name FROM events ORDER BY created_at DESC LIMIT 1').get();

  if (!event) {
    throw new Error('Event not found for normalization');
  }

  const criteriaRows = db.prepare(`
    SELECT rc.criterion_key, rc.weight, rc.min_score, rc.max_score
    FROM rubric_criteria rc
    JOIN rubrics r ON r.id = rc.rubric_id
    WHERE r.event_id = ?
  `).all(event.id);

  const criteriaWeights = {};
  let totalWeight = 0;
  let minScore = 1.0;
  let maxScore = 5.0;

  if (criteriaRows.length > 0) {
    for (const c of criteriaRows) {
      criteriaWeights[c.criterion_key] = c.weight;
      totalWeight += c.weight;
      minScore = Math.min(minScore, c.min_score);
      maxScore = Math.max(maxScore, c.max_score);
    }
  } else {
    // Default weights if no rubric explicitly linked
    criteriaWeights.functionality = 1.0;
    criteriaWeights.quality = 1.0;
    criteriaWeights.innovation = 1.0;
    totalWeight = 3.0;
  }

  // 2. Fetch all scores with their values for projects in this event
  const scoreRows = db.prepare(`
    SELECT 
      s.id as score_id,
      s.judge_user_id as judge_id,
      s.project_id,
      p.track_id,
      p.title as project_title,
      t.name as team_name,
      tr.name as track_name,
      sv.criterion_key,
      sv.value
    FROM scores s
    JOIN projects p ON p.id = s.project_id
    JOIN teams t ON t.id = p.team_id
    JOIN events e ON e.id = t.event_id
    LEFT JOIN tracks tr ON tr.id = p.track_id
    LEFT JOIN score_values sv ON sv.score_id = s.id
    WHERE e.id = ? AND s.status = 'SUBMITTED'
  `).all(event.id);

  if (scoreRows.length === 0) {
    return {
      event,
      projects: [],
      judgeStats: {},
      globalStats: { mean: 0, stdDev: 0, totalScores: 0 },
    };
  }

  // Group criterion values by score (judge_id + project_id)
  const evaluationsMap = new Map();
  for (const row of scoreRows) {
    const key = `${row.judge_id}_${row.project_id}`;
    if (!evaluationsMap.has(key)) {
      evaluationsMap.set(key, {
        score_id: row.score_id,
        judge_id: row.judge_id,
        project_id: row.project_id,
        project_title: row.project_title,
        team_name: row.team_name,
        track_id: row.track_id,
        track_name: row.track_name,
        criteria: {},
      });
    }
    if (row.criterion_key && row.value !== null) {
      evaluationsMap.get(key).criteria[row.criterion_key] = row.value;
    }
  }

  const evaluations = Array.from(evaluationsMap.values());

  // Compute raw weighted score for each evaluation
  for (const ev of evaluations) {
    let weightedSum = 0;
    let evalWeightSum = 0;

    for (const [crit, val] of Object.entries(ev.criteria)) {
      const w = criteriaWeights[crit] || 1.0;
      weightedSum += val * w;
      evalWeightSum += w;
    }

    ev.rawScore = evalWeightSum > 0 ? weightedSum / evalWeightSum : 0;
  }

  // 3. Compute Global Statistics
  const allRawScores = evaluations.map(e => e.rawScore);
  const globalMean = allRawScores.reduce((acc, v) => acc + v, 0) / allRawScores.length;
  const globalVariance = allRawScores.reduce((acc, v) => acc + Math.pow(v - globalMean, 2), 0) / (allRawScores.length || 1);
  const globalStdDev = Math.sqrt(globalVariance) || 0.65; // fallback non-zero if identical

  // 4. Compute Per-Judge Statistics
  const scoresByJudge = new Map();
  for (const ev of evaluations) {
    if (!scoresByJudge.has(ev.judge_id)) {
      scoresByJudge.set(ev.judge_id, []);
    }
    scoresByJudge.get(ev.judge_id).push(ev.rawScore);
  }

  const judgeStats = {};
  const m = 2.0; // Bayesian prior pseudocount

  for (const [judgeId, rawList] of scoresByJudge.entries()) {
    const n = rawList.length;
    const mu = rawList.reduce((acc, v) => acc + v, 0) / n;
    const sampleVar = rawList.reduce((acc, v) => acc + Math.pow(v - mu, 2), 0) / n;
    
    // Regularized standard deviation: prevents division by zero for constant judges like jdg_07
    const regularizedVariance = (n * sampleVar + m * globalVariance) / (n + m);
    const regularizedStdDev = Math.sqrt(regularizedVariance);

    judgeStats[judgeId] = {
      count: n,
      mean: Number(mu.toFixed(4)),
      sampleStdDev: Number(Math.sqrt(sampleVar).toFixed(4)),
      regularizedStdDev: Number(regularizedStdDev.toFixed(4)),
    };
  }

  // 5. Standardize each evaluation (Z-Score) and Rescale to Global Range
  for (const ev of evaluations) {
    const stats = judgeStats[ev.judge_id];
    // Z-Score relative to this judge's tendency
    ev.zScore = (ev.rawScore - stats.mean) / stats.regularizedStdDev;

    // Rescale back to global scale
    const scaled = globalMean + ev.zScore * globalStdDev;
    ev.normalizedScore = Math.max(minScore, Math.min(maxScore, scaled));
  }

  // 6. Aggregate by Project
  const projectMap = new Map();
  for (const ev of evaluations) {
    if (!projectMap.has(ev.project_id)) {
      projectMap.set(ev.project_id, {
        project_id: ev.project_id,
        project_title: ev.project_title,
        team_name: ev.team_name,
        track_id: ev.track_id,
        track_name: ev.track_name,
        evaluations: [],
      });
    }
    projectMap.get(ev.project_id).evaluations.push(ev);
  }

  // Also include any submitted projects that have zero reviews
  const allSubmittedProjects = db.prepare(`
    SELECT p.id, p.title, p.track_id, t.name as team_name, tr.name as track_name, p.submitted_at, p.repo_url
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    JOIN events e ON e.id = t.event_id
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE e.id = ? AND p.status = 'SUBMITTED'
  `).all(event.id);

  const k0 = 1.0; // Bayesian prior weight for project mean
  const projectResults = [];

  for (const p of allSubmittedProjects) {
    const grouped = projectMap.get(p.id);
    const evals = grouped ? grouped.evaluations : [];
    const count = evals.length;

    let rawAvg = 0;
    let normalizedAvg = 0;
    let finalScore = globalMean; // neutral if unreviewed

    if (count > 0) {
      const rawSum = evals.reduce((acc, e) => acc + e.rawScore, 0);
      const normSum = evals.reduce((acc, e) => acc + e.normalizedScore, 0);

      rawAvg = rawSum / count;
      normalizedAvg = normSum / count;

      // Bayesian shrinkage mean handles uneven review counts (2 to 5 reviews)
      finalScore = (normSum + k0 * globalMean) / (count + k0);
    }

    projectResults.push({
      project_id: p.id,
      title: p.title,
      team_name: p.team_name,
      track_id: p.track_id,
      track_name: p.track_name || 'General',
      reviews_count: count,
      raw_avg_score: Number(rawAvg.toFixed(4)),
      normalized_score: Number(normalizedAvg.toFixed(4)),
      final_score: Number(finalScore.toFixed(4)),
      submitted_at: p.submitted_at,
      repo_url: p.repo_url || '',
    });
  }

  // Sort descending by final_score, then raw_avg_score, with deterministic project_id tie-breaker
  projectResults.sort(
    (a, b) =>
      b.final_score - a.final_score ||
      b.raw_avg_score - a.raw_avg_score ||
      a.project_id.localeCompare(b.project_id)
  );

  // Assign overall ranks
  projectResults.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  return {
    event: { id: event.id, name: event.name },
    globalStats: {
      mean: Number(globalMean.toFixed(4)),
      stdDev: Number(globalStdDev.toFixed(4)),
      totalEvaluations: evaluations.length,
      evaluatedProjects: projectMap.size,
    },
    judgeStats,
    projects: projectResults,
  };
}

export default {
  calculateNormalization,
};
