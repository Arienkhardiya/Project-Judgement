import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { sessionMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import eventRoutes from './routes/events.js';
import teamRoutes from './routes/teams.js';
import projectRoutes from './routes/projects.js';
import judgingRoutes from './routes/judging.js';
import organizerRoutes from './routes/organizer.js';
import votingRoutes from './routes/voting.js';
import commentRoutes from './routes/comments.js';
import verificationRoutes from './routes/verification.js';
import webhookRoutes from './routes/webhooks.js';
import invitationsRoutes from './routes/invitations.js';
import { getDatabase } from './db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(sessionMiddleware);

  // Serve static assets from public or Vite dist if built
  const distPath = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
  }

  // Health check endpoint for readiness and container monitoring
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/teams', teamRoutes);
  app.use('/api/judge', judgingRoutes);
  app.use('/api/organizer', organizerRoutes);
  app.use('/api', organizerRoutes);
  app.use('/api/voting', votingRoutes);
  app.use('/api/projects', commentRoutes);
  app.use('/api/comments', commentRoutes);
  app.use('/api/verify', verificationRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api/invitations', invitationsRoutes);
  app.use('/', projectRoutes); // Mounts /projects/new, /api/projects, etc.

  // GET /embed/gallery - Embeddable lightweight widget (T4)
  app.get('/embed/gallery', (req, res) => {
    const db = getDatabase();
    const projects = db.prepare(`
      SELECT p.id, p.title, p.summary, t.name as team_name, tr.name as track_name
      FROM projects p
      JOIN teams t ON t.id = p.team_id
      LEFT JOIN tracks tr ON tr.id = p.track_id
      WHERE p.status = 'SUBMITTED'
      LIMIT 12
    `).all();

    const items = projects.map(p => `
      <div style="background:#1e293b; border:1px solid #334155; border-radius:6px; padding:12px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; color:#94a3b8;">
          <span>${escapeHtml(p.track_name || 'General')}</span>
          <span>${escapeHtml(p.team_name)}</span>
        </div>
        <a href="/projects/${p.id}" target="_blank" style="color:#38bdf8; font-weight:bold; font-size:15px; text-decoration:none; display:block; margin:4px 0;">${escapeHtml(p.title)}</a>
        <p style="font-size:13px; color:#cbd5e1; margin:0;">${escapeHtml(p.summary || '')}</p>
      </div>
    `).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:12px;font-family:sans-serif;background:#0f172a;color:#fff;}</style></head><body>${items}</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.send(html);
  });

  // HTML page generator for /projects and /
  function renderGalleryHtml(projects, tracks, currentTrack = null, searchQuery = '') {
    let scriptTags = '';
    let linkTags = '<link rel="stylesheet" href="/styles.css">';
    const distIndexPath = path.resolve(process.cwd(), 'dist', 'index.html');
    if (fs.existsSync(distIndexPath)) {
      const distHtml = fs.readFileSync(distIndexPath, 'utf8');
      const scripts = distHtml.match(/<script[^>]+src="[^"]+"[^>]*><\/script>/g);
      const links = distHtml.match(/<link[^>]+href="[^"]+"[^>]*>/g);
      if (scripts) scriptTags = scripts.join('\n');
      if (links) linkTags = links.join('\n');
    }

    const projectCards = projects.map(p => `
      <article class="project-card" data-project-id="${p.id}" data-track="${p.track_id}">
        <div class="card-header">
          <span class="track-badge">${escapeHtml(p.track_name || 'General')}</span>
          <span class="team-name">${escapeHtml(p.team_name || '')}</span>
        </div>
        <h3 class="project-title"><a href="/projects/${p.id}">${escapeHtml(p.title)}</a></h3>
        <p class="project-summary">${escapeHtml(p.summary || '')}</p>
        <div class="card-footer">
          <span class="status-badge ${p.status.toLowerCase()}">${p.status}</span>
          ${p.repo_url ? `<a href="${escapeHtml(p.repo_url)}" target="_blank" rel="noopener" class="link-btn">Code</a>` : ''}
          ${p.demo_url ? `<a href="${escapeHtml(p.demo_url)}" target="_blank" rel="noopener" class="link-btn">Demo</a>` : ''}
        </div>
      </article>
    `).join('\n');

    const trackOptions = tracks.map(t => `
      <option value="${t.id}" ${currentTrack === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>
    `).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DOGFOOD 2026 - Hackathon Portal</title>
  ${linkTags}
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --primary-hover: #0284c7;
      --success: #10b981;
      --danger: #ef4444;
      --radius: 8px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      min-height: 100vh;
    }
    header {
      background: #0f172a;
      border-bottom: 1px solid var(--border);
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .logo {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--primary);
      text-decoration: none;
      letter-spacing: -0.025em;
    }
    nav { display: flex; gap: 1rem; align-items: center; }
    nav a, nav button {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.9rem;
      padding: 0.5rem 0.75rem;
      border-radius: var(--radius);
      border: 1px solid transparent;
      background: none;
      cursor: pointer;
    }
    nav a:hover, nav button:hover {
      color: var(--text);
      border-color: var(--border);
    }
    .hero {
      padding: 2.5rem 2rem 1.5rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    .hero h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .hero p { color: var(--text-muted); font-size: 1rem; }
    .controls {
      max-width: 1200px;
      margin: 1rem auto 2rem;
      padding: 0 2rem;
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .controls input, .controls select {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.6rem 1rem;
      border-radius: var(--radius);
      font-size: 0.95rem;
    }
    .controls input { flex: 1; min-width: 250px; }
    .gallery-grid {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 2rem 4rem;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.5rem;
    }
    .project-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .project-card:hover {
      border-color: var(--primary);
      transform: translateY(-2px);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.75rem;
      font-size: 0.75rem;
    }
    .track-badge {
      background: #1e3a8a;
      color: #93c5fd;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-weight: 600;
    }
    .team-name { color: var(--text-muted); }
    .project-title {
      font-size: 1.2rem;
      margin-bottom: 0.5rem;
    }
    .project-title a {
      color: var(--text);
      text-decoration: none;
    }
    .project-title a:hover { color: var(--primary); }
    .project-summary {
      color: var(--text-muted);
      font-size: 0.9rem;
      flex: 1;
      margin-bottom: 1rem;
    }
    .card-footer {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border-top: 1px solid var(--border);
      padding-top: 0.75rem;
      font-size: 0.8rem;
    }
    .status-badge {
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .status-badge.submitted { background: #064e3b; color: #6ee7b7; }
    .status-badge.draft { background: #78350f; color: #fde68a; }
    .link-btn {
      color: var(--primary);
      text-decoration: none;
      margin-left: auto;
      font-size: 0.85rem;
    }
    .link-btn:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div id="root">
    <!-- Server-rendered fallback visible immediately to scrapers & run.py -->
    <header>
      <a href="/projects" class="logo">DOGFOOD 2026</a>
      <nav>
        <a href="/projects">Gallery</a>
        <a href="/projects#participant">Participant Portal</a>
      </nav>
    </header>

    <section class="hero">
      <h1>Project Gallery</h1>
      <p>Browse submissions across all hackathon tracks. Filter by track or search by project keywords.</p>
    </section>

    <div class="controls">
      <input type="text" id="searchInput" placeholder="Search projects, summaries, or teams..." value="${escapeHtml(searchQuery)}">
      <select id="trackFilter">
        <option value="">All Tracks</option>
        ${trackOptions}
      </select>
    </div>

    <main class="gallery-grid" id="projectGrid">
      ${projectCards}
    </main>
  </div>

  ${scriptTags}
</body>
</html>`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // GET /projects - Public gallery route tested by run.py
  app.get('/projects', (req, res) => {
    const db = getDatabase();
    const { q, track, format } = req.query;

    if (req.headers.accept?.includes('application/json') || format === 'json') {
      let query = `
        SELECT 
          p.id, p.team_id, p.track_id, p.title, p.summary, p.description,
          p.repo_url, p.demo_url, p.status, p.submitted_at,
          tr.name as track_name, t.name as team_name
        FROM projects p
        JOIN teams t ON t.id = p.team_id
        LEFT JOIN tracks tr ON tr.id = p.track_id
        WHERE p.status = 'SUBMITTED'
      `;
      const params = [];
      if (track) {
        query += ` AND p.track_id = ?`;
        params.push(track);
      }
      if (q) {
        query += ` AND (p.title LIKE ? OR p.summary LIKE ?)`;
        params.push(`%${q}%`, `%${q}%`);
      }
      query += ` ORDER BY p.submitted_at DESC`;
      const projects = db.prepare(query).all(...params);
      return res.json({ projects });
    }

    // Default: render HTML gallery containing fixture project cards
    const projects = db.prepare(`
      SELECT 
        p.id, p.team_id, p.track_id, p.title, p.summary, p.description,
        p.repo_url, p.demo_url, p.status, p.submitted_at,
        tr.name as track_name, t.name as team_name
      FROM projects p
      JOIN teams t ON t.id = p.team_id
      LEFT JOIN tracks tr ON tr.id = p.track_id
      WHERE p.status = 'SUBMITTED'
      ORDER BY p.submitted_at DESC
    `).all();

    const tracks = db.prepare(`SELECT id, name FROM tracks ORDER BY name ASC`).all();

    const html = renderGalleryHtml(projects, tracks, track, q);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  });

  // SPA Deep Link Handler for Invitations, Verifications, and Password Resets
  app.get(['/invite/judge/:token', '/verify-email', '/reset-password'], (req, res) => {
    const distIndexPath = path.resolve(process.cwd(), 'dist', 'index.html');
    if (fs.existsSync(distIndexPath)) {
      return res.sendFile(distIndexPath);
    }
    res.redirect('/projects');
  });

  // GET / - Redirect to /projects
  app.get('/', (req, res) => {
    res.redirect('/projects');
  });

  // GET /projects/:id - Project detail page
  app.get('/projects/:id', (req, res) => {
    const db = getDatabase();
    const project = db.prepare(`
      SELECT 
        p.id, p.team_id, p.track_id, p.title, p.summary, p.description,
        p.repo_url, p.demo_url, p.status, p.submitted_at,
        tr.name as track_name, t.name as team_name, e.name as event_name
      FROM projects p
      JOIN teams t ON t.id = p.team_id
      JOIN events e ON e.id = t.event_id
      LEFT JOIN tracks tr ON tr.id = p.track_id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!project) {
      return res.status(404).send('<h1>Project not found</h1><p><a href="/projects">Back to Gallery</a></p>');
    }

    const members = db.prepare(`
      SELECT u.name, tm.role
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ?
      ORDER BY tm.role DESC
    `).all(project.team_id);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(project.title)} - DOGFOOD 2026</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; max-width: 800px; margin: 0 auto; line-height: 1.6; }
    a { color: #38bdf8; text-decoration: none; }
    .badge { background: #1e3a8a; color: #93c5fd; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 2rem; margin-top: 1.5rem; }
    .members { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #334155; }
    .tag { display: inline-block; background: #334155; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.85rem; margin-right: 0.5rem; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <p><a href="/projects">&larr; Back to Gallery</a></p>
  <div class="card">
    <span class="badge">${escapeHtml(project.track_name || 'General')}</span>
    <h1 style="margin: 0.5rem 0;">${escapeHtml(project.title)}</h1>
    <p style="color: #94a3b8; font-size: 1.1rem; margin-bottom: 1.5rem;">${escapeHtml(project.summary || '')}</p>
    
    <div>
      ${project.repo_url ? `<a href="${escapeHtml(project.repo_url)}" target="_blank" style="margin-right: 1rem;">View Repository &rarr;</a>` : ''}
      ${project.demo_url ? `<a href="${escapeHtml(project.demo_url)}" target="_blank">Live Demo &rarr;</a>` : ''}
    </div>

    <div style="margin-top: 1.5rem;">
      <h3>About this project</h3>
      <p style="white-space: pre-line; color: #cbd5e1; margin-top: 0.5rem;">${escapeHtml(project.description || project.summary || '')}</p>
    </div>

    <div class="members">
      <h4>Team: ${escapeHtml(project.team_name)}</h4>
      <div style="margin-top: 0.5rem;">
        ${members.map(m => `<span class="tag">${escapeHtml(m.name)} (${escapeHtml(m.role)})</span>`).join('')}
      </div>
    </div>
  </div>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  return app;
}

export default createApp;
