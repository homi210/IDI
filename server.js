// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const USERS_FILE = path.join(__dirname, 'users.json');
const SECRET = 'IDI_SUPER_SECRET'; // change this to something strong

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // serve html/css/js files

// Helper functions
function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function findUser(username) {
  const users = readUsers();
  return users.find(u => u.username === username);
}

// --- Auth middleware ---
function authMiddleware(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// --- Routes ---

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  const token = jwt.sign({ username: user.username, role: user.role || 'user' }, SECRET, { expiresIn: '12h' });
  res.json({ 
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    balance: user.balance || 0,
    role: user.role,
    token
  });
});

// Get current user
app.get('/api/me', authMiddleware, (req, res) => {
  const user = findUser(req.user.username);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ 
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    balance: user.balance || 0,
    role: user.role || 'user'
  });
});

// Send IDI
app.post('/api/send', authMiddleware, (req, res) => {
  const { fromUsername, toUsername, amount } = req.body;
  if (!fromUsername || !toUsername || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  const users = readUsers();
  const sender = users.find(u => u.username === fromUsername);
  const recipient = users.find(u => u.username === toUsername);
  if (!sender || !recipient) return res.status(404).json({ error: 'User not found' });
  if ((sender.balance || 0) < amount) return res.status(400).json({ error: 'Insufficient balance' });

  sender.balance = (sender.balance || 0) - amount;
  recipient.balance = (recipient.balance || 0) + amount;

  writeUsers(users);

  res.json({
    from: { username: sender.username, balance: sender.balance },
    to: { username: recipient.username, balance: recipient.balance },
    amount
  });
});

// Admin adjust (spawn/burn)
app.post('/api/admin/adjust', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

  const { username, amount } = req.body;
  if (!username || !amount || amount === 0) return res.status(400).json({ error: 'Invalid parameters' });

  const users = readUsers();
  const target = users.find(u => u.username === username);
  if (!target) return res.status(404).json({ error: 'User not found' });

  target.balance = (target.balance || 0) + amount;
  if (target.balance < 0) target.balance = 0; // don't allow negative balance

  writeUsers(users);

  res.json({ username: target.username, balance: target.balance });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
