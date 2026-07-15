import express from 'express';
import sql from '../db.js';
import { authenticateToken, requireDeveloper } from '../auth.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireDeveloper);

// Get all activity logs
router.get('/', async (req, res) => {
  try {
    const rows = await sql`
      SELECT 
        l.id, l.action, l.actor_id, l.target_user_id, l.details, l.created_at,
        u1.username as actor_username, u1."firstName" as actor_firstName, u1."lastName" as actor_lastName,
        u2.username as target_username, u2."firstName" as target_firstName, u2."lastName" as target_lastName
      FROM activity_logs l
      LEFT JOIN users u1 ON l.actor_id = u1.id
      LEFT JOIN users u2 ON l.target_user_id = u2.id
      ORDER BY l.created_at DESC
    `;
    res.json(rows);
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
