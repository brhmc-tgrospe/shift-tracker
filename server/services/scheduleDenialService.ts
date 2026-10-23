import sqlDefault from '../db.js';
import { formatShiftLabelServer } from '../utils/activityLogger.js';

export function formatWeekday(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dateObj = new Date(y, m - 1, d);
      return weekdays[dateObj.getDay()] || '';
    }
  }
  const dateObj = new Date(dateStr);
  return isNaN(dateObj.getTime())
    ? ''
    : dateObj.toLocaleDateString('en-US', { weekday: 'long' });
}

export function buildScheduleDenialNote(
  date: string,
  currentShift: string | undefined | null,
  requestedShift: string | undefined | null,
  remark: string
): string {
  const weekday = formatWeekday(date);
  const weekdayPart = weekday ? ` (${weekday})` : '';
  const currentLabel = formatShiftLabelServer(currentShift);
  const requestedLabel = formatShiftLabelServer(requestedShift);
  const cleanRemark = remark ? remark.trim() : 'No reason provided';
  return `Request ${date}${weekdayPart}: ${currentLabel} → ${requestedLabel} was denied\nReason: ${cleanRemark}`;
}

export function buildSwapDenialNote(
  date: string,
  otherPartyName: string | undefined | null,
  remark: string
): string {
  const weekday = formatWeekday(date);
  const weekdayPart = weekday ? ` (${weekday})` : '';
  const cleanRemark = remark ? remark.trim() : 'No reason provided';
  const targetLabel = otherPartyName && otherPartyName.trim() ? ` with ${otherPartyName.trim()}` : '';
  return `Request ${date}${weekdayPart}: Schedule swap${targetLabel} was denied\nReason: ${cleanRemark}`;
}

export function mergeDenialIntoExistingNotes(
  existingNotes: string | null | undefined,
  date: string,
  newDenialNote: string
): string {
  if (!existingNotes || !existingNotes.trim()) {
    return newDenialNote;
  }
  const trimmed = existingNotes.trim();
  // Regex to match existing denial note for this date (handles multiline reason)
  const pattern = new RegExp(
    `Request ${date}(?: \\([^)]+\\))?: [^\n]+ was denied(?:\nReason: [^\n]*)?`,
    'g'
  );

  if (pattern.test(trimmed)) {
    return trimmed.replace(pattern, newDenialNote).trim();
  }
  return `${trimmed}\n\n${newDenialNote}`;
}

export function removeDenialFromNotes(
  existingNotes: string | null | undefined,
  date: string
): string | null {
  if (!existingNotes || !existingNotes.trim()) {
    return null;
  }
  const pattern = new RegExp(
    `Request ${date}(?: \\([^)]+\\))?: [^\n]+ was denied(?:\nReason: [^\n]*)?`,
    'g'
  );
  const cleaned = existingNotes.replace(pattern, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

export async function recordLineDenialPersonalNote(
  userId: number,
  date: string,
  currentShift: string | undefined | null,
  requestedShift: string | undefined | null,
  remark: string,
  sqlClient: any = sqlDefault
): Promise<void> {
  const existingRows = await sqlClient`
    SELECT shift, hours, notes, public_notes
    FROM shifts
    WHERE user_id = ${userId} AND date = ${date}
  `;

  const existing = existingRows.length > 0 ? existingRows[0] : null;
  const effectiveCurrentShift = currentShift || (existing ? existing.shift : 'free');
  const denialNote = buildScheduleDenialNote(date, effectiveCurrentShift, requestedShift, remark);

  if (existing) {
    const updatedNotes = mergeDenialIntoExistingNotes(existing.notes, date, denialNote);
    await sqlClient`
      UPDATE shifts
      SET notes = ${updatedNotes}
      WHERE user_id = ${userId} AND date = ${date}
    `;
  } else {
    const initialShift = effectiveCurrentShift && effectiveCurrentShift !== 'free' ? effectiveCurrentShift : 'free';
    await sqlClient`
      INSERT INTO shifts (user_id, date, shift, hours, notes, public_notes)
      VALUES (${userId}, ${date}, ${initialShift}, 0, ${denialNote}, NULL)
    `;
  }
}

export async function clearLineDenialPersonalNote(
  userId: number,
  date: string,
  sqlClient: any = sqlDefault
): Promise<void> {
  const existingRows = await sqlClient`
    SELECT shift, hours, notes, public_notes
    FROM shifts
    WHERE user_id = ${userId} AND date = ${date}
  `;

  if (existingRows.length === 0) return;

  const existing = existingRows[0];
  const cleanedNotes = removeDenialFromNotes(existing.notes, date);
  const currentShift = existing.shift;
  const currentHours = Number(existing.hours) || 0;
  const hasPublicNotes = Boolean(existing.public_notes && existing.public_notes.trim());

  if (currentShift === 'free' && currentHours === 0 && !cleanedNotes && !hasPublicNotes) {
    await sqlClient`
      DELETE FROM shifts
      WHERE user_id = ${userId} AND date = ${date}
    `;
  } else {
    await sqlClient`
      UPDATE shifts
      SET notes = ${cleanedNotes}
      WHERE user_id = ${userId} AND date = ${date}
    `;
  }
}

export async function recordSwapDenialPersonalNote(
  userId: number,
  date: string,
  otherPartyName: string | undefined | null,
  remark: string,
  sqlClient: any = sqlDefault
): Promise<void> {
  const existingRows = await sqlClient`
    SELECT shift, hours, notes, public_notes
    FROM shifts
    WHERE user_id = ${userId} AND date = ${date}
  `;

  const existing = existingRows.length > 0 ? existingRows[0] : null;
  const denialNote = buildSwapDenialNote(date, otherPartyName, remark);

  if (existing) {
    const updatedNotes = mergeDenialIntoExistingNotes(existing.notes, date, denialNote);
    await sqlClient`
      UPDATE shifts
      SET notes = ${updatedNotes}
      WHERE user_id = ${userId} AND date = ${date}
    `;
  } else {
    await sqlClient`
      INSERT INTO shifts (user_id, date, shift, hours, notes, public_notes)
      VALUES (${userId}, ${date}, 'free', 0, ${denialNote}, NULL)
    `;
  }
}
