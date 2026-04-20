require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: String,
  referralCode: { type: String, unique: true },
  referredBy: String,
  referrals: [{ type: String }],
  wallet: { type: Number, default: 0 },
  miningBalance: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  referralEarnings: { type: Number, default: 0 },
  level: { type: String, default: 'Bronze' },
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
  name: String, description: String, price: Number, category: String, image: String, stock: Number, isActive: { type: Boolean, default: true }
});

const orderSchema = new mongoose.Schema({
  userId: String, products: Array, total: Number, status: { type: String, default: 'pending' }, createdAt: { type: Date, default: Date.now }
});

const transactionSchema = new mongoose.Schema({
  userId: String, type: String, amount: Number, description: String, createdAt: { type: Date, default: Date.now }
});

const lotterySchema = new mongoose.Schema({
  name: String, description: String, prize: String, participants: [String], winner: String, status: { type: String, default: 'active' }, createdAt: { type: Date, default: Date.now }
});

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Lottery = mongoose.model('Lottery', lotterySchema);
const Admin = mongoose.model('Admin', adminSchema);

// Auth Middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    req.userId = decoded.userId;
    next();
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
};

// Admin Auth Middleware
const adminAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    req.adminId = decoded.adminId;
    next();
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
};

// ============ AUTH ROUTES ============

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, phone, referralCode } = req.body;
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newReferralCode = uuidv4().slice(0, 8).toUpperCase();
    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        referredBy = referralCode;
        referrer.referrals.push(newReferralCode);
        referrer.referralEarnings += 50;
        referrer.points += 50;
        await referrer.save();
      }
    }
    const user = new User({ username, email, password: hashedPassword, phone, referralCode: newReferralCode, referredBy, wallet: referralCode ? 10 : 0 });
    await user.save();
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret123');
    res.json({ token, user: { id: user._id, username, email, referralCode: newReferralCode, wallet: user.wallet, level: user.level } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'User not found' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid password' });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret123');
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, referralCode: user.referralCode, wallet: user.wallet, miningBalance: user.miningBalance, points: user.points, referralEarnings: user.referralEarnings, level: user.level, referrals: user.referrals.length } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(400).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ adminId: admin._id, role: 'admin' }, process.env.JWT_SECRET || 'secret123');
    res.json({ token, admin: { id: admin._id, username: admin.username } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/user', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json({ id: user._id, username: user.username, email: user.email, referralCode: user.referralCode, wallet: user.wallet, miningBalance: user.miningBalance, points: user.points, referralEarnings: user.referralEarnings, level: user.level, referrals: user.referrals.length, referredBy: user.referredBy });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ MINING ROUTES ============
app.post('/api/mining/start', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    user.miningBalance += Math.random() * 10 + 5;
    await user.save();
    res.json({ miningBalance: user.miningBalance, earned: user.miningBalance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mining/claim', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.miningBalance > 0) {
      user.wallet += user.miningBalance;
      const transaction = new Transaction({ userId: req.userId, type: 'mining', amount: user.miningBalance, description: 'Mining reward claimed' });
      await transaction.save();
      user.miningBalance = 0;
      await user.save();
    }
    res.json({ wallet: user.wallet });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ PRODUCTS ROUTES ============
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find({ isActive: true });
    res.json(products);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', adminAuth, async (req, res) => {
  try {
    const { name, description, price, category, image, stock } = req.body;
    const product = new Product({ name, description, price, category, image, stock });
    await product.save();
    res.json(product);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products/:id', adminAuth, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ ORDER ROUTES ============
app.post('/api/order', auth, async (req, res) => {
  try {
    const { products, total } = req.body;
    const user = await User.findById(req.userId);
    if (user.wallet < total) return res.status(400).json({ error: 'Insufficient balance' });
    user.wallet -= total;
    if (user.referredBy) {
      const referrer = await User.findOne({ referralCode: user.referredBy });
      if (referrer) {
        const bonus = total * 0.1;
        referrer.wallet += bonus;
        referrer.referralEarnings += bonus;
        referrer.points += Math.floor(bonus);
        if (referrer.points >= 1000) referrer.level = 'Diamond';
        else if (referrer.points >= 500) referrer.level = 'Gold';
        else if (referrer.points >= 200) referrer.level = 'Silver';
        await referrer.save();
      }
    }
    await user.save();
    const order = new Order({ userId: req.userId, products, total, status: 'completed' });
    await order.save();
    res.json({ success: true, wallet: user.wallet, order });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ WALLET ROUTES ============
app.post('/api/wallet/deposit', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.userId);
    user.wallet += amount;
    await user.save();
    const transaction = new Transaction({ userId: req.userId, type: 'deposit', amount, description: 'Wallet deposit' });
    await transaction.save();
    res.json({ wallet: user.wallet });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/transactions', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50);
    res.json(transactions);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ RECHARGE & BILLS ============
app.post('/api/recharge', auth, async (req, res) => {
  try {
    const { phoneNumber, amount, operator } = req.body;
    const user = await User.findById(req.userId);
    if (user.wallet < amount) return res.status(400).json({ error: 'Insufficient balance' });
    user.wallet -= amount;
    await user.save();
    const transaction = new Transaction({ userId: req.userId, type: 'recharge', amount, description: operator + ' recharge - ' + phoneNumber });
    await transaction.save();
    res.json({ success: true, wallet: user.wallet });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bill/pay', auth, async (req, res) => {
  try {
    const { billType, amount, phoneNumber } = req.body;
    const user = await User.findById(req.userId);
    if (user.wallet < amount) return res.status(400).json({ error: 'Insufficient balance' });
    user.wallet -= amount;
    await user.save();
    const transaction = new Transaction({ userId: req.userId, type: 'bill', amount, description: billType + ' payment - ' + phoneNumber });
    await transaction.save();
    res.json({ success: true, wallet: user.wallet });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ LOTTERY ROUTES ============
app.get('/api/lottery', async (req, res) => {
  try {
    const lotteries = await Lottery.find({ status: 'active' });
    res.json(lotteries);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/lottery/join', auth, async (req, res) => {
  try {
    const { lotteryId } = req.body;
    const lottery = await Lottery.findById(lotteryId);
    const user = await User.findById(req.userId);
    if (lottery.participants.includes(user.username)) return res.status(400).json({ error: 'Already joined' });
    lottery.participants.push(user.username);
    await lottery.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/lottery/create', adminAuth, async (req, res) => {
  try {
    const { name, description, prize } = req.body;
    const lottery = new Lottery({ name, description, prize });
    await lottery.save();
    res.json(lottery);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/lottery/draw', adminAuth, async (req, res) => {
  try {
    const { lotteryId } = req.body;
    const lottery = await Lottery.findById(lotteryId);
    if (lottery.participants.length === 0) return res.status(400).json({ error: 'No participants' });
    const winner = lottery.participants[Math.floor(Math.random() * lottery.participants.length)];
    lottery.winner = winner;
    lottery.status = 'completed';
    await lottery.save();
    res.json({ winner });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ ADMIN ROUTES (PROTECTED) ============
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/orders', adminAuth, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const users = await User.countDocuments();
    const products = await Product.countDocuments();
    const orders = await Order.countDocuments();
    res.json({ users, products, orders });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ SEED DATA ============
const seedData = async () => {
  // Create default admin if not exists
  const adminExists = await Admin.countDocuments();
  if (adminExists === 0) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await Admin.create({ username: 'admin', password: hashedPassword });
    console.log('Default admin created: admin / admin123');
  }

  const productCount = await Product.countDocuments();
  if (productCount === 0) {
    const products = [
      { name: 'iPhone 15 Pro', description: 'أحدث آيفون من Apple', price: 180000, category: 'phone', image: 'https://via.placeholder.com/300?text=iPhone+15+Pro', stock: 10 },
      { name: 'Samsung Galaxy S24', description: 'هاتف سامسونج الجديد', price: 150000, category: 'phone', image: 'https://via.placeholder.com/300?text=Galaxy+S24', stock: 15 },
      { name: 'Xiaomi 14 Pro', description: 'هاتف شاومي المميز', price: 120000, category: 'phone', image: 'https://via.placeholder.com/300?text=Xiaomi+14+Pro', stock: 20 },
      { name: 'AirPods Pro 2', description: 'سماعات أبل اللاسلكية', price: 45000, category: 'accessory', image: 'https://via.placeholder.com/300?text=AirPods+Pro', stock: 50 },
      { name: 'Samsung Buds 2', description: 'سماعات سامسونج', price: 35000, category: 'accessory', image: 'https://via.placeholder.com/300?text=Buds+2', stock: 50 },
      { name: 'شاحن سريع 65W', description: 'شاحن لجميع الأجهزة', price: 8000, category: 'accessory', image: 'https://via.placeholder.com/300?text=Charger', stock: 100 },
      { name: 'كفر حماية سامسونج', description: 'كفر أصلي', price: 3000, category: 'accessory', image: 'https://via.placeholder.com/300?text=Case', stock: 200 },
      { name: 'Google Play Card $10', description: 'بطاقة هدايا', price: 2500, category: 'gift_card', image: 'https://via.placeholder.com/300?text=Google+Play', stock: 100 },
      { name: 'iTunes Card $10', description: 'بطاقة هدايا', price: 2500, category: 'gift_card', image: 'https://via.placeholder.com/300?text=iTunes', stock: 100 },
      { name: 'PSN Card $20', description: 'بطاقة بلايستيشن', price: 5000, category: 'gift_card', image: 'https://via.placeholder.com/300?text=PSN', stock: 50 }
    ];
    await Product.insertMany(products);
    console.log('Products seeded!');
  }

  const lotteryCount = await Lottery.countDocuments();
  if (lotteryCount === 0) {
    const lotteries = [
      { name: 'سحب على iPhone 15', description: 'فوز بهاتف آيفون 15 برو', prize: 'iPhone 15 Pro', participants: [] },
      { name: 'سحب على رصيد 5000', description: 'رصيد للمحفظة', prize: '5000 DZD', participants: [] }
    ];
    await Lottery.insertMany(lotteries);
    console.log('Lotteries seeded!');
  }
};

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dinar-dz';

mongoose.connect(MONGO_URI)
  .then(() => { console.log('Connected to MongoDB'); seedData(); app.listen(PORT, () => console.log('Server running on port ' + PORT)); })
  .catch(err => { console.error('MongoDB connection error:', err); app.listen(PORT, () => console.log('Server running on port ' + PORT + ' (without DB)')); });