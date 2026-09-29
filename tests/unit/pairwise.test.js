import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePairwiseRanking } from '../../src/server/services/pairwise.js';

describe('Bonus B - Bradley-Terry Pairwise Ranking Engine', () => {

  it('1. Two projects, A beats B: A ranks 1st with positive lambda, B ranks 2nd with negative lambda', () => {
    const comparisons = [
      { project_a_id: 'prj_01', project_b_id: 'prj_02', winner_id: 'prj_01', is_tie: 0 }
    ];
    const result = calculatePairwiseRanking(comparisons, ['prj_01', 'prj_02']);

    assert.equal(result.converged, true);
    assert.equal(result.projects.length, 2);

    const [first, second] = result.projects;
    assert.equal(first.project_id, 'prj_01');
    assert.equal(first.rank, 1);
    assert.equal(first.wins, 1);
    assert.equal(first.losses, 0);
    assert.ok(first.strength > 1.0, 'Winner strength should exceed baseline 1.0');
    assert.ok(first.lambda > 0.0, 'Winner log-ability should be positive');

    assert.equal(second.project_id, 'prj_02');
    assert.equal(second.rank, 2);
    assert.equal(second.wins, 0);
    assert.equal(second.losses, 1);
    assert.ok(second.strength < 1.0, 'Loser strength should be below baseline 1.0');
    assert.ok(second.lambda < 0.0, 'Loser log-ability should be negative');
  });

  it('2. Two projects, B beats A: B ranks 1st with positive lambda, A ranks 2nd with negative lambda', () => {
    const comparisons = [
      { project_a_id: 'prj_01', project_b_id: 'prj_02', winner_id: 'prj_02', is_tie: 0 }
    ];
    const result = calculatePairwiseRanking(comparisons, ['prj_01', 'prj_02']);

    assert.equal(result.converged, true);
    assert.equal(result.projects[0].project_id, 'prj_02');
    assert.equal(result.projects[0].rank, 1);
    assert.ok(result.projects[0].lambda > 0.0);

    assert.equal(result.projects[1].project_id, 'prj_01');
    assert.equal(result.projects[1].rank, 2);
    assert.ok(result.projects[1].lambda < 0.0);
  });

  it('3. Symmetric results produce symmetric ordering and identical ratings', () => {
    const comparisons = [
      { project_a_id: 'prj_01', project_b_id: 'prj_02', winner_id: 'prj_01', is_tie: 0 },
      { project_a_id: 'prj_01', project_b_id: 'prj_02', winner_id: 'prj_02', is_tie: 0 }
    ];
    const result = calculatePairwiseRanking(comparisons, ['prj_01', 'prj_02']);

    assert.equal(result.converged, true);
    const p1 = result.projects.find(p => p.project_id === 'prj_01');
    const p2 = result.projects.find(p => p.project_id === 'prj_02');

    assert.equal(p1.wins, 1);
    assert.equal(p1.losses, 1);
    assert.equal(p2.wins, 1);
    assert.equal(p2.losses, 1);
    assert.equal(p1.strength, p2.strength);
    assert.equal(p1.lambda, p2.lambda);

    // Tied ratings are broken deterministically by project_id ascending
    assert.equal(result.projects[0].project_id, 'prj_01');
    assert.equal(result.projects[0].rank, 1);
    assert.equal(result.projects[1].project_id, 'prj_02');
    assert.equal(result.projects[1].rank, 2);
  });

  it('4. Undefeated project rating remains strictly finite', () => {
    const comparisons = [
      { project_a_id: 'prj_01', project_b_id: 'prj_02', winner_id: 'prj_01', is_tie: 0 },
      { project_a_id: 'prj_01', project_b_id: 'prj_03', winner_id: 'prj_01', is_tie: 0 },
      { project_a_id: 'prj_01', project_b_id: 'prj_04', winner_id: 'prj_01', is_tie: 0 }
    ];
    const result = calculatePairwiseRanking(comparisons, ['prj_01', 'prj_02', 'prj_03', 'prj_04']);

    assert.equal(result.converged, true);
    const undefeated = result.projects.find(p => p.project_id === 'prj_01');
    assert.equal(undefeated.rank, 1);
    assert.equal(undefeated.wins, 3);
    assert.equal(undefeated.losses, 0);
    assert.ok(Number.isFinite(undefeated.strength), 'Strength must be finite');
    assert.ok(Number.isFinite(undefeated.lambda), 'Lambda must be finite');
    assert.ok(undefeated.strength > 0, 'Strength must be strictly positive');
    assert.ok(undefeated.strength < 1000, 'Strength must be reasonably bounded by prior');
  });

  it('5. Winless project rating remains strictly finite and positive', () => {
    const comparisons = [
      { project_a_id: 'prj_01', project_b_id: 'prj_02', winner_id: 'prj_01', is_tie: 0 },
      { project_a_id: 'prj_01', project_b_id: 'prj_03', winner_id: 'prj_01', is_tie: 0 },
      { project_a_id: 'prj_02', project_b_id: 'prj_03', winner_id: 'prj_02', is_tie: 0 }
    ];
    const result = calculatePairwiseRanking(comparisons, ['prj_01', 'prj_02', 'prj_03']);

    assert.equal(result.converged, true);
    const winless = result.projects.find(p => p.project_id === 'prj_03');
    assert.equal(winless.rank, 3);
    assert.equal(winless.wins, 0);
    assert.equal(winless.losses, 2);
    assert.ok(Number.isFinite(winless.strength), 'Strength must be finite');
    assert.ok(Number.isFinite(winless.lambda), 'Lambda must be finite');
    assert.ok(winless.strength > 0, 'Strength must be strictly positive (no collapse to zero)');
  });

  it('6. Known dataset - Transitive graph (A > B, B > C, A > C): strictly orders A > B > C', () => {
    const comparisons = [
      { project_a_id: 'prj_A', project_b_id: 'prj_B', winner_id: 'prj_A', is_tie: 0 },
      { project_a_id: 'prj_B', project_b_id: 'prj_C', winner_id: 'prj_B', is_tie: 0 },
      { project_a_id: 'prj_A', project_b_id: 'prj_C', winner_id: 'prj_A', is_tie: 0 }
    ];
    const result = calculatePairwiseRanking(comparisons, ['prj_A', 'prj_B', 'prj_C']);

    assert.equal(result.converged, true);
    assert.equal(result.projects[0].project_id, 'prj_A');
    assert.equal(result.projects[0].rank, 1);
    assert.equal(result.projects[1].project_id, 'prj_B');
    assert.equal(result.projects[1].rank, 2);
    assert.equal(result.projects[2].project_id, 'prj_C');
    assert.equal(result.projects[2].rank, 3);

    assert.ok(result.projects[0].lambda > result.projects[1].lambda);
    assert.ok(result.projects[1].lambda > result.projects[2].lambda);
  });

  it('7. Known dataset - Cyclic graph (A > B, B > C, C > A): converges with identical ratings', () => {
    const comparisons = [
      { project_a_id: 'prj_A', project_b_id: 'prj_B', winner_id: 'prj_A', is_tie: 0 },
      { project_a_id: 'prj_B', project_b_id: 'prj_C', winner_id: 'prj_B', is_tie: 0 },
      { project_a_id: 'prj_A', project_b_id: 'prj_C', winner_id: 'prj_C', is_tie: 0 } // C beats A
    ];
    const result = calculatePairwiseRanking(comparisons, ['prj_A', 'prj_B', 'prj_C']);

    assert.equal(result.converged, true);
    assert.equal(result.projects.length, 3);

    // All three have 1 win, 1 loss -> equal ratings
    const strengths = result.projects.map(p => p.strength);
    assert.equal(strengths[0], strengths[1]);
    assert.equal(strengths[1], strengths[2]);

    // Ordered deterministically by project_id
    assert.equal(result.projects[0].project_id, 'prj_A');
    assert.equal(result.projects[0].rank, 1);
    assert.equal(result.projects[1].project_id, 'prj_B');
    assert.equal(result.projects[1].rank, 2);
    assert.equal(result.projects[2].project_id, 'prj_C');
    assert.equal(result.projects[2].rank, 3);
  });

  it('8. Known dataset - Disconnected graph (A > B, C > D): both components represented with finite ratings', () => {
    const comparisons = [
      { project_a_id: 'prj_A', project_b_id: 'prj_B', winner_id: 'prj_A', is_tie: 0 },
      { project_a_id: 'prj_C', project_b_id: 'prj_D', winner_id: 'prj_C', is_tie: 0 }
    ];
    const result = calculatePairwiseRanking(comparisons, ['prj_A', 'prj_B', 'prj_C', 'prj_D']);

    assert.equal(result.converged, true);
    assert.equal(result.projects.length, 4);

    const pA = result.projects.find(p => p.project_id === 'prj_A');
    const pB = result.projects.find(p => p.project_id === 'prj_B');
    const pC = result.projects.find(p => p.project_id === 'prj_C');
    const pD = result.projects.find(p => p.project_id === 'prj_D');

    // Both winners have equal strength, both losers have equal strength
    assert.equal(pA.strength, pC.strength);
    assert.equal(pB.strength, pD.strength);
    assert.ok(pA.strength > pB.strength);

    // All projects are present with finite ratings
    result.projects.forEach(p => {
      assert.ok(Number.isFinite(p.strength));
      assert.ok(Number.isFinite(p.lambda));
      assert.ok(p.strength > 0);
    });
  });

  it('9. All-tie graph gives equal strength and identical lambda across all projects', () => {
    const comparisons = [
      { project_a_id: 'prj_01', project_b_id: 'prj_02', winner_id: null, is_tie: 1 },
      { project_a_id: 'prj_02', project_b_id: 'prj_03', winner_id: null, is_tie: 1 },
      { project_a_id: 'prj_01', project_b_id: 'prj_03', winner_id: null, is_tie: 1 }
    ];
    const result = calculatePairwiseRanking(comparisons, ['prj_01', 'prj_02', 'prj_03']);

    assert.equal(result.converged, true);
    result.projects.forEach(p => {
      assert.equal(p.ties, 2);
      assert.equal(p.wins, 0);
      assert.equal(p.losses, 0);
      assert.equal(p.strength, 1.0);
      assert.equal(p.lambda, 0.0);
    });
  });

  it('10. Repeated comparison aggregation is stable and monotonic', () => {
    // 5 comparisons: A beats B 4 times, B beats A 1 time
    const comparisons = [
      { project_a_id: 'prj_A', project_b_id: 'prj_B', winner_id: 'prj_A', is_tie: 0 },
      { project_a_id: 'prj_A', project_b_id: 'prj_B', winner_id: 'prj_A', is_tie: 0 },
      { project_a_id: 'prj_A', project_b_id: 'prj_B', winner_id: 'prj_A', is_tie: 0 },
      { project_a_id: 'prj_A', project_b_id: 'prj_B', winner_id: 'prj_A', is_tie: 0 },
      { project_a_id: 'prj_A', project_b_id: 'prj_B', winner_id: 'prj_B', is_tie: 0 }
    ];
    const result = calculatePairwiseRanking(comparisons, ['prj_A', 'prj_B']);

    assert.equal(result.converged, true);
    const pA = result.projects.find(p => p.project_id === 'prj_A');
    const pB = result.projects.find(p => p.project_id === 'prj_B');

    assert.equal(pA.wins, 4);
    assert.equal(pA.losses, 1);
    assert.equal(pA.comparisons, 5);
    assert.equal(pB.wins, 1);
    assert.equal(pB.losses, 4);
    assert.equal(pB.comparisons, 5);

    assert.ok(pA.strength > pB.strength);
    assert.ok(pA.lambda > 0);
    assert.ok(pB.lambda < 0);
  });

  it('11. Empty comparisons are handled deterministically', () => {
    const result = calculatePairwiseRanking([], ['prj_03', 'prj_01', 'prj_02']);

    assert.equal(result.converged, true);
    assert.ok(result.iterations <= 1);
    assert.equal(result.projects.length, 3);

    // All projects receive neutral baseline strength 1.0, lambda 0.0
    result.projects.forEach(p => {
      assert.equal(p.wins, 0);
      assert.equal(p.losses, 0);
      assert.equal(p.ties, 0);
      assert.equal(p.comparisons, 0);
      assert.equal(p.strength, 1.0);
      assert.equal(p.lambda, 0.0);
    });

    // Tied ratings are broken deterministically by project_id ascending
    assert.equal(result.projects[0].project_id, 'prj_01');
    assert.equal(result.projects[0].rank, 1);
    assert.equal(result.projects[1].project_id, 'prj_02');
    assert.equal(result.projects[1].rank, 2);
    assert.equal(result.projects[2].project_id, 'prj_03');
    assert.equal(result.projects[2].rank, 3);
  });

  it('12. Single project trivial case produces rank 1 with neutral baseline rating', () => {
    const result = calculatePairwiseRanking([], ['prj_solo']);

    assert.equal(result.converged, true);
    assert.equal(result.iterations, 0);
    assert.equal(result.projects.length, 1);
    assert.equal(result.projects[0].project_id, 'prj_solo');
    assert.equal(result.projects[0].rank, 1);
    assert.equal(result.projects[0].strength, 1.0);
    assert.equal(result.projects[0].lambda, 0.0);
  });

  it('13. Validation: Unknown or missing project ID in comparison throws error', () => {
    assert.throws(() => {
      calculatePairwiseRanking(
        [{ project_a_id: 'prj_unknown', project_b_id: 'prj_02', winner_id: 'prj_02', is_tie: 0 }],
        ['prj_01', 'prj_02']
      );
    }, /unknown or invalid project_a_id/);

    assert.throws(() => {
      calculatePairwiseRanking(
        [{ project_a_id: 'prj_01', project_b_id: 'prj_unknown', winner_id: 'prj_01', is_tie: 0 }],
        ['prj_01', 'prj_02']
      );
    }, /unknown or invalid project_b_id/);
  });

  it('14. Validation: Winner not in comparison pair throws error', () => {
    assert.throws(() => {
      calculatePairwiseRanking(
        [{ project_a_id: 'prj_01', project_b_id: 'prj_02', winner_id: 'prj_03', is_tie: 0 }],
        ['prj_01', 'prj_02', 'prj_03']
      );
    }, /winner_id.*is neither project_a_id.*nor project_b_id/);
  });

  it('15. Validation: Self-comparison throws error', () => {
    assert.throws(() => {
      calculatePairwiseRanking(
        [{ project_a_id: 'prj_01', project_b_id: 'prj_01', winner_id: 'prj_01', is_tie: 0 }],
        ['prj_01', 'prj_02']
      );
    }, /identical project_a_id and project_b_id/);
  });

  it('16. Validation: Tie/winner contradiction throws error', () => {
    // Tie with winner_id specified
    assert.throws(() => {
      calculatePairwiseRanking(
        [{ project_a_id: 'prj_01', project_b_id: 'prj_02', winner_id: 'prj_01', is_tie: 1 }],
        ['prj_01', 'prj_02']
      );
    }, /marked as tie but provides winner_id/);

    // Non-tie with missing winner_id
    assert.throws(() => {
      calculatePairwiseRanking(
        [{ project_a_id: 'prj_01', project_b_id: 'prj_02', winner_id: null, is_tie: 0 }],
        ['prj_01', 'prj_02']
      );
    }, /neither project_a_id.*nor project_b_id/);
  });

  it('17. Determinism: Repeated executions yield strictly identical results', () => {
    const comparisons = [
      { project_a_id: 'prj_01', project_b_id: 'prj_02', winner_id: 'prj_01', is_tie: 0 },
      { project_a_id: 'prj_02', project_b_id: 'prj_03', winner_id: 'prj_02', is_tie: 0 },
      { project_a_id: 'prj_03', project_b_id: 'prj_04', winner_id: null, is_tie: 1 },
      { project_a_id: 'prj_01', project_b_id: 'prj_04', winner_id: 'prj_01', is_tie: 0 }
    ];
    const projectIds = ['prj_01', 'prj_02', 'prj_03', 'prj_04'];

    const run1 = calculatePairwiseRanking(comparisons, projectIds);
    const run2 = calculatePairwiseRanking(comparisons, projectIds);
    const run3 = calculatePairwiseRanking(comparisons, projectIds);

    assert.deepEqual(run1, run2);
    assert.deepEqual(run2, run3);
  });

  it('18. Iteration cap prevents infinite execution and sets converged to false', () => {
    const comparisons = [
      { project_a_id: 'prj_01', project_b_id: 'prj_02', winner_id: 'prj_01', is_tie: 0 },
      { project_a_id: 'prj_02', project_b_id: 'prj_03', winner_id: 'prj_02', is_tie: 0 },
      { project_a_id: 'prj_01', project_b_id: 'prj_03', winner_id: 'prj_01', is_tie: 0 }
    ];
    const result = calculatePairwiseRanking(
      comparisons,
      ['prj_01', 'prj_02', 'prj_03'],
      { maxIterations: 1, tolerance: 1e-15 }
    );

    assert.equal(result.converged, false);
    assert.equal(result.iterations, 1);
    assert.equal(result.projects.length, 3);
    result.projects.forEach(p => {
      assert.ok(Number.isFinite(p.strength));
      assert.ok(Number.isFinite(p.lambda));
      assert.ok(p.strength > 0);
    });
  });

  it('19. Numerical invariants hold across complex comparison topologies', () => {
    const projectIds = ['prj_01', 'prj_02', 'prj_03', 'prj_04', 'prj_05'];
    const comparisons = [
      { project_a_id: 'prj_01', project_b_id: 'prj_02', winner_id: 'prj_01', is_tie: 0 },
      { project_a_id: 'prj_02', project_b_id: 'prj_03', winner_id: 'prj_02', is_tie: 0 },
      { project_a_id: 'prj_03', project_b_id: 'prj_04', winner_id: null, is_tie: 1 },
      { project_a_id: 'prj_04', project_b_id: 'prj_05', winner_id: 'prj_04', is_tie: 0 }
    ];

    const result = calculatePairwiseRanking(comparisons, projectIds);

    // Number of output projects equals input
    assert.equal(result.projects.length, projectIds.length);

    // Ranks are unique 1..N
    const ranks = result.projects.map(p => p.rank);
    assert.deepEqual(ranks, [1, 2, 3, 4, 5]);

    // Every project appears exactly once
    const foundIds = new Set(result.projects.map(p => p.project_id));
    assert.equal(foundIds.size, projectIds.length);
    projectIds.forEach(id => assert.ok(foundIds.has(id)));

    // Wins + losses + ties equals comparisons for every project
    result.projects.forEach(p => {
      assert.equal(p.wins + p.losses + p.ties, p.comparisons);
      assert.ok(Number.isFinite(p.strength));
      assert.ok(Number.isFinite(p.lambda));
      assert.ok(p.strength > 0);
    });

    assert.equal(typeof result.converged, 'boolean');
    assert.ok(Number.isInteger(result.iterations));
    assert.ok(result.iterations >= 0 && result.iterations <= 100);
  });

});
