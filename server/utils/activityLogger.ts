import sql from '../db.js';

export async function logActivity(
  action: string,
  actorId: number,
  targetUserId: number | null,
  details: Record<string, any>
) {
  try {
    if (!process.env.DATABASE_URL) return;
    
    await sql`
      INSERT INTO activity_logs (action, actor_id, target_user_id, details)
      VALUES (${action}, ${actorId}, ${targetUserId}, ${JSON.stringify(details)})
    `;
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}
