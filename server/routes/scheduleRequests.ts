import express from 'express';
import sql from '../db.js';
import { authenticateToken, requireAdminOrDeveloper } from '../auth.js';
import { logActivity } from '../utils/activityLogger.js';
import { executeShiftSwap } from '../services/shiftSwapService.js';
import {
  recordLineDenialPersonalNote,
  clearLineDenialPersonalNote,
  recordSwapDenialPersonalNote
} from '../services/scheduleDenialService.js';

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

    await logActivity('REQUEST_CREATED', user.id, target_user_id || user.id, {
      type,
      details,
      reason,
      requestId: rows[0].id,
      updates: details.updates || details.dates
    });

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

        // Record swap denial personal notes for requester on their swap dates
        const targetName = `${user.firstName} ${user.lastName}`.trim();
        const reqDates = request.details?.requesterDates || [];
        for (const reqItem of reqDates) {
          await recordSwapDenialPersonalNote(
            request.requester_id,
            reqItem.date,
            targetName,
            'Target user rejected the swap.',
            sql
          );
        }
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
  const { status, remark, lineDecisions } = req.body; // 'accepted', 'denied', or granular lineDecisions

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

    const reasonNote = request.reason || '';
    const details = { ...request.details };

    // Case 1: Granular single-line or line-by-line decision for change requests
    if (request.type === 'change' && (req.body.singleLineDecision || (Array.isArray(lineDecisions) && lineDecisions.length > 0))) {
      const single = req.body.singleLineDecision;
      const decisionsList = single ? [single] : lineDecisions;

      const listToUpdate = details.updates || details.dates || [];
      for (const d of decisionsList) {
        if (listToUpdate[d.index]) {
          listToUpdate[d.index].status = d.status;
          if (d.remark) {
            listToUpdate[d.index].remark = d.remark.trim();
          }
        }

        const item = listToUpdate[d.index];
        if (!item) continue;

        // Apply shift if accepted, or record/clear denial personal notes
        if (d.status === 'accepted') {
          // Clear any previous denial note on this date
          await clearLineDenialPersonalNote(request.requester_id, item.date, sql);

          const shiftVal = item.requestedShift || item.shift;
          const shiftHours = item.hours || 0;
          await sql`
            INSERT INTO shifts (user_id, date, shift, hours, notes)
            VALUES (${request.requester_id}, ${item.date}, ${shiftVal}, ${shiftHours}, ${reasonNote})
            ON CONFLICT (user_id, date) DO UPDATE SET shift = EXCLUDED.shift, hours = EXCLUDED.hours, notes = EXCLUDED.notes
          `;
        } else if (d.status === 'denied') {
          const denialRemark = d.remark?.trim() || remark?.trim() || 'No reason provided';
          await recordLineDenialPersonalNote(
            request.requester_id,
            item.date,
            item.currentShift,
            item.requestedShift || item.shift,
            denialRemark,
            sql
          );
        } else if (d.status === 'pending') {
          // If reset back to pending, remove denial note from this date
          await clearLineDenialPersonalNote(request.requester_id, item.date, sql);
        }
      }

      const totalCount = listToUpdate.length;
      const acceptedCount = listToUpdate.filter((u: any) => u.status === 'accepted').length;
      const deniedCount = listToUpdate.filter((u: any) => u.status === 'denied').length;
      const isFullyDecided = (acceptedCount + deniedCount) === totalCount;

      let finalAdminStatus: 'pending' | 'accepted' | 'denied' | 'partially_accepted';
      if (!isFullyDecided) {
        finalAdminStatus = 'pending';
      } else if (acceptedCount === totalCount) {
        finalAdminStatus = 'accepted';
      } else if (deniedCount === totalCount) {
        finalAdminStatus = 'denied';
      } else {
        finalAdminStatus = 'partially_accepted';
      }

      const combinedRemark = remark?.trim() || single?.remark?.trim() || request.admin_remark || null;

      await sql`
        UPDATE schedule_requests 
        SET admin_status = ${finalAdminStatus}, admin_remark = ${combinedRemark}, details = ${JSON.stringify(details)}
        WHERE id = ${id}
      `;

      if (isFullyDecided) {
        // Notify requester
        let msg = '';
        if (finalAdminStatus === 'accepted') {
          msg = `Your schedule change request has been accepted by Admin.`;
        } else if (finalAdminStatus === 'denied') {
          msg = `Your schedule change request has been denied by Admin.`;
        } else {
          msg = `Your schedule change request has been partially approved (${acceptedCount}/${totalCount} days) by Admin.`;
        }

        await sql`
          INSERT INTO notifications (user_id, message)
          VALUES (${request.requester_id}, ${msg})
        `;

        const actionName = finalAdminStatus === 'accepted'
          ? 'REQUEST_ACCEPTED'
          : finalAdminStatus === 'denied'
          ? 'REQUEST_DENIED'
          : 'REQUEST_PARTIALLY_ACCEPTED';

        await logActivity(
          actionName,
          user.id,
          request.requester_id,
          {
            requestId: id,
            type: request.type,
            admin_status: finalAdminStatus,
            remark: combinedRemark,
            acceptedCount,
            deniedCount,
            updates: details.updates || details.dates
          }
        );
      } else {
        await logActivity(
          'REQUEST_LINE_DECISION',
          user.id,
          request.requester_id,
          {
            requestId: id,
            type: request.type,
            singleDecision: single,
            acceptedCount,
            deniedCount,
            totalCount
          }
        );
      }

      return res.json({ message: 'Line decision saved', admin_status: finalAdminStatus, details });
    }

    // Case 2: Whole request accept / deny (e.g. Swaps or legacy fallback)
    if (status !== 'accepted' && status !== 'denied') {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (status === 'denied' && (!remark || !remark.trim())) {
      return res.status(400).json({ error: 'Remark is required when denying a request' });
    }

    const cleanRemark = remark?.trim() || '';

    if (details.updates) {
      details.updates.forEach((u: any) => {
        u.status = status;
        if (status === 'denied' && cleanRemark) {
          u.remark = cleanRemark;
        }
      });
    } else if (details.dates) {
      details.dates.forEach((d: any) => {
        d.status = status;
        if (status === 'denied' && cleanRemark) {
          d.remark = cleanRemark;
        }
      });
    }

    // Apply shifts if accepted, or record denial personal notes
    if (status === 'accepted') {
      if (request.type === 'change') {
         if (details.updates) {
           for (const update of details.updates) {
             await clearLineDenialPersonalNote(request.requester_id, update.date, sql);
             await sql`
                INSERT INTO shifts (user_id, date, shift, hours, notes)
                VALUES (${request.requester_id}, ${update.date}, ${update.requestedShift}, ${update.hours || 0}, ${reasonNote})
                ON CONFLICT (user_id, date) DO UPDATE SET shift = EXCLUDED.shift, hours = EXCLUDED.hours, notes = EXCLUDED.notes
             `;
           }
         } else if (details.dates) {
           for (const reqDate of details.dates) {
             await clearLineDenialPersonalNote(request.requester_id, reqDate.date, sql);
             await sql`
                INSERT INTO shifts (user_id, date, shift, hours, notes)
                VALUES (${request.requester_id}, ${reqDate.date}, ${reqDate.shift}, ${reqDate.hours || 0}, ${reasonNote})
                ON CONFLICT (user_id, date) DO UPDATE SET shift = EXCLUDED.shift, hours = EXCLUDED.hours, notes = EXCLUDED.notes
             `;
           }
         }
      } else if (request.type === 'swap') {
          await executeShiftSwap(
            request.requester_id,
            request.target_user_id,
            details,
            request.reason || '',
            sql
          );
      }
    } else if (status === 'denied') {
      const denialRemark = cleanRemark || 'No reason provided';
      if (request.type === 'change') {
        const updateList = details.updates || details.dates || [];
        for (const item of updateList) {
          await recordLineDenialPersonalNote(
            request.requester_id,
            item.date,
            item.currentShift,
            item.requestedShift || item.shift,
            denialRemark,
            sql
          );
        }
      } else if (request.type === 'swap') {
        const targetUserRows = await sql`SELECT "firstName", "lastName" FROM users WHERE id = ${request.target_user_id}`;
        const requesterUserRows = await sql`SELECT "firstName", "lastName" FROM users WHERE id = ${request.requester_id}`;
        const targetName = targetUserRows.length > 0 ? `${targetUserRows[0].firstName} ${targetUserRows[0].lastName}`.trim() : '';
        const requesterName = requesterUserRows.length > 0 ? `${requesterUserRows[0].firstName} ${requesterUserRows[0].lastName}`.trim() : '';

        if (details.requesterDates) {
          for (const reqItem of details.requesterDates) {
            await recordSwapDenialPersonalNote(
              request.requester_id,
              reqItem.date,
              targetName,
              denialRemark,
              sql
            );
          }
        }
        if (details.targetDates && request.target_user_id) {
          for (const tgtItem of details.targetDates) {
            await recordSwapDenialPersonalNote(
              request.target_user_id,
              tgtItem.date,
              requesterName,
              denialRemark,
              sql
            );
          }
        }
      }
    }

    await sql`
      UPDATE schedule_requests 
      SET admin_status = ${status}, admin_remark = ${remark?.trim() || null}, details = ${JSON.stringify(details)}
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

    await logActivity(
      status === 'accepted' ? 'REQUEST_ACCEPTED' : 'REQUEST_DENIED',
      user.id,
      request.requester_id,
      {
        requestId: id,
        type: request.type,
        admin_status: status,
        remark: remark?.trim(),
        updates: details.updates || details.dates || (request.type === 'swap' ? { requesterDates: details.requesterDates, targetDates: details.targetDates } : undefined)
      }
    );

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
