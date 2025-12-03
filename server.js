// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = 'IDI_SUPER_SECRET'; // change to something strong

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // serve html/css/js

// In-memory users (change defaults here)
const users = [
  {
    id: '1',
    username: 'testuser',
    password: 'test1234',  // plaintext
    fullName: 'Test User',
    email: 'test@example.com',
    balance: 840,
    role: 'user'
  },
  {
    id: '2',
    username: 'Homi',
    password: 'password123', // plaintext
    fullName: 'Hongming Lin',
    email: 'xhxhomi@gmail.com',
    balance: 0,
    role: 'admin',
  },
  {
    id: '3',
    username: 'Admin',
    password: 'Admin123', // plaintext
    fullName: 'Admin',
    email: '30chen_y@aswarsaw.org',
    balance: 10000000,
    role: 'admin'
  }
];

// --- Helper functions ---
function findUser(username) {
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

// Sign up
app.post('/api/signup', (req, res) => {
  const { username, password, fullName, email } = req.body;
  if (!username || !password || !fullName || !email) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (findUser(username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const newUser = {
    id: Date.now().toString(),
    username,
    password,
    fullName,
    email,
    balance: 0,
    role: 'user'
  };
  users.push(newUser);

  const token = jwt.sign({ username: newUser.username, role: newUser.role }, SECRET, { expiresIn: '12h' });

  res.json({
    id: newUser.id,
    username: newUser.username,
    fullName: newUser.fullName,
    email: newUser.email,
    balance: newUser.balance,
    role: newUser.role,
    token
  });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = findUser(username);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ username: user.username, role: user.role }, SECRET, { expiresIn: '12h' });

  res.json({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    balance: user.balance,
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
    balance: user.balance,
    role: user.role
  });
});

// Send IDI
app.post('/api/send', authMiddleware, (req, res) => {
  const { toUsername, amount } = req.body;
  if (!toUsername || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid parameters' });

  const sender = findUser(req.user.username);
  const recipient = findUser(toUsername);
  if (!sender || !recipient) return res.status(404).json({ error: 'User not found' });
  if (sender.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

  sender.balance -= amount;
  recipient.balance += amount;

  res.json({
    from: { username: sender.username, balance: sender.balance },
    to: { username: recipient.username, balance: recipient.balance },
    amount
  });
});

// Admin spawn/burn
app.post('/api/admin/adjust', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

  const { username, amount } = req.body;
  if (!username || !amount || amount === 0) return res.status(400).json({ error: 'Invalid parameters' });

  const target = findUser(username);
  if (!target) return res.status(404).json({ error: 'User not found' });

  target.balance += amount;
  if (target.balance < 0) target.balance = 0;

  res.json({ username: target.username, balance: target.balance });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
