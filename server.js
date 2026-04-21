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

// ============ 1. Models ============
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: String,
    wallet: { type: Number, default: 0 },
    miningBalance: { type: Number, default: 0 },
    miningMultiplier: { type: Number, default: 1 },
    miningPlanActive: { type: Boolean, default: false },
    planExpiresAt: { type: Date, default: null },
    lastMiningClaim: { type: Date, default: Date.now },
    referralCode: { type: String, unique: true },
    role: { type: String, default: 'user' }
}));

// ============ 2. Mining Engine (محرك التعدين الأوتوماتيكي) ============
const updateMining = async (user) => {
    const now = new Date();
    // فحص انتهاء الباقة
    if (user.miningPlanActive && user.planExpiresAt && now > user.planExpiresAt) {
        user.miningPlanActive = false;
        user.miningMultiplier = 1;
        user.planExpiresAt = null;
    }

    // حساب الوقت المنقضي
    const msPassed = now - user.lastMiningClaim;
    const hoursPassed = msPassed / (1000 * 60 * 60);

    // إذا مرت ساعتان أو أكثر، أضف الأرباح
    if (hoursPassed >= 2) {
        const periods = Math.floor(hoursPassed / 2);
        const reward = 10; // الربح لكل ساعتين
        user.miningBalance += (periods * reward * user.miningMultiplier);
        // تحديث الوقت لآخر فترة محسوبة
        user.lastMiningClaim = new Date(user.lastMiningClaim.getTime() + periods * 2 * 60 * 60 * 1000);
        await user.save();
    }
    return user;
};

// ============ 3. Auth Middleware ============
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
        req.userId = decoded.userId;
        next();
    } catch (e) { res.status(401).json({ error: 'Invalid Token' }); }
};

// ============ 4. Routes ============

// تسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, phone } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            username, email, phone,
            password: hashedPassword,
            referralCode: uuidv4().slice(0, 8).toUpperCase()
        });
        await user.save();
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret123');
        res.json({ token, user: { username: user.username } });
    } catch (e) { res.status(400).json({ error: 'خطأ في البيانات أو المستخدم موجود' }); }
});

// تسجيل دخول
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) 
            return res.status(400).json({ error: 'بيانات خاطئة' });
        
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret123');
        res.json({ token, user: { username: user.username } });
    } catch (e) { res.status(500).json({ error: 'خطأ داخلي' }); }
});

// جلب بيانات المستخدم وتحديث التعدين (هذا هو الأهم للتعدين الأوتوماتيكي)
app.get('/api/user/me', auth, async (req, res) => {
    let user = await User.findById(req.userId);
    user = await updateMining(user); // تحديث الأرباح فوراً عند طلب البيانات
    res.json(user);
});

// مسار "بدء التعدين" (لإصلاح الزر في الصورة)
app.post('/api/mining/start', auth, async (req, res) => {
    let user = await User.findById(req.userId);
    user = await updateMining(user);
    res.json({ success: true, miningBalance: user.miningBalance });
});

// سحب الرصيد (الزر الأخضر في الصورة)
app.post('/api/mining/claim', auth, async (req, res) => {
    let user = await User.findById(req.userId);
    if (user.miningBalance > 0) {
        user.wallet += user.miningBalance;
        user.miningBalance = 0;
        await user.save();
        res.json({ success: true, wallet: user.wallet });
    } else {
        res.status(400).json({ error: 'لا يوجد رصيد كافٍ للسحب' });
    }
});

// ============ 5. Database Connection ============
const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dinar-dz')
.then(() => app.listen(PORT, () => console.log(`Running on port ${PORT}`)));
