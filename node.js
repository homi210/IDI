// server.js
import express from 'express';
import fs from 'fs';
import bodyParser from 'body-parser';
const app = express();
app.use(bodyParser.json());

// Get all users
app.get('/api/users', (req, res) => {
  const users = JSON.parse(fs.readFileSync('users.json'));
  res.json(users);
});

// Adjust balance (admin)
app.post('/api/admin/adjust', (req, res) => {
  const { username, amount } = req.body;
  const users = JSON.parse(fs.readFileSync('users.json'));
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.balance = (user.balance || 0) + amount;
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
  res.json({ username: user.username, balance: user.balance });
});

// Send tokens
app.post('/api/send', (req, res) => {
  const { fromUsername, toUsername, amount } = req.body;
  const users = JSON.parse(fs.readFileSync('users.json'));
  const from = users.find(u => u.username === fromUsername);
  const to = users.find(u => u.username === toUsername);
  if (!from || !to) return res.status(404).json({ error: 'User not found' });
  if ((from.balance || 0) < amount) return res.status(400).json({ error: 'Insufficient balance' });

  from.balance -= amount;
  to.balance = (to.balance || 0) + amount;
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
  res.json({ from, to, amount });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
