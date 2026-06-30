import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import sql, { initDB } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production';

// Initialize DB on cold start
initDB();

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

// Register
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, firstName, lastName } = req.body;
  if (!username || !email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const rows = await sql`
      INSERT INTO users (username, email, password, "firstName", "lastName", role) 
      VALUES (${username}, ${email}, ${hash}, ${firstName}, ${lastName}, 'User')
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
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  const tokenUser = (req as any).user;
  try {
    const rows = await sql`SELECT id, username, email, "firstName", "lastName", role FROM users WHERE id = ${tokenUser.id}`;
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
      await sql`UPDATE users SET email = ${email}, password = ${hash}, "firstName" = ${firstName}, "lastName" = ${lastName} WHERE id = ${user.id}`;
    } else {
      await sql`UPDATE users SET email = ${email}, "firstName" = ${firstName}, "lastName" = ${lastName} WHERE id = ${user.id}`;
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

// User Management (Developer Only)

// Get all users
app.get('/api/users', authenticateToken, requireDeveloper, async (req, res) => {
  try {
    const rows = await sql`SELECT id, username, email, "firstName", "lastName", role FROM users`;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create user
app.post('/api/users', authenticateToken, requireDeveloper, async (req, res) => {
  const { username, email, password, firstName, lastName, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const rows = await sql`
      INSERT INTO users (username, email, password, "firstName", "lastName", role) 
      VALUES (${username}, ${email}, ${hash}, ${firstName}, ${lastName}, ${role || 'User'})
      RETURNING id
    `;
    res.status(201).json({ id: rows[0].id, message: 'User created' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update user
app.put('/api/users/:id', authenticateToken, requireDeveloper, async (req, res) => {
  const { id } = req.params;
  const { username, email, password, firstName, lastName, role } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await sql`UPDATE users SET username = ${username}, email = ${email}, password = ${hash}, "firstName" = ${firstName}, "lastName" = ${lastName}, role = ${role} WHERE id = ${id}`;
    } else {
      await sql`UPDATE users SET username = ${username}, email = ${email}, "firstName" = ${firstName}, "lastName" = ${lastName}, role = ${role} WHERE id = ${id}`;
    }
    res.json({ message: 'User updated' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete user
app.delete('/api/users/:id', authenticateToken, requireDeveloper, async (req, res) => {
  const { id } = req.params;
  try {
    // Prevent self-deletion
    if (parseInt(id) === (req as any).user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    await sql`DELETE FROM users WHERE id = ${id}`;
    res.json({ message: 'User deleted' });
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

// Update or delete shift for current user
app.post('/api/shifts', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { date, shift, hours, notes } = req.body;
  
  if (!date || !shift || hours === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    if (shift === 'free' && hours === 0) {
      // Delete the shift if it's free with 0 hours
      await sql`DELETE FROM shifts WHERE user_id = ${user.id} AND date = ${date}`;
    } else {
      // Upsert
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

// For Vercel Serverless Functions, we need to export the Express app
export default app;

// For local development
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
  });
}
