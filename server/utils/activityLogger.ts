import sql from '../db.js';

export function formatShiftLabelServer(shiftKey: string | undefined | null): string {
  if (!shiftKey) return 'Day Off';
  const clean = String(shiftKey).trim().toLowerCase();
  if (clean === 'off' || clean === 'free') return 'Day Off';
  if (clean === '8h') return '8am-5pm';
  if (clean === '12h-m') return '12h Morning';
  if (clean === '12h-e') return '12h Evening';
  if (clean === '12h') return '12h Shift';
  if (clean === 'holiday') return 'Holiday';
  if (clean === 'on-leave') return 'On-Leave';
  if (clean === 'absent') return 'Absent';
  if (clean === 'n/a') return 'N/A';
  return shiftKey;
}

export const formatLogShiftServer = formatShiftLabelServer;

export function formatLogDateServer(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    }
  }
  const dateObj = new Date(dateStr);
  return isNaN(dateObj.getTime())
    ? dateStr
    : dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export function formatShiftChangeServer(
  dateStr: string,
  oldShift: string | undefined | null,
  newShift: string | undefined | null
): string {
  const dateFormatted = formatLogDateServer(dateStr);
  const oldLabel = formatShiftLabelServer(oldShift);
  const newLabel = formatShiftLabelServer(newShift);
  return `${dateFormatted} from ${oldLabel} to ${newLabel}`;
}

export async function logActivity(
  action: string,
  actorId: number,
  targetUserId: number | null,
  details: Record<string, any>
) {
  try {
    if (!process.env.DATABASE_URL) return;

    const enrichedDetails = { ...details };

    // Format single shift change
    if (enrichedDetails.date && (enrichedDetails.oldShift !== undefined || enrichedDetails.newShift !== undefined)) {
      enrichedDetails.formatted = formatShiftChangeServer(
        enrichedDetails.date,
        enrichedDetails.oldShift,
        enrichedDetails.newShift
      );
    }

    // Format top-level updates array
    if (Array.isArray(enrichedDetails.updates)) {
      enrichedDetails.updates = enrichedDetails.updates.map((u: any) => ({
        ...u,
        formatted: formatShiftChangeServer(
          u.date,
          u.oldShift ?? u.currentShift,
          u.newShift ?? u.requestedShift
        )
      }));
      if (!enrichedDetails.formatted) {
        enrichedDetails.formatted = enrichedDetails.updates.map((u: any) => u.formatted).join('; ');
      }
      if (!targetUserId && enrichedDetails.updates.length > 0) {
        const uniqueUsers = Array.from(new Set(enrichedDetails.updates.map((u: any) => u.userId).filter(Boolean)));
        if (uniqueUsers.length === 1) {
          targetUserId = uniqueUsers[0] as number;
        }
      }
    }

    // Format nested updates array (common in request creation)
    if (enrichedDetails.details && Array.isArray(enrichedDetails.details.updates)) {
      enrichedDetails.details.updates = enrichedDetails.details.updates.map((u: any) => ({
        ...u,
        formatted: formatShiftChangeServer(
          u.date,
          u.currentShift ?? u.oldShift,
          u.requestedShift ?? u.newShift
        )
      }));
      if (!enrichedDetails.formatted) {
        enrichedDetails.formatted = enrichedDetails.details.updates.map((u: any) => u.formatted).join('; ');
      }
    }

    if (action === 'DUPLICATE_SHIFT_UPDATE' && enrichedDetails.sourceMonth && enrichedDetails.targetMonth) {
      enrichedDetails.formatted = `Duplicated ${enrichedDetails.duplicatedCount || 0} shifts from ${enrichedDetails.sourceMonth} to ${enrichedDetails.targetMonth}`;
    }
    
    await sql`
      INSERT INTO activity_logs (action, actor_id, target_user_id, details)
      VALUES (${action}, ${actorId}, ${targetUserId}, ${JSON.stringify(enrichedDetails)})
    `;
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

