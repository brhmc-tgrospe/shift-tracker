require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
async function test() {
  const sql = neon(process.env.DATABASE_URL);
  try {
    const result = await sql`SELECT u.id, u.username, u.role, d.name as department_name FROM users u LEFT JOIN departments d ON u.department_id = d.id`;
    const regularUsers = result.filter(u => u.role === 'User');
    const nonITUsers = regularUsers.filter(u => u.department_name !== 'IT Regular');
    console.log('Total non-IT users:', nonITUsers.length);
    console.log(nonITUsers);
  } catch (e) {
    console.error(e);
  }
}
test();
