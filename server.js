const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- File paths ---
const USERS_FILE = path.join(__dirname, 'users.json');
const ADMIN_FILE = path.join(__dirname, 'admin_credentials.txt');
const TRANSACTIONS_FILE = path.join(__dirname, 'transactions.json');

// --- Helper functions ---
function readJSON(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function readUsers() {
  const users = readJSON(USERS_FILE);
  let changed = false;
  for (const u of users) {
    if (typeof u.balance !== 'number') { u.balance = 1000; changed = true; }
  }
  if (changed) writeUsers(users);
  return users;
}
function writeUsers(users) { writeJSON(USERS_FILE, users); }

function readAdminCredentials() { return readJSON(ADMIN_FILE); }
function writeAdminCredentials(admin) { writeJSON(ADMIN_FILE, admin); }

function readTransactions() { return readJSON(TRANSACTIONS_FILE); }
function writeTransactions(txns) { writeJSON(TRANSACTIONS_FILE, txns); }
function appendTransaction(tx) { const txns = readTransactions(); txns.push(tx); writeTransactions(txns); }

function getUsernameFromToken(token) {
  try { return Buffer.from(token, 'base64').toString('utf8').split(':')[0]; }
  catch { return null; }
}

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
  if (!user || user.token !== token) return null;
  return user;
}

function getAdminFromAuthHeader(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (!h) return null;
  const parts = h.split(' ');
  if (parts.length !== 2) return null;
  const token = parts[1];
  const admin = readAdminCredentials();
  if (!admin || admin.token !== token) return null;
  return admin;
}

// --- Serve static files ---
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'Index.html')));

// --- APIs ---
// Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { username, password, fullName, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username/password required' });

    const users = readUsers();
    if (users.find(u => u.username === username)) return res.status(409).json({ error: 'username exists' });
    if (email && users.find(u => u.email === email)) return res.status(409).json({ error: 'email exists' });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = { id: Date.now().toString(), username, password: hashed, fullName: fullName || null, email: email || null, balance: 1000 };
    users.push(newUser);
    writeUsers(users);
    res.status(201).json({ id: newUser.id, username, fullName, email });
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal server error' }); }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username/password required' });

    const users = readUsers();
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    const resp = { id: user.id, username: user.username, fullName: user.fullName, email: user.email, balance: user.balance };
    if (user.token) resp.token = user.token;
    res.json(resp);
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal server error' }); }
});

// Send IDI
app.post('/api/send', (req, res) => {
  try {
    const user = getUserFromAuthHeader(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const { toUsername, amount } = req.body;
    const a = Number(amount);
    if (!toUsername || !a || a <= 0) return res.status(400).json({ error: 'invalid recipient/amount' });

    const users = readUsers();
    const sender = users.find(u => u.username === user.username);
    const receiver = users.find(u => u.username === toUsername);
    if (!receiver) return res.status(404).json({ error: 'recipient not found' });
    if (sender.balance < a) return res.status(400).json({ error: 'insufficient funds' });

    sender.balance = Number((sender.balance - a).toFixed(2));
    receiver.balance = Number((receiver.balance + a).toFixed(2));
    writeUsers(users);

    const tx = { id: Date.now().toString(), from: sender.username, to: receiver.username, amount: a, time: new Date().toISOString() };
    appendTransaction(tx);

    res.json({ from: { username: sender.username, balance: sender.balance }, to: { username: receiver.username, balance: receiver.balance }, amount: a });
  } catch (e) { console.error(e); res.status(500).json({ error: 'internal server error' }); }
});

// Get all users (admin/demo only)
app.get('/api/users', (req, res) => {
  const users = readUsers();
  const publicUsers = users.map(({ password, ...rest }) => rest);
  res.json(publicUsers);
});

// Get transactions (user/admin)
app.get('/api/transactions', (req, res) => {
  const admin = getAdminFromAuthHeader(req);
  if (!admin) return res.status(401).json({ error: 'admin required' });
  res.json(readTransactions());
});

app.get('/api/transactions/user/:username', (req, res) => {
  const authUser = getUserFromAuthHeader(req);
  const admin = getAdminFromAuthHeader(req);
  const username = req.params.username;
  if (!authUser && !admin) return res.status(401).json({ error: 'unauthorized' });
  if (authUser && authUser.username !== username) return res.status(403).json({ error: 'forbidden' });

  const txns = readTransactions().filter(t => t.from === username || t.to === username);
  res.json(txns);
});

// Catch-all to serve HTML pages for direct URL access
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  if (fs.existsSync(filePath)) res.sendFile(filePath);
  else res.status(404).send('File not found');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
