import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Rate limiting map for comment spam prevention
const commentRateLimits = new Map();
const COMMENT_COOLDOWN_MS = process.env.NODE_ENV === 'test' ? 0 : 3000;

function isCommentSpam(userId) {
  const now = Date.now();
  const lastTime = commentRateLimits.get(userId) || 0;
  if (now - lastTime < COMMENT_COOLDOWN_MS) {
    return true;
  }
  commentRateLimits.set(userId, now);
  return false;
}

// 1. GET /api/projects/:projectId/comments - List comments for a project
router.get('/:projectId/comments', (req, res) => {
  const db = getDatabase();
  const { projectId } = req.params;

  const isOrganizer = req.user?.roles?.includes('organizer') || req.user?.roles?.includes('admin');

  // If organizer, show all including flagged; otherwise only unflagged
  let query = `
    SELECT 
      c.id, c.project_id, c.user_id, c.content, c.is_flagged, c.created_at,
      u.name as author_name,
      GROUP_CONCAT(ur.role_id, ', ') as author_roles
    FROM project_comments c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE c.project_id = ?
  `;
  if (!isOrganizer) {
    query += ` AND c.is_flagged = 0`;
  }
  query += ` GROUP BY c.id ORDER BY c.created_at ASC`;

  const comments = db.prepare(query).all(projectId);

  res.json({
    project_id: projectId,
    count: comments.length,
    comments: comments.map(c => ({
      id: c.id,
      project_id: c.project_id,
      content: c.content,
      created_at: c.created_at,
      author: {
        id: c.user_id,
        name: c.author_name,
        roles: c.author_roles ? c.author_roles.split(', ') : []
      },
      is_flagged: Boolean(c.is_flagged),
    }))
  });
});

// 2. POST /api/projects/:projectId/comments - Add constructive community comment
router.post('/:projectId/comments', requireAuth, (req, res) => {
  const db = getDatabase();
  const { projectId } = req.params;
  const { content } = req.body;
  const userId = req.user.id;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Comment content cannot be empty' });
  }

  if (content.trim().length < 3 || content.trim().length > 2000) {
    return res.status(400).json({ error: 'Comment length must be between 3 and 2000 characters' });
  }

  if (isCommentSpam(userId)) {
    return res.status(429).json({ error: 'Please wait a moment before posting another comment.' });
  }

  // Ensure project exists
  const project = db.prepare('SELECT id, status FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const commentId = `cmt_${crypto.randomBytes(8).toString('hex')}`;
  const sanitized = content.trim();

  db.prepare(`
    INSERT INTO project_comments (id, project_id, user_id, content)
    VALUES (?, ?, ?, ?)
  `).run(commentId, projectId, userId, sanitized);

  res.status(201).json({
    message: 'Comment posted successfully',
    comment: {
      id: commentId,
      project_id: projectId,
      content: sanitized,
      author_id: userId,
      author_name: req.user.name,
      created_at: new Date().toISOString()
    }
  });
});

// 3. POST /api/comments/:commentId/flag - Flag comment for moderation
router.post('/flag/:commentId', requireAuth, (req, res) => {
  const db = getDatabase();
  const { commentId } = req.params;

  const comment = db.prepare('SELECT id FROM project_comments WHERE id = ?').get(commentId);
  if (!comment) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  db.prepare('UPDATE project_comments SET is_flagged = 1 WHERE id = ?').run(commentId);

  res.json({ message: 'Comment has been flagged for organizer review', comment_id: commentId });
});

// 4. DELETE /api/comments/:commentId - Delete comment (Author or Organizer/Admin)
router.delete('/:commentId', requireAuth, (req, res) => {
  const db = getDatabase();
  const { commentId } = req.params;

  const comment = db.prepare('SELECT id, user_id FROM project_comments WHERE id = ?').get(commentId);
  if (!comment) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  const isAuthor = comment.user_id === req.user.id;
  const isOrganizer = req.user.roles.includes('organizer') || req.user.roles.includes('admin');

  if (!isAuthor && !isOrganizer) {
    return res.status(403).json({ error: 'Not authorized to delete this comment' });
  }

  db.prepare('DELETE FROM project_comments WHERE id = ?').run(commentId);
  res.json({ message: 'Comment deleted successfully', comment_id: commentId });
});

export default router;
