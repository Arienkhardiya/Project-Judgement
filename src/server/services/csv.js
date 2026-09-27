/**
 * RFC 4180 Compliant CSV Formatter
 */

export function escapeCsvField(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') return String(val);

  let str = String(val);

  // CSV Formula Injection Defense (CWE-1236):
  // Spreadsheet applications (Excel, Calc) execute formulas if a cell starts with =, +, -, @, \t, or \r.
  // Prepending a single quote neutralizes formula execution.
  if (/^[=\+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // RFC 4180 escaping
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateResultsCsv(projects) {
  const headers = [
    'rank',
    'project_id',
    'title',
    'team_name',
    'track_id',
    'track_name',
    'reviews_count',
    'raw_avg_score',
    'normalized_score',
    'final_score',
    'submission_time',
    'repo_url',
  ];

  const lines = [headers.join(',')];

  for (const p of projects) {
    const row = [
      p.rank,
      p.project_id,
      p.title,
      p.team_name,
      p.track_id,
      p.track_name,
      p.reviews_count,
      p.raw_avg_score,
      p.normalized_score,
      p.final_score,
      p.submitted_at || '',
      p.repo_url || '',
    ];
    lines.push(row.map(escapeCsvField).join(','));
  }

  return lines.join('\r\n') + '\r\n';
}

export default {
  generateResultsCsv,
};
