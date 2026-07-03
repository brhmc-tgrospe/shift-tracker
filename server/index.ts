import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import sql, { initDB } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production';

let dbInitialized = false;
app.use(async (req, res, next) => {
  if (!dbInitialized) {
    await initDB();
    dbInitialized = true;
  }
  next();
});

// Auth Middleware
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    (req as any).user = user;
    next();
  });
};

const requireDeveloper = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  if (!user || user.role !== 'Developer') {
    return res.status(403).json({ error: 'Developer access required' });
  }
  next();
};

const requireAdminOrDeveloper = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  if (!user || (user.role !== 'Developer' && user.role !== 'Admin')) {
    return res.status(403).json({ error: 'Admin or Developer access required' });
  }
  next();
};

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
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, firstName: user.firstName, lastName: user.lastName } });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message, cause: error.cause ? String(error.cause) : undefined });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  const tokenUser = (req as any).user;
  try {
    const rows = await sql`SELECT id, username, email, "firstName", "lastName", role, department_id FROM users WHERE id = ${tokenUser.id}`;
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
  const { email, password, firstName, lastName } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await sql`UPDATE users SET email = ${email || null}, password = ${hash}, "firstName" = ${firstName}, "lastName" = ${lastName} WHERE id = ${user.id}`;
    } else {
      await sql`UPDATE users SET email = ${email || null}, "firstName" = ${firstName}, "lastName" = ${lastName} WHERE id = ${user.id}`;
    }
    
    // Fetch updated user
    const rows = await sql`SELECT id, username, email, "firstName", "lastName", role FROM users WHERE id = ${user.id}`;
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
    const rows = await sql`SELECT id, username, email, "firstName", "lastName", role FROM users WHERE id = ${userId}`;
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

// Get all users
app.get('/api/users', authenticateToken, requireAdminOrDeveloper, async (req, res) => {
  try {
    const rows = await sql`
      SELECT u.id, u.username, u.email, u."firstName", u."lastName", u.role, u.department_id, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
    `;
    res.json(rows);
  } catch (error) {
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
  const { username, email, password, firstName, lastName, role, department_id } = req.body;
  const currentUser = (req as any).user;
  
  try {
    if (currentUser.role === 'Admin') {
      const targetUser = await sql`SELECT role FROM users WHERE id = ${id}`;
      if (targetUser.length > 0 && (targetUser[0].role === 'Admin' || targetUser[0].role === 'Developer')) {
        return res.status(403).json({ error: 'Admins cannot edit Admin or Developer accounts' });
      }
      if (role === 'Admin' || role === 'Developer') {
         return res.status(403).json({ error: 'Admins cannot upgrade a user to Admin or Developer' });
      }
    }

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await sql`UPDATE users SET username = ${username}, email = ${email || null}, password = ${hash}, "firstName" = ${firstName}, "lastName" = ${lastName}, role = ${role}, department_id = ${department_id || null} WHERE id = ${id}`;
    } else {
      await sql`UPDATE users SET username = ${username}, email = ${email || null}, "firstName" = ${firstName}, "lastName" = ${lastName}, role = ${role}, department_id = ${department_id || null} WHERE id = ${id}`;
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
    
    if (currentUser.role === 'Admin') {
      const targetUser = await sql`SELECT role FROM users WHERE id = ${id}`;
      if (targetUser.length > 0 && (targetUser[0].role === 'Admin' || targetUser[0].role === 'Developer')) {
        return res.status(403).json({ error: 'Admins cannot delete Admin or Developer accounts' });
      }
    }

    await sql`DELETE FROM users WHERE id = ${id}`;
    res.json({ message: 'User deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
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

// Update or delete shift for current user
app.post('/api/shifts', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { date, shift, hours, notes } = req.body;
  
  if (!date || !shift || hours === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (user.role === 'User') {
    const shiftMonthStr = date.substring(0, 7); // 'YYYY-MM'
    
    // We get current month in local time using a hack or just UTC
    // A simpler way: '2026-06'
    const now = new Date();
    // Assuming local timezone logic is fine, or simple UTC is fine
    const todayMonthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    if (shiftMonthStr > todayMonthStr) {
      return res.status(403).json({ error: 'Users cannot edit shifts for upcoming months' });
    }
  }

  try {
    if (shift === 'free' && hours === 0) {
      await sql`DELETE FROM shifts WHERE user_id = ${user.id} AND date = ${date}`;
    } else {
      await sql`
        INSERT INTO shifts (user_id, date, shift, hours, notes)
        VALUES (${user.id}, ${date}, ${shift}, ${hours}, ${notes || ''})
        ON CONFLICT (user_id, date) DO UPDATE SET
          shift = EXCLUDED.shift,
          hours = EXCLUDED.hours,
          notes = EXCLUDED.notes
      `;
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

  try {
    for (const s of shifts) {
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
      if (!row.shift || row.shift === 'free') {
        dayOff.push(row);
      } else if (row.shift === 'on-leave') {
        onLeave.push(row);
      } else {
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
      }
    }

    res.json({ message: 'Shifts duplicated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// For Vercel Serverless Functions, we need to export the Express app
export default app;

// For local development
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
  });
}
