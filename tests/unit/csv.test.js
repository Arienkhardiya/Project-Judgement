import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateResultsCsv } from '../../src/server/services/csv.js';

describe('CSV Generation Service Tests', () => {
  it('generates compliant RFC 4180 CSV with valid header containing commas', () => {
    const mockProjects = [
      {
        rank: 1,
        project_id: 'prj_01',
        title: 'Glass Signal',
        team_name: 'NorthKiln',
        track_id: 'trk_04',
        track_name: 'Security',
        reviews_count: 3,
        raw_avg_score: 4.3333,
        normalized_score: 4.4121,
        final_score: 4.2500,
        submitted_at: '2026-02-27T04:08:00Z',
        repo_url: 'https://example.org/repo/01',
      },
    ];

    const csv = generateResultsCsv(mockProjects);
    const lines = csv.split('\r\n').filter(Boolean);

    assert.ok(lines.length >= 2);
    // Header check
    assert.ok(lines[0].includes(','));
    assert.equal(lines[0], 'rank,project_id,title,team_name,track_id,track_name,reviews_count,raw_avg_score,normalized_score,final_score,submission_time,repo_url');

    // Data row check
    assert.ok(lines[1].includes('Glass Signal'));
    assert.ok(lines[1].includes('NorthKiln'));
  });

  it('escapes fields with commas and double quotes correctly', () => {
    const mockProjects = [
      {
        rank: 1,
        project_id: 'prj_test',
        title: 'Project, with comma and "quotes"',
        team_name: 'Team, Inc.',
        track_id: 'trk_01',
        track_name: 'Developer tools',
        reviews_count: 2,
        raw_avg_score: 4.0,
        normalized_score: 4.0,
        final_score: 4.0,
        submitted_at: '2026-02-28T00:00:00Z',
        repo_url: '',
      },
    ];

    const csv = generateResultsCsv(mockProjects);
    // Double quote must be escaped as "" and wrapped in "..."
    assert.ok(csv.includes('"Project, with comma and ""quotes"""'));
    assert.ok(csv.includes('"Team, Inc."'));
  });
});
