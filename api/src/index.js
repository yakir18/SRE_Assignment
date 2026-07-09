const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { pool, waitForDb } = require('./db');
const { logUserActivity } = require('./logger');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username/email and password are required' });
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid credentials format' });
  }

  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'Username/email must be at least 3 characters' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const [users] = await pool.query(
      `SELECT id, username, email
       FROM users
       WHERE (username = ? OR email = ?) AND password = ?`,
      [username.trim(), username.trim(), password]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    const user = users[0];
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt]
    );

    logUserActivity({
      userId: user.id,
      action: 'login',
      ip: getClientIp(req),
    });

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/logout', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM tokens WHERE token = ?', [req.user.token]);
    logUserActivity({
      userId: req.user.id,
      action: 'logout',
      ip: getClientIp(req),
    });
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function start() {
  await waitForDb();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start API:', err.message);
  process.exit(1);
});
