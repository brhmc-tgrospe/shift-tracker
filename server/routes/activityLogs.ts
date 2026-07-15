import express from 'express';
import sql from '../db.js';
import { authenticateToken, requireDeveloper } from '../auth.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireDeveloper);

// Get activity logs with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const offset = (page - 1) * limit;

    const search = req.query.search as string;
    const action = req.query.action as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const rows = await sql`
      SELECT 
        l.id, l.action, l.actor_id, l.target_user_id, l.details, l.created_at,
        u1.username as actor_username, u1."firstName" as actor_firstName, u1."lastName" as actor_lastName,
        u2.username as target_username, u2."firstName" as target_firstName, u2."lastName" as target_lastName,
        COUNT(*) OVER() AS full_count
      FROM activity_logs l
      LEFT JOIN users u1 ON l.actor_id = u1.id
      LEFT JOIN users u2 ON l.target_user_id = u2.id
      WHERE 
        (${action ? sql`l.action = ${action}` : sql`1=1`})
        AND (${startDate ? sql`l.created_at >= ${startDate + ' 00:00:00'}` : sql`1=1`})
        AND (${endDate ? sql`l.created_at <= ${endDate + ' 23:59:59'}` : sql`1=1`})
        AND (${search ? sql`(
          u1.username ILIKE ${'%' + search + '%'} OR 
          u1."firstName" ILIKE ${'%' + search + '%'} OR 
          u1."lastName" ILIKE ${'%' + search + '%'} OR 
          u2.username ILIKE ${'%' + search + '%'} OR 
          u2."firstName" ILIKE ${'%' + search + '%'} OR 
          u2."lastName" ILIKE ${'%' + search + '%'} OR 
          l.action ILIKE ${'%' + search + '%'} OR
          l.details::text ILIKE ${'%' + search + '%'}
        )` : sql`1=1`})
      ORDER BY l.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const total = rows.length > 0 ? Number(rows[0].full_count) : 0;
    
    // Remove full_count from each row before sending
    const data = rows.map(r => {
      const { full_count, ...rest } = r;
      return rest;
    });

    res.json({ data, total, page, limit });
  } catch (error) {
    console.error('Failed to fetch activity logs', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Purge logs between dates
router.delete('/purge', async (req, res) => {
  const { startDate, endDate } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  try {
    // Adding time boundaries to ensure inclusive deletion
    const start = `${startDate} 00:00:00`;
    const end = `${endDate} 23:59:59`;

    const result = await sql`
      DELETE FROM activity_logs 
      WHERE created_at >= ${start} AND created_at <= ${end}
    `;

    res.json({ message: 'Logs purged successfully' });
  } catch (error) {
    console.error('Failed to purge activity logs', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
