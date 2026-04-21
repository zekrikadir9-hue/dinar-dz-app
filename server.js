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

// ============ 1. Models (قواعد البيانات) ============

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: String,
    wallet: { type: Number, default: 0 },
    miningBalance: { type: Number, default: 0 },
    
    // نظام التعدين المطور
    miningMultiplier: { type: Number, default: 1 }, 
    miningPlanActive: { type: Boolean, default: false },
    planExpiresAt: { type: Date, default: null },
    lastMiningClaim: { type: Date, default: Date.now },
    
    referralCode: { type: String, unique: true },
    role: { type: String, default: 'user' },
    createdAt: { type: Date, default: Date.now }
});

const Deposit = mongoose.model('Deposit', new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    username: String,
    amount: Number,
    receiptImage: String, 
    status: { type: String, default: 'pending' }, 
    createdAt: { type: Date, default: Date.now }
}));

const User = mongoose.model('User', userSchema);

// ============ 2. Logic (وظائف الحساب التلقائي) ============

// تحديث حالة التعدين (تلقائي كل ساعتين)
const processMining = async (user) => {
    const now = new Date();
    let isModified = false;

    // 1. تحقق من انتهاء باقة الـ 7 أيام
    if (user.miningPlanActive && user.planExpiresAt && now > user.planExpiresAt) {
        user.miningPlanActive = false;
        user.miningMultiplier = 1;
        user.planExpiresAt = null;
        isModified = true;
    }

    // 2. حساب الأرباح بناءً على الوقت المنقضي
    const msPassed = now - user.lastMiningClaim;
    const hoursPassed = msPassed / (1000 * 60 * 60);

    if (hoursPassed >= 2) {
        const periods = Math.floor(hoursPassed / 2);
        const rewardPerPeriod = 10; // الربح الأساسي كل ساعتين
        user.miningBalance += periods * rewardPerPeriod * user.miningMultiplier;
        
        // تحديث الوقت لآخر فترة تم احتسابها
        user.lastMiningClaim = new Date(user.lastMiningClaim.getTime() + periods * 2 * 60 * 60 * 1000);
        isModified = true;
    }

    if (isModified) await user.save();
    return user;
};

// ============ 3. Middleware (التوثيق) ============

const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح لك، يرجى تسجيل الدخول' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch (e) { res.status(401).json({ error: 'جلسة منتهية' }); }
};

// ============ 4. Routes (المسارات) ============

// تسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, phone, referralCode } = req.body;
        
        const existing = await User.findOne({ $or: [{ email }, { username }] });
        if (existing) return res.status(400).json({ error: 'المستخدم أو البريد موجود مسبقاً' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            phone,
            referralCode: uuidv4().slice(0, 8).toUpperCase()
        });

        await newUser.save();
        const token = jwt.sign({ userId: newUser._id, role: newUser.role }, process.env.JWT_SECRET || 'secret123');
        res.json({ token, user: { username: newUser.username } });
    } catch (e) { res.status(500).json({ error: 'خطأ أثناء التسجيل' }); }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ error: 'بيانات الدخول غير صحيحة' });
        }
        const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET || 'secret123');
        res.json({ token, user: { username: user.username, role: user.role } });
    } catch (e) { res.status(500).json({ error: 'خطأ في السيرفر' }); }
});

// جلب بيانات المستخدم مع تحديث التعدين تلقائياً
app.get('/api/user/me', auth, async (req, res) => {
    try {
        let user = await User.findById(req.userId);
        user = await processMining(user);
        
        res.json({
            username: user.username,
            wallet: user.wallet,
            miningBalance: user.miningBalance,
            isPlanActive: user.miningPlanActive,
            multiplier: user.miningMultiplier,
            expiry: user.planExpiresAt
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// طلب شحن رصيد (يدوي)
app.post('/api/deposit/request', auth, async (req, res) => {
    try {
        const { amount, receiptImage } = req.body;
        const user = await User.findById(req.userId);
        
        const dep = new Deposit({
            userId: user._id,
            username: user.username,
            amount,
            receiptImage
        });
        await dep.save();
        res.json({ message: 'تم إرسال الطلب للمراجعة' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// شراء باقة التعدين (7 أيام)
app.post('/api/mining/buy-plan', auth, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        const PRICE = 5000; // سعر الباقة

        if (user.wallet < PRICE) return res.status(400).json({ error: 'رصيدك غير كافٍ' });

        user.wallet -= PRICE;
        user.miningMultiplier = 5; // مضاعفة الربح
        user.miningPlanActive = true;
        
        let expiry = new Date();
        expiry.setDate(expiry.getDate() + 7);
        user.planExpiresAt = expiry;

        await user.save();
        res.json({ success: true, message: 'تم تفعيل الباقة بنجاح' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// جمع أرباح التعدين للمحفظة
app.post('/api/mining/claim', auth, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (user.miningBalance <= 0) return res.status(400).json({ error: 'لا يوجد رصيد لجمعه' });

        user.wallet += user.miningBalance;
        user.miningBalance = 0;
        await user.save();
        res.json({ success: true, wallet: user.wallet });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ 5. Start ============

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dinar-dz';

mongoose.connect(MONGO_URI).then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}).catch(err => console.error(err));
