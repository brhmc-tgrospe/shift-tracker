import { sql } from '@vercel/postgres';
import bcrypt from 'bcrypt';

// Create tables and seed
export const initDB = async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        "firstName" VARCHAR(255) NOT NULL,
        "lastName" VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'User'
      );
    `;

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

    // Seed function
    const { rows: sysdev } = await sql`SELECT id FROM users WHERE username = 'sysdev'`;
    if (sysdev.length === 0) {
      const hash = await bcrypt.hash('password123', 10);
      await sql`INSERT INTO users (username, email, password, "firstName", "lastName", role) VALUES ('sysdev', 'sysdev@sys.com', ${hash}, 'System', 'Developer', 'Developer')`;
      console.log('Seeded Developer Account');
    }

    const { rows: testacct } = await sql`SELECT id FROM users WHERE username = 'testacct'`;
    if (testacct.length === 0) {
      const hash = await bcrypt.hash('123456', 10);
      await sql`INSERT INTO users (username, email, password, "firstName", "lastName", role) VALUES ('testacct', 'testacct@test.com', ${hash}, 'Test', 'Account', 'User')`;
      console.log('Seeded Test Account');
    }
  } catch (error) {
    console.error("Error initializing database:", error);
  }
};

export default sql;
