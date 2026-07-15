import express from 'express';
import sql from '../db.js';
import { authenticateToken, requireAdminOrDeveloper } from '../auth.js';

const router = express.Router();

// Get current user's requests (outgoing and incoming swaps)
router.get('/me', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  try {
    const rows = await sql`
      SELECT sr.*, 
        u1.username as requester_username, u1."firstName" as "requester_firstName", u1."lastName" as "requester_lastName",
        u2.username as target_username, u2."firstName" as "target_firstName", u2."lastName" as "target_lastName"
      FROM schedule_requests sr
      JOIN users u1 ON sr.requester_id = u1.id
      LEFT JOIN users u2 ON sr.target_user_id = u2.id
      WHERE sr.requester_id = ${user.id} OR sr.target_user_id = ${user.id}
      ORDER BY sr.created_at DESC
    `;
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get all requests (Admin/Developer)
router.get('/', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  try {
    const rows = await sql`
      SELECT sr.*, 
        u1.username as requester_username, u1."firstName" as "requester_firstName", u1."lastName" as "requester_lastName",
        u2.username as target_username, u2."firstName" as "target_firstName", u2."lastName" as "target_lastName"
      FROM schedule_requests sr
      JOIN users u1 ON sr.requester_id = u1.id
      LEFT JOIN users u2 ON sr.target_user_id = u2.id
      WHERE sr.is_archived_by_admin = FALSE
      ORDER BY sr.created_at DESC
    `;
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Submit a new request
router.post('/', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { type, target_user_id, details, reason } = req.body;

  if (!type || !details || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    let targetStatus = null;
    if (type === 'swap') {
      if (!target_user_id) return res.status(400).json({ error: 'target_user_id is required for swap' });
      targetStatus = 'pending';
    }

    const rows = await sql`
      INSERT INTO schedule_requests (type, requester_id, target_user_id, details, reason, target_status, admin_status)
      VALUES (${type}, ${user.id}, ${target_user_id || null}, ${JSON.stringify(details)}, ${reason}, ${targetStatus}, 'pending')
      RETURNING id
    `;

    // Notification for admins
    const adminMessage = `New schedule ${type} request from ${user.firstName} ${user.lastName}`;
    await sql`
      INSERT INTO notifications (user_id, message)
      SELECT id, ${adminMessage} FROM users WHERE role IN ('Admin', 'Developer')
    `;

    // Notification for target user in swap
    if (type === 'swap' && target_user_id) {
      const targetMessage = `${user.firstName} ${user.lastName} has requested to swap schedules with you.`;
      await sql`
        INSERT INTO notifications (user_id, message)
        VALUES (${target_user_id}, ${targetMessage})
      `;
    }

    res.status(201).json({ id: rows[0].id, message: 'Request submitted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Target user accepts/denies swap
router.put('/:id/target', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { status } = req.body; // 'accepted' or 'denied'

  if (status !== 'accepted' && status !== 'denied') {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const requestRows = await sql`SELECT * FROM schedule_requests WHERE id = ${id}`;
    if (requestRows.length === 0) return res.status(404).json({ error: 'Request not found' });
    
    const request = requestRows[0];
    if (request.target_user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (request.type !== 'swap') {
      return res.status(400).json({ error: 'Not a swap request' });
    }
    if (request.target_status !== 'pending') {
      return res.status(400).json({ error: 'Request is already processed by you' });
    }

    let newAdminStatus = request.admin_status;
    let newAdminRemark = request.admin_remark;
    if (status === 'denied') {
        newAdminStatus = 'denied';
        newAdminRemark = 'Auto-denied because target user rejected the swap.';
    }

    await sql`
      UPDATE schedule_requests 
      SET target_status = ${status}, admin_status = ${newAdminStatus}, admin_remark = ${newAdminRemark}
      WHERE id = ${id}
    `;

    // Notify requester
    const msg = `Your swap request has been ${status} by ${user.firstName} ${user.lastName}.`;
    await sql`
      INSERT INTO notifications (user_id, message)
      VALUES (${request.requester_id}, ${msg})
    `;

    res.json({ message: 'Request updated' });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Admin accepts/denies
router.put('/:id/admin', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { status, remark } = req.body; // 'accepted' or 'denied'

  if (status !== 'accepted' && status !== 'denied') {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if (status === 'denied' && !remark) {
    return res.status(400).json({ error: 'Remark is required when denying a request' });
  }

  try {
    const requestRows = await sql`SELECT * FROM schedule_requests WHERE id = ${id}`;
    if (requestRows.length === 0) return res.status(404).json({ error: 'Request not found' });
    
    const request = requestRows[0];
    if (request.admin_status !== 'pending') {
      return res.status(400).json({ error: 'Request is already processed' });
    }
    
    if (request.type === 'swap' && request.target_status === 'pending') {
      return res.status(400).json({ error: 'Cannot process swap until target user accepts/denies' });
    }
    if (request.type === 'swap' && request.target_status === 'denied' && status === 'accepted') {
       return res.status(400).json({ error: 'Cannot accept a swap that was denied by the target user' });
    }

    // Apply shifts if accepted — save reason as notes on affected dates
    if (status === 'accepted') {
      const details = request.details;
      const reasonNote = request.reason || '';
      if (request.type === 'change') {
         if (details.updates) {
           for (const update of details.updates) {
             await sql`
                INSERT INTO shifts (user_id, date, shift, hours, notes)
                VALUES (${request.requester_id}, ${update.date}, ${update.requestedShift}, ${update.hours || 0}, ${reasonNote})
                ON CONFLICT (user_id, date) DO UPDATE SET shift = EXCLUDED.shift, hours = EXCLUDED.hours, notes = EXCLUDED.notes
             `;
           }
         } else if (details.dates) {
           for (const reqDate of details.dates) {
             await sql`
                INSERT INTO shifts (user_id, date, shift, hours, notes)
                VALUES (${request.requester_id}, ${reqDate.date}, ${reqDate.shift}, ${reqDate.hours || 0}, ${reasonNote})
                ON CONFLICT (user_id, date) DO UPDATE SET shift = EXCLUDED.shift, hours = EXCLUDED.hours, notes = EXCLUDED.notes
             `;
           }
         }
      } else if (request.type === 'swap') {
         const requesterRows = await sql`SELECT "firstName", "lastName" FROM users WHERE id = ${request.requester_id}`;
         const targetRows = await sql`SELECT "firstName", "lastName" FROM users WHERE id = ${request.target_user_id}`;
         
         let requesterNote = '';
         let targetNote = '';

         if (requesterRows.length > 0 && targetRows.length > 0) {
           const targetName = `${targetRows[0].firstName} ${targetRows[0].lastName}`;
           const requesterName = `${requesterRows[0].firstName} ${requesterRows[0].lastName}`;
           
           requesterNote = `Swapped with ${targetName}`;
           if (reasonNote) requesterNote += ` - ${reasonNote}`;
           
           targetNote = `Swapped with ${requesterName}`;
         } else {
           requesterNote = reasonNote;
           targetNote = reasonNote;
         }

         for (const tDate of details.targetDates) {
            await sql`
                INSERT INTO shifts (user_id, date, shift, hours, notes)
                VALUES (${request.requester_id}, ${tDate.date}, ${tDate.shift}, ${tDate.hours || 0}, ${requesterNote})
                ON CONFLICT (user_id, date) DO UPDATE SET shift = EXCLUDED.shift, hours = EXCLUDED.hours, notes = EXCLUDED.notes
            `;
         }
         for (const rDate of details.requesterDates) {
            await sql`
                INSERT INTO shifts (user_id, date, shift, hours, notes)
                VALUES (${request.target_user_id}, ${rDate.date}, ${rDate.shift}, ${rDate.hours || 0}, ${targetNote})
                ON CONFLICT (user_id, date) DO UPDATE SET shift = EXCLUDED.shift, hours = EXCLUDED.hours, notes = EXCLUDED.notes
            `;
         }
      }
    }

    await sql`
      UPDATE schedule_requests 
      SET admin_status = ${status}, admin_remark = ${remark || null}
      WHERE id = ${id}
    `;

    // Notify requester
    const msg = `Your ${request.type} request has been ${status} by Admin.`;
    await sql`
      INSERT INTO notifications (user_id, message)
      VALUES (${request.requester_id}, ${msg})
    `;

    if (request.type === 'swap' && request.target_user_id) {
       await sql`
         INSERT INTO notifications (user_id, message)
         VALUES (${request.target_user_id}, ${msg})
       `;
    }

    res.json({ message: 'Request updated' });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// User edits own pending request
router.put('/:id', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { details, reason } = req.body;

  if (!details || !reason) {
    return res.status(400).json({ error: 'Details and reason are required' });
  }

  try {
    const rows = await sql`SELECT * FROM schedule_requests WHERE id = ${id}`;
    if (rows.length === 0) return res.status(404).json({ error: 'Request not found' });

    const request = rows[0];
    if (request.requester_id !== user.id && user.role !== 'Developer') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (request.admin_status !== 'pending' && user.role !== 'Developer') {
      return res.status(400).json({ error: 'Cannot edit a request that is already processed' });
    }

    await sql`
      UPDATE schedule_requests
      SET details = ${JSON.stringify(details)}, reason = ${reason}
      WHERE id = ${id}
    `;

    res.json({ message: 'Request updated' });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Bulk delete requests
router.post('/bulk-delete', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No ids provided' });
  }

  try {
    if (user.role === 'Developer' || user.role === 'Admin') {
      await sql`
        UPDATE schedule_requests 
        SET is_archived_by_admin = TRUE, archived_at = CURRENT_TIMESTAMP 
        WHERE id = ANY(${ids})
      `;
    } else {
      await sql`
        DELETE FROM schedule_requests 
        WHERE id = ANY(${ids}) 
        AND requester_id = ${user.id} 
        AND admin_status != 'accepted'
      `;
    }
    res.json({ message: 'Requests deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// User deletes own request
router.delete('/:id', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  try {
    const rows = await sql`SELECT * FROM schedule_requests WHERE id = ${id}`;
    if (rows.length === 0) return res.status(404).json({ error: 'Request not found' });

    const request = rows[0];
    if (request.requester_id !== user.id && user.role !== 'Developer' && user.role !== 'Admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (request.admin_status === 'accepted' && user.role !== 'Developer' && user.role !== 'Admin') {
      return res.status(400).json({ error: 'Cannot delete an accepted request' });
    }

    if (user.role === 'Developer' || user.role === 'Admin') {
      await sql`
        UPDATE schedule_requests 
        SET is_archived_by_admin = TRUE, archived_at = CURRENT_TIMESTAMP 
        WHERE id = ${id}
      `;
    } else {
      await sql`DELETE FROM schedule_requests WHERE id = ${id}`;
    }
    res.json({ message: 'Request deleted' });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Notifications Endpoints
router.get('/notifications', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  try {
    const rows = await sql`
      SELECT * FROM notifications 
      WHERE user_id = ${user.id} 
      ORDER BY created_at DESC 
      LIMIT 50
    `;
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

router.put('/notifications/:id/read', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  try {
    await sql`UPDATE notifications SET is_read = TRUE WHERE id = ${id} AND user_id = ${user.id}`;
    res.json({ message: 'Notification marked as read' });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

router.put('/notifications/read-all', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  try {
    await sql`UPDATE notifications SET is_read = TRUE WHERE user_id = ${user.id}`;
    res.json({ message: 'All notifications marked as read' });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
