const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'rootpassword',
  database: process.env.DB_NAME || 'sre_db',
  waitForConnections: true,
  connectionLimit: 10,
});

async function waitForDb(retries = 30, delayMs = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const connection = await pool.getConnection();
      connection.release();
      console.log('Connected to MySQL');
      return;
    } catch (err) {
      console.log(`Waiting for MySQL (${i}/${retries}): ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Could not connect to MySQL');
}

module.exports = { pool, waitForDb };
