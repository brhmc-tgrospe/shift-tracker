export interface SwapShiftDetails {
  requesterDates?: { date: string; shift: string; hours?: number }[];
  targetDates?: { date: string; shift: string; hours?: number }[];
}

export interface ShiftData {
  shift: string;
  hours: number;
  notes?: string | null;
}

/**
 * Executes a bidirectional schedule swap between requester and target user across all affected dates.
 */
export const executeShiftSwap = async (
  requesterId: number,
  targetUserId: number,
  details: SwapShiftDetails,
  reason: string,
  sql: any
): Promise<void> => {
  const reqDates = details.requesterDates?.map(d => d.date) || [];
  const tgtDates = details.targetDates?.map(d => d.date) || [];
  const allDates = Array.from(new Set([...reqDates, ...tgtDates])).filter(Boolean);

  if (allDates.length === 0) return;

  // 1. Fetch current shifts for both users across all involved dates
  const existingShifts = await sql`
    SELECT user_id, date, shift, hours, notes
    FROM shifts
    WHERE user_id IN (${requesterId}, ${targetUserId})
      AND date = ANY(${allDates})
  `;

  const requesterShiftMap = new Map<string, ShiftData>();
  const targetShiftMap = new Map<string, ShiftData>();

  for (const row of existingShifts) {
    const data: ShiftData = {
      shift: row.shift,
      hours: Number(row.hours) || 0,
      notes: row.notes,
    };
    if (row.user_id === requesterId) {
      requesterShiftMap.set(row.date, data);
    } else if (row.user_id === targetUserId) {
      targetShiftMap.set(row.date, data);
    }
  }

  // 2. Fetch user names to construct swap notes
  const requesterRows = await sql`SELECT "firstName", "lastName" FROM users WHERE id = ${requesterId}`;
  const targetRows = await sql`SELECT "firstName", "lastName" FROM users WHERE id = ${targetUserId}`;

  let requesterNote = '';
  let targetNote = '';

  if (requesterRows.length > 0 && targetRows.length > 0) {
    const targetName = `${targetRows[0].firstName} ${targetRows[0].lastName}`.trim();
    const requesterName = `${requesterRows[0].firstName} ${requesterRows[0].lastName}`.trim();

    requesterNote = `Swapped with ${targetName}`;
    if (reason && reason.trim()) {
      requesterNote += ` - ${reason.trim()}`;
    }

    targetNote = `Swapped with ${requesterName}`;
  } else {
    requesterNote = reason || '';
    targetNote = '';
  }

  // 3. Swap shifts for every involved date
  for (const date of allDates) {
    const origReq = requesterShiftMap.get(date) ||
      details.requesterDates?.find(d => d.date === date) ||
      { shift: 'free', hours: 0 };

    const origTarget = targetShiftMap.get(date) ||
      details.targetDates?.find(d => d.date === date) ||
      { shift: 'free', hours: 0 };

    const newRequesterShift = origTarget.shift || 'free';
    const newRequesterHours = origTarget.hours !== undefined ? Number(origTarget.hours) : 0;

    const newTargetShift = origReq.shift || 'free';
    const newTargetHours = origReq.hours !== undefined ? Number(origReq.hours) : 0;

    // Requester gets target's shift on this date
    await sql`
      INSERT INTO shifts (user_id, date, shift, hours, notes)
      VALUES (${requesterId}, ${date}, ${newRequesterShift}, ${newRequesterHours}, ${requesterNote})
      ON CONFLICT (user_id, date) DO UPDATE SET shift = EXCLUDED.shift, hours = EXCLUDED.hours, notes = EXCLUDED.notes
    `;

    // Target gets requester's shift on this date
    await sql`
      INSERT INTO shifts (user_id, date, shift, hours, notes)
      VALUES (${targetUserId}, ${date}, ${newTargetShift}, ${newTargetHours}, ${targetNote})
      ON CONFLICT (user_id, date) DO UPDATE SET shift = EXCLUDED.shift, hours = EXCLUDED.hours, notes = EXCLUDED.notes
    `;
  }
};
