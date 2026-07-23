import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import sql, { initDB } from './db.js';
import { JWT_SECRET, authenticateToken, requireDeveloper, requireAdminOrDeveloper } from './auth.js';
import scheduleRequestsRouter from './routes/scheduleRequests.js';
import activityLogsRouter from './routes/activityLogs.js';
import { logActivity } from './utils/activityLogger.js';

const app = express();
app.use(cors());
app.use(express.json());


let dbInitialized = false;

async function cleanupArchivedRequests() {
  if (!process.env.DATABASE_URL) return;
  try {
    const result = await sql`
      DELETE FROM schedule_requests 
      WHERE is_archived_by_admin = TRUE 
      AND archived_at < NOW() - INTERVAL '30 days'
    `;
    if (result && (result as any).count > 0) {
       console.log(`Cleaned up ${(result as any).count} old archived schedule requests`);
    }
  } catch (error) {
    console.error('Error cleaning up archived requests:', error);
  }
}

app.use(async (req, res, next) => {
  if (!dbInitialized) {
    await initDB();
    dbInitialized = true;
    cleanupArchivedRequests(); // Fire and forget
  }
  next();
});

// Run it once every 24 hours if the server stays alive
setInterval(cleanupArchivedRequests, 24 * 60 * 60 * 1000);

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, firstName, lastName, department_id } = req.body;
  if (!username || !password || !firstName || !lastName) {
    return res.status(400).json({ error: 'Username, password, first name, and last name are required' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const rows = await sql`
      INSERT INTO users (username, email, password, "firstName", "lastName", role, department_id) 
      VALUES (${username}, ${email || null}, ${hash}, ${firstName}, ${lastName}, 'User', ${department_id || null})
      RETURNING id
    `;
    
    res.status(201).json({ id: rows[0].id, message: 'User created successfully' });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/debug-db', (req, res) => {
  res.json({ dbUrl: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'undefined' });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Identifier and password are required' });
  }

  try {
    const rows = await sql`SELECT * FROM users WHERE username = ${identifier} OR email = ${identifier}`;
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, firstName: user.firstName, lastName: user.lastName }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, firstName: user.firstName, lastName: user.lastName, username_changed: user.username_changed } });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message, cause: error.cause ? String(error.cause) : undefined });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  const tokenUser = (req as any).user;
  try {
    const rows = await sql`SELECT id, username, email, "firstName", "lastName", role, department_id, username_changed FROM users WHERE id = ${tokenUser.id}`;
    const user = rows[0];
    if (!user) return res.sendStatus(404);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update own profile
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { email, password, firstName, lastName, username } = req.body;
  try {
    const userRow = await sql`SELECT username, username_changed FROM users WHERE id = ${user.id}`;
    if (!userRow.length) return res.status(404).json({ error: 'User not found' });
    
    let setUsernameChanged = false;
    let newUsername = userRow[0].username;
    
    if (username && username !== userRow[0].username) {
      if (userRow[0].username_changed) {
        return res.status(403).json({ error: 'You have already changed your username once.' });
      }
      newUsername = username;
      setUsernameChanged = true;
    }

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await sql`UPDATE users SET username = ${newUsername}, username_changed = ${setUsernameChanged || userRow[0].username_changed}, email = ${email || null}, password = ${hash}, "firstName" = ${firstName}, "lastName" = ${lastName} WHERE id = ${user.id}`;
    } else {
      await sql`UPDATE users SET username = ${newUsername}, username_changed = ${setUsernameChanged || userRow[0].username_changed}, email = ${email || null}, "firstName" = ${firstName}, "lastName" = ${lastName} WHERE id = ${user.id}`;
    }
    
    // Fetch updated user
    const rows = await sql`SELECT id, username, email, "firstName", "lastName", role, username_changed FROM users WHERE id = ${user.id}`;
    res.json(rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Impersonate user (Developer Only)
app.post('/api/auth/impersonate', authenticateToken, requireDeveloper, async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const rows = await sql`SELECT id, username, email, "firstName", "lastName", role, username_changed FROM users WHERE id = ${userId}`;
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'Admin') {
      return res.status(403).json({ error: 'Cannot impersonate an Admin' });
    }

    const token = jwt.sign({ 
      id: user.id, 
      username: user.username, 
      role: user.role, 
      firstName: user.firstName, 
      lastName: user.lastName 
    }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User Management (Developer and Admin)

// Get all users (public, read-only view)
app.get('/api/public/users', authenticateToken, async (req, res) => {
  try {
    const rows = await sql`
      SELECT u.id, u.username, u."firstName", u."lastName", u.department_id, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role NOT IN ('Admin', 'Developer')
    `;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get public users (for swapping)
app.get('/api/users/public', authenticateToken, async (req, res) => {
  try {
    const rows = await sql`
      SELECT id, "firstName", "lastName"
      FROM users
      WHERE role = 'User'
    `;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.get('/api/users', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  try {
    const user = (req as any).user;
    const { search, role, department, sortBy = 'firstName', sortDir = 'asc' } = req.query;

    let query = sql`
      SELECT u.id, u.username, u.email, u."firstName", u."lastName", u.role, u.department_id, u.username_changed, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE 1=1
    `;

    if (user.role === 'Admin') {
      query = sql`${query} AND u.role != 'Developer'`;
    }

    if (role && role !== 'All') {
      query = sql`${query} AND u.role = ${role as string}`;
    }

    if (department && department !== 'All') {
      query = sql`${query} AND d.name = ${department as string}`;
    }

    if (search) {
      const searchStr = `%${search as string}%`;
      query = sql`${query} AND (
        u.username ILIKE ${searchStr} OR 
        u."firstName" ILIKE ${searchStr} OR 
        u."lastName" ILIKE ${searchStr} OR 
        d.name ILIKE ${searchStr}
      )`;
    }

    // Sorting
    const allowedSortColumns: Record<string, string> = {
      'firstName': 'u."firstName"',
      'lastName': 'u."lastName"'
    };
    const sortColumn = allowedSortColumns[sortBy as string] || 'u."firstName"';
    const sortDirection = sortDir === 'desc' ? 'DESC' : 'ASC';

    query = sql`${query} ORDER BY ${sql.unsafe(sortColumn)} ${sql.unsafe(sortDirection)}`;

    const rows = await query;
    res.json(rows);
  } catch (error) {
    console.error('Error in GET /api/users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create user
app.post('/api/users', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  const { username, email, password, firstName, lastName, role, department_id } = req.body;
  const user = (req as any).user;
  
  if (user.role === 'Admin' && (role === 'Admin' || role === 'Developer')) {
    return res.status(403).json({ error: 'Admins cannot create Admin or Developer accounts' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const rows = await sql`
      INSERT INTO users (username, email, password, "firstName", "lastName", role, department_id) 
      VALUES (${username}, ${email || null}, ${hash}, ${firstName}, ${lastName}, ${role || 'User'}, ${department_id || null})
      RETURNING id
    `;
    res.status(201).json({ id: rows[0].id, message: 'User created' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update user
app.put('/api/users/:id', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  const { id } = req.params;
  const { username, email, password, firstName, lastName, role, department_id, reset_username_changed } = req.body;
  const currentUser = (req as any).user;
  
  try {
    const targetUser = await sql`SELECT role, username_changed FROM users WHERE id = ${id}`;
    
    if (currentUser.role === 'Admin') {
      if (targetUser.length > 0 && (targetUser[0].role === 'Admin' || targetUser[0].role === 'Developer')) {
        return res.status(403).json({ error: 'Admins cannot edit Admin or Developer accounts' });
      }
      if (role === 'Admin' || role === 'Developer') {
         return res.status(403).json({ error: 'Admins cannot upgrade a user to Admin or Developer' });
      }
    }

    const newUsernameChanged = reset_username_changed ? false : targetUser[0]?.username_changed;

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await sql`UPDATE users SET username = ${username}, email = ${email || null}, password = ${hash}, "firstName" = ${firstName}, "lastName" = ${lastName}, role = ${role}, department_id = ${department_id || null}, username_changed = ${newUsernameChanged} WHERE id = ${id}`;
    } else {
      await sql`UPDATE users SET username = ${username}, email = ${email || null}, "firstName" = ${firstName}, "lastName" = ${lastName}, role = ${role}, department_id = ${department_id || null}, username_changed = ${newUsernameChanged} WHERE id = ${id}`;
    }
    res.json({ message: 'User updated' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete user
app.delete('/api/users/:id', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  const { id } = req.params;
  const currentUser = (req as any).user;
  
  try {
    if (parseInt(id) === currentUser.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    
    const targetUser = await sql`SELECT role FROM users WHERE id = ${id}`;
    if (targetUser.length > 0 && targetUser[0].role === 'Developer') {
      return res.status(403).json({ error: 'Developer accounts cannot be deleted via the application' });
    }

    if (currentUser.role === 'Admin') {
      if (targetUser.length > 0 && targetUser[0].role === 'Admin') {
        return res.status(403).json({ error: 'Admins cannot delete Admin accounts' });
      }
    }

    await sql`DELETE FROM users WHERE id = ${id}`;
    res.json({ message: 'User deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Bulk create users (Admin/Developer only)
app.post('/api/users/bulk', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  const { users: bulkUsers } = req.body;
  const currentUser = (req as any).user;
  
  if (!Array.isArray(bulkUsers)) {
    return res.status(400).json({ error: 'Expected users array' });
  }

  // Fetch departments to map names to IDs
  const departmentsRows = await sql`SELECT id, name FROM departments`;
  const depMap = new Map(departmentsRows.map((d: any) => [d.name.toLowerCase().trim(), d.id]));

  const results = {
    success: 0,
    errors: [] as string[]
  };

  for (let i = 0; i < bulkUsers.length; i++) {
    const u = bulkUsers[i];
    const rowNum = i + 1; // 1-indexed for user display

    if (!u.username || !u.firstName || !u.lastName || !u.password) {
      results.errors.push(`Row ${rowNum}: Missing required fields (username, firstName, lastName, password).`);
      continue;
    }

    let parsedRole = 'User';
    if (u.role) {
      const lowerRole = u.role.toLowerCase().trim();
      if (lowerRole === 'admin') parsedRole = 'Admin';
      else if (lowerRole === 'developer') parsedRole = 'Developer';
      else parsedRole = 'User'; // Fallback to User for unrecognized strings
    }

    if (currentUser.role === 'Admin' && (parsedRole === 'Admin' || parsedRole === 'Developer')) {
      results.errors.push(`Row ${rowNum} (${u.username}): Admins cannot create Admin or Developer accounts.`);
      continue;
    }

    let depId = null;
    if (u.department) {
      const foundId = depMap.get(u.department.toLowerCase().trim());
      if (foundId) {
        depId = foundId;
      } else {
        results.errors.push(`Row ${rowNum} (${u.username}): Department "${u.department}" not found.`);
        continue;
      }
    }

    try {
      const hash = await bcrypt.hash(u.password, 10);
      await sql`
        INSERT INTO users (username, email, password, "firstName", "lastName", role, department_id) 
        VALUES (${u.username}, ${u.email || null}, ${hash}, ${u.firstName}, ${u.lastName}, ${parsedRole}, ${depId})
      `;
      results.success++;
    } catch (error: any) {
      if (error.code === '23505') { // unique violation
        results.errors.push(`Row ${rowNum} (${u.username}): Username or email already exists.`);
      } else {
        results.errors.push(`Row ${rowNum} (${u.username}): Database error ${error.message}`);
      }
    }
  }

  res.json(results);
});

// Departments Endpoints

app.get('/api/departments', async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM departments ORDER BY name ASC`;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/departments', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const rows = await sql`INSERT INTO departments (name) VALUES (${name}) RETURNING *`;
    res.status(201).json(rows[0]);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/departments/:id', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    await sql`UPDATE departments SET name = ${name} WHERE id = ${id}`;
    res.json({ message: 'Department updated' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/departments/:id', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  const { id } = req.params;
  try {
    await sql`DELETE FROM departments WHERE id = ${id}`;
    res.json({ message: 'Department deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Shifts Endpoints

// Get shifts for current user
app.get('/api/shifts', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  try {
    const rows = await sql`SELECT date, shift, hours, notes FROM shifts WHERE user_id = ${user.id}`;
    const dayDataMap: Record<string, any> = {};
    for (const shift of rows) {
      dayDataMap[shift.date] = shift;
    }
    res.json(dayDataMap);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/:id/shifts', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await sql`SELECT date, shift, hours, notes FROM shifts WHERE user_id = ${id}`;
    const dayDataMap: Record<string, any> = {};
    for (const shift of rows) {
      dayDataMap[shift.date] = shift;
    }
    res.json(dayDataMap);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all shifts (public, read-only view)
app.get('/api/public/shifts', authenticateToken, async (req, res) => {
  const { month } = req.query; // YYYY-MM
  try {
    const rows = await sql`
      SELECT s.user_id, s.date, s.shift, s.hours, s.notes 
      FROM shifts s
      JOIN users u ON s.user_id = u.id
      WHERE s.date LIKE ${month + '%'} AND u.role NOT IN ('Admin', 'Developer')
    `;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all shifts (for Monthly Grid, Admin/Developer only)
app.get('/api/shifts/all', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  const { month } = req.query; // YYYY-MM
  try {
    const rows = await sql`
      SELECT user_id, date, shift, hours, notes 
      FROM shifts 
      WHERE date LIKE ${month + '%'}
    `;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update notes ONLY for a specific shift (safe for standard users)
app.put('/api/shifts/notes', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { date, notes } = req.body;
  
  if (!date) {
    return res.status(400).json({ error: 'Missing required field: date' });
  }

  try {
    // Upsert but ONLY for notes. If shift doesn't exist, we default to 'free' / 0 hours to hold the note.
    await sql`
      INSERT INTO shifts (user_id, date, shift, hours, notes)
      VALUES (${user.id}, ${date}, 'free', 0, ${notes || ''})
      ON CONFLICT (user_id, date) DO UPDATE SET
        notes = EXCLUDED.notes
    `;
    res.json({ message: 'Notes updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update or delete shift for current user
app.post('/api/shifts', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { date, shift, hours, notes } = req.body;
  
  if (!date || !shift || hours === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (user.role === 'User') {
    return res.status(403).json({ error: 'Users cannot directly edit their schedules. Please submit a schedule request instead.' });
  }

  try {
    if (shift === 'free' && hours === 0) {
      const oldRows = await sql`SELECT shift FROM shifts WHERE user_id = ${user.id} AND date = ${date}`;
      const oldShift = oldRows.length > 0 ? oldRows[0].shift : 'free';
      await sql`DELETE FROM shifts WHERE user_id = ${user.id} AND date = ${date}`;
      
      if (oldShift !== 'free') {
        await logActivity('SHIFT_UPDATED', user.id, user.id, { date, oldShift, newShift: 'free' });
      }
    } else {
      const oldRows = await sql`SELECT shift FROM shifts WHERE user_id = ${user.id} AND date = ${date}`;
      const oldShift = oldRows.length > 0 ? oldRows[0].shift : 'free';
      
      await sql`
        INSERT INTO shifts (user_id, date, shift, hours, notes)
        VALUES (${user.id}, ${date}, ${shift}, ${hours}, ${notes || ''})
        ON CONFLICT (user_id, date) DO UPDATE SET
          shift = EXCLUDED.shift,
          hours = EXCLUDED.hours,
          notes = EXCLUDED.notes
      `;
      
      if (oldShift !== shift) {
        await logActivity('SHIFT_UPDATED', user.id, user.id, { date, oldShift, newShift: shift });
      }
    }
    res.json({ message: 'Shift updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk upsert shifts (Admin/Developer only)
app.post('/api/shifts/bulk', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  const { shifts } = req.body; // Array of { user_id, date, shift, hours, notes }
  if (!Array.isArray(shifts)) {
    return res.status(400).json({ error: 'Expected shifts array' });
  }

  const user = (req as any).user;

  try {
    for (const s of shifts) {
      const oldRows = await sql`SELECT shift FROM shifts WHERE user_id = ${s.user_id} AND date = ${s.date}`;
      const oldShift = oldRows.length > 0 ? oldRows[0].shift : 'free';

      if (s.shift === 'free' && s.hours === 0) {
        await sql`DELETE FROM shifts WHERE user_id = ${s.user_id} AND date = ${s.date}`;
      } else {
        await sql`
          INSERT INTO shifts (user_id, date, shift, hours, notes)
          VALUES (${s.user_id}, ${s.date}, ${s.shift}, ${s.hours}, ${s.notes || ''})
          ON CONFLICT (user_id, date) DO UPDATE SET
            shift = EXCLUDED.shift,
            hours = EXCLUDED.hours,
            notes = EXCLUDED.notes
        `;
      }
      
      if (oldShift !== s.shift) {
        await logActivity('BULK_SHIFT_UPDATE', user.id, s.user_id, { date: s.date, oldShift, newShift: s.shift });
      }
    }
    res.json({ message: 'Bulk shifts updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard Metrics Endpoint
app.get('/api/dashboard/metrics', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  const today = (req.query.date as string) || new Date().toISOString().split('T')[0];
  try {
    const rows = await sql`
      SELECT 
        u.id, u.username, u."firstName", u."lastName", u.department_id, 
        d.name as department_name,
        s.shift, s.hours, s.notes
      FROM users u
      LEFT JOIN shifts s ON u.id = s.user_id AND s.date = ${today}
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role NOT IN ('Admin', 'Developer')
    `;
    
    const working: any[] = [];
    const dayOff: any[] = [];
    const onLeave: any[] = [];
    
    for (const row of rows) {
      if (!row.shift || row.shift === 'free' || row.shift === 'off') {
        dayOff.push(row);
      } else if (row.shift === 'on-leave') {
        onLeave.push(row);
      } else if (row.shift !== 'N/A') {
        working.push(row);
      }
    }
    
    res.json({
      working: { count: working.length, users: working },
      dayOff: { count: dayOff.length, users: dayOff },
      onLeave: { count: onLeave.length, users: onLeave }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Duplicate Shifts Endpoint
app.post('/api/shifts/duplicate', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  const user = (req as any).user;
  const { userId, sourceMonth, targetMonth } = req.body;
  if (!userId || !sourceMonth || !targetMonth) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [targetYearStr, targetMonthStr] = targetMonth.split('-');
    const targetYear = parseInt(targetYearStr, 10);
    const targetMonthNum = parseInt(targetMonthStr, 10);
    const daysInTargetMonth = new Date(targetYear, targetMonthNum, 0).getDate();

    const sourceShifts = await sql`
      SELECT date, shift, hours, notes 
      FROM shifts 
      WHERE user_id = ${userId} AND date LIKE ${sourceMonth + '%'}
    `;

    const newShifts = [];
    for (const shift of sourceShifts) {
      const dayStr = shift.date.split('-')[2];
      const dayNum = parseInt(dayStr, 10);
      if (dayNum <= daysInTargetMonth) {
        const targetDate = `${targetMonth}-${dayStr}`;
        newShifts.push({ ...shift, date: targetDate });
      }
    }

    if (newShifts.length > 0) {
      for (const s of newShifts) {
        const oldRows = await sql`SELECT shift FROM shifts WHERE user_id = ${userId} AND date = ${s.date}`;
        const oldShift = oldRows.length > 0 ? oldRows[0].shift : 'free';

        if (s.shift === 'free' && s.hours === 0) {
          await sql`DELETE FROM shifts WHERE user_id = ${userId} AND date = ${s.date}`;
        } else {
          await sql`
            INSERT INTO shifts (user_id, date, shift, hours, notes)
            VALUES (${userId}, ${s.date}, ${s.shift}, ${s.hours}, ${s.notes || ''})
            ON CONFLICT (user_id, date) DO UPDATE SET
              shift = EXCLUDED.shift,
              hours = EXCLUDED.hours,
              notes = EXCLUDED.notes
          `;
        }
        
        if (oldShift !== s.shift) {
          await logActivity('DUPLICATE_SHIFT_UPDATE', user.id, userId, { date: s.date, oldShift, newShift: s.shift });
        }
      }
    }

    res.json({ message: 'Shifts duplicated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.use('/api/requests', scheduleRequestsRouter);
app.use('/api/activity-logs', activityLogsRouter);

// For Vercel Serverless Functions, we need to export the Express app
export default app;

// For local development
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
  });
}
