import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcrypt';

// Create a safe default for local development so it doesn't crash on startup if DATABASE_URL is missing
const sql = neon(process.env.DATABASE_URL || 'postgres://placeholder:placeholder@placeholder/placeholder');

// Create tables and seed
export const initDB = async () => {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set. Skipping database initialization.");
    return;
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        password TEXT NOT NULL,
        "firstName" VARCHAR(255) NOT NULL,
        "lastName" VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'User',
        department_id INTEGER,
        FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE SET NULL
      );
    `;

    try {
      await sql`ALTER TABLE users ADD COLUMN department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL`;
    } catch (e: any) {
      // Ignore if column already exists
    }

    try {
      await sql`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`;
    } catch (e: any) {
      // Ignore if it fails or already dropped
    }

    try {
      await sql`ALTER TABLE users ADD COLUMN username_changed BOOLEAN DEFAULT FALSE`;
    } catch (e: any) {
      // Ignore if column already exists
    }

    await sql`
      CREATE TABLE IF NOT EXISTS shifts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        date VARCHAR(20) NOT NULL,
        shift VARCHAR(50) NOT NULL,
        hours REAL NOT NULL,
        notes TEXT,
        UNIQUE(user_id, date),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS schedule_requests (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        requester_id INTEGER NOT NULL,
        target_user_id INTEGER,
        details JSONB NOT NULL,
        reason TEXT NOT NULL,
        target_status VARCHAR(50),
        admin_status VARCHAR(50) DEFAULT 'pending',
        admin_remark TEXT,
        is_archived_by_admin BOOLEAN DEFAULT FALSE,
        archived_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(requester_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(target_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `;

    try {
      await sql`ALTER TABLE schedule_requests ADD COLUMN is_archived_by_admin BOOLEAN DEFAULT FALSE`;
    } catch (e: any) {
      // Ignore if column already exists
    }

    try {
      await sql`ALTER TABLE schedule_requests ADD COLUMN archived_at TIMESTAMP`;
    } catch (e: any) {
      // Ignore if column already exists
    }


    await sql`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        actor_id INTEGER NOT NULL,
        target_user_id INTEGER,
        details JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(target_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `;


    // Seed departments
    const defaultDepartments = [
      'IT Regular',
      'Audio/Visual and Stock Management',
      'Technical Support',
      'Network Management',
      'HOMIS Support',
      'System Development'
    ];

    for (const dept of defaultDepartments) {
      await sql`
        INSERT INTO departments (name)
        VALUES (${dept})
        ON CONFLICT (name) DO NOTHING
      `;
    }

    // Seed function
    const sysdev = await sql`SELECT id FROM users WHERE username = 'sysdev'`;
    if (sysdev.length === 0) {
      const hash = await bcrypt.hash('password123', 10);
      await sql`INSERT INTO users (username, email, password, "firstName", "lastName", role) VALUES ('sysdev', 'sysdev@sys.com', ${hash}, 'System', 'Developer', 'Developer')`;
      console.log('Seeded Developer Account');
    }


  } catch (error) {
    console.error("Error initializing database:", error);
  }
};

export default sql;
