const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
// NOTE: We no longer hash admin passwords for this personal demo app.
// Admin credentials are stored in plaintext in admin_credentials.txt
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from workspace root so HTML pages can be directly viewed via server
app.use(express.static(path.join(__dirname)));

// Simple file storage for user data
const USERS_FILE = path.join(__dirname, 'users.json');
const ADMIN_FILE = path.join(__dirname, 'admin_credentials.txt');
const TRANSACTIONS_FILE = path.join(__dirname, 'transactions.json');

function readUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const users = JSON.parse(raw || '[]');
    ensureBalances(users);
    return users;
  } catch (e) {
    return [];
  }
}

function readAdminCredentials() {
  try {
    const raw = fs.readFileSync(ADMIN_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeAdminCredentials(adminObj) {
  try {
    fs.writeFileSync(ADMIN_FILE, JSON.stringify(adminObj), 'utf8');
    return true;
  } catch (e) { return false; }
}

function readTransactions() {
  try {
    const raw = fs.readFileSync(TRANSACTIONS_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) { return []; }
}

function writeTransactions(txns) {
  fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(txns, null, 2), 'utf8');
}

function appendTransaction(tx) {
  const txns = readTransactions();
  txns.push(tx);
  writeTransactions(txns);
}

function verifyAdmin(username, password) {
  const admin = readAdminCredentials();
  if (!admin) return false;
  // plain-text compare: username and password both must match
  if (admin.username !== username) return false;
  if (!admin.password) return false;
  return password === admin.password;
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function ensureBalances(users) {
  let changed = false;
  for (const u of users) {
    if (typeof u.balance !== 'number') {
      u.balance = 1000; // default starting balance for demo
      changed = true;
    }
  }
  if (changed) writeUsers(users);
}

// API: Sign up new user
function validateEmail(email){
  if (!email) return true; // optional
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validateUsername(username){
  if (!username) return false;
  const re = /^[A-Za-z0-9_]{3,20}$/;
  return re.test(username);
}

function validatePassword(password){
  if (!password) return false;
  return password.length >= 8; // minimal rule
}

app.post('/api/signup', async (req, res) => {
  try {
    const { username, password, fullName, email } = req.body;
    // Trim inputs
    const u = (username || '').trim();
    const p = (password || '').trim();
    const e = (email || '').trim();

    const errors = {};
    if (!u) errors.username = 'username is required';
    else if (!validateUsername(u)) errors.username = 'username must be 3-20 characters (letters, numbers, underscore)';
    if (!p) errors.password = 'password is required';
    else if (!validatePassword(p)) errors.password = 'password must be at least 8 characters';
    if (e && !validateEmail(e)) errors.email = 'invalid email';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'invalid input', details: errors });

    const users = readUsers();
    if (users.find(existing => existing.username === u)) {
      return res.status(409).json({ error: 'username already exists', details: { username: 'username already exists' } });
    }
    if (e && users.find(existing => existing.email === e)) {
      return res.status(409).json({ error: 'email already in use', details: { email: 'email already in use' } });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(p, salt);

    const id = Date.now().toString();
    const newUser = { id, username: u, password: hashedPassword, fullName: (fullName || null), email: (e || null) };
    users.push(newUser);
    writeUsers(users);

    return res.status(201).json({ id, username: u, fullName: newUser.fullName, email: newUser.email });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// API: login
app.post('/api/login', async (req, res) => {
  try {
    let { username, password } = req.body;
    username = (username || '').trim(); password = (password || '').trim();
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' });

    const users = readUsers();
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    // For security: login does not generate tokens anymore in this demo.
    // Tokens must be created via the admin endpoint. If the user already has a token (created by admin), return it.
    const response = { id: user.id, username: user.username, fullName: user.fullName, email: user.email, balance: user.balance || 0 };
    if (user.token) response.token = user.token;
    return res.json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// API: list all users (demo/unsafe, do not expose in production)
app.get('/api/users', (req, res) => {
  const users = readUsers();
  ensureBalances(users);
  // Remove password before returning
  const publicUsers = users.map(({ password, ...rest }) => rest);
  res.json(publicUsers);
});

// Helper: extract username from our demo token
function getUsernameFromToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    return parts[0];
  } catch (e) {
    return null;
  }
}

// Middleware-like helper to get user by token
function getUserFromAuthHeader(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (!h) return null;
  const parts = h.split(' ');
  if (parts.length !== 2) return null;
  const token = parts[1];
  const username = getUsernameFromToken(token);
  if (!username) return null;
  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) return null;
  // token must match the stored token for that user
  if (!user.token || user.token !== token) return null;
  return user;
}

function getAdminFromAuthHeader(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (!h) return null;
  const parts = h.split(' ');
  if (parts.length !== 2) return null;
  const token = parts[1];
  const admin = readAdminCredentials();
  if (!admin) return null;
  if (!admin.token || admin.token !== token) return null;
  return admin;
}

// Admin login: issue a token and store it in ADMIN_FILE
app.post('/api/admin/login', async (req, res) => {
  try {
    const { adminUsername, adminPassword } = req.body || {};
    if (!adminUsername || !adminPassword) return res.status(400).json({ error: 'admin username/password required' });
    const ok = verifyAdmin(adminUsername, adminPassword);
    if (!ok) return res.status(401).json({ error: 'invalid admin credentials' });
    const token = Buffer.from(adminUsername + ':' + Date.now() + ':' + Math.random().toString(36).slice(2)).toString('base64');
    const admin = readAdminCredentials();
    const newAdmin = { ...admin, token };
    writeAdminCredentials(newAdmin);
    return res.json({ token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// API: get current user profile (requires Authorization Bearer <token>)
app.get('/api/me', (req, res) => {
  const user = getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  const u = { ...user };
  delete u.password;
  res.json(u);
});

// Admin: create token for a username
// POST /api/admin/token { adminUsername, adminPassword, username }
app.post('/api/admin/token', async (req, res) => {
  try {
    const admin = getAdminFromAuthHeader(req);
    if (!admin) return res.status(401).json({ error: 'admin authorize required' });
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: 'username is required' });
    const users = readUsers();
    const target = users.find(u => u.username === username);
    if (!target) return res.status(404).json({ error: 'user not found' });
    const token = Buffer.from(username + ':' + Date.now()).toString('base64');
    target.token = token;
    writeUsers(users);
    const publicUser = { ...target }; delete publicUser.password;
    return res.json({ username: publicUser.username, token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// Admin: set a new admin password
// POST /api/admin/set { adminUsername, adminPassword, newPassword }
app.post('/api/admin/set', async (req, res) => {
  try {
    const admin = getAdminFromAuthHeader(req);
    if (!admin) return res.status(401).json({ error: 'admin authorize required' });
    const { newPassword } = req.body || {};
    if (!newPassword) return res.status(400).json({ error: 'newPassword is required' });
    // Store as plain-text password per user preference for personal project
    const adminObj = { username: admin.username, password: newPassword, token: admin.token };
    writeAdminCredentials(adminObj);
    return res.json({ ok: true, message: 'admin password updated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// API: send IDI to another user
app.post('/api/send', (req, res) => {
  try {
    const user = getUserFromAuthHeader(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const { toUsername, amount } = req.body || {};
    const a = Number(amount);
    if (!toUsername || !a || isNaN(a) || a <= 0) return res.status(400).json({ error: 'invalid amount or recipient' });
    if (!validateUsername(toUsername)) return res.status(400).json({ error: 'invalid recipient username' });
    const users = readUsers();
    ensureBalances(users);
    // Token-protected flows: ensure user has token and it matches the provided token
    const sender = users.find(u => u.username === user.username);
    // If user doesn't have a token set on their profile, they can't authorize with a token
    if (!sender.token) return res.status(401).json({ error: 'token not issued for user' });
    const receiver = users.find(u => u.username === toUsername);
      if (!receiver) return res.status(404).json({ error: 'recipient not found' });
    if (receiver.username === sender.username) return res.status(400).json({ error: 'cannot send to self' });
    if (sender.balance < a) return res.status(400).json({ error: 'insufficient funds' });
    sender.balance = Number((sender.balance - a).toFixed(2));
    receiver.balance = Number((receiver.balance + a).toFixed(2));
    writeUsers(users);
    // Log transaction
    const tx = { id: Date.now().toString(), from: sender.username, to: receiver.username, amount: a, time: new Date().toISOString() };
    appendTransaction(tx);
    const publicSender = { ...sender }; delete publicSender.password;
    const publicReceiver = { ...receiver }; delete publicReceiver.password;
    return res.json({ from: publicSender, to: publicReceiver, amount: a });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// GET /api/transactions  (admin only)
app.get('/api/transactions', (req, res) => {
  const admin = getAdminFromAuthHeader(req);
  if (!admin) return res.status(401).json({ error: 'admin authorize required' });
  const txns = readTransactions();
  res.json(txns);
});

// GET /api/transactions/user/:username - user or admin
app.get('/api/transactions/user/:username', (req, res) => {
  try {
    const authUser = getUserFromAuthHeader(req);
    const admin = getAdminFromAuthHeader(req);
    const username = req.params.username;
    if (!authUser && !admin) return res.status(401).json({ error: 'unauthorized' });
    if (authUser && authUser.username !== username) return res.status(403).json({ error: 'forbidden' });
    const txns = readTransactions();
    const result = txns.filter(t => t.from === username || t.to === username);
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal server error' }); }
});

// GET /api/transactions/explore?user=...&from=...&to=... (admin only)
app.get('/api/transactions/explore', (req, res) => {
  const admin = getAdminFromAuthHeader(req);
  if (!admin) return res.status(401).json({ error: 'admin authorize required' });
  const { user, from, to } = req.query || {};
  const txns = readTransactions();
  let filtered = txns;
  if (user) filtered = filtered.filter(t => t.from === user || t.to === user);
  if (from) {
    const f = new Date(from);
    filtered = filtered.filter(t => new Date(t.time) >= f);
  }
  if (to) {
    const tt = new Date(to);
    filtered = filtered.filter(t => new Date(t.time) <= tt);
  }
  res.json(filtered);
});

app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
  console.log('Serving static files from: ' + path.join(__dirname));
});
