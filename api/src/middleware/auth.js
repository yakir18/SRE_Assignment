const { pool } = require('../db');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['x-auth-token'];

  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authentication token' });
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  try {
    const [rows] = await pool.query(
      `SELECT t.token, t.user_id, u.username, u.email
       FROM tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token = ?
         AND (t.expires_at IS NULL OR t.expires_at > NOW())`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = {
      id: rows[0].user_id,
      username: rows[0].username,
      email: rows[0].email,
      token,
    };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

module.exports = { requireAuth };
