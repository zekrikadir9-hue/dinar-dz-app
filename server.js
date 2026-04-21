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

// ============ 1. MODELS (قواعد البيانات) ============

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    wallet: { type: Number, default: 0 },
    miningBalance: { type: Number, default: 0 },
    
    // نظام التعدين المطور
    miningMultiplier: { type: Number, default: 1 }, // 1 للربح العادي، يزداد عند شراء باقة
    miningPlanActive: { type: Boolean, default: false },
    planExpiresAt: { type: Date, default: null },
    lastMiningClaim: { type: Date, default: Date.now },
    
    referralCode: { type: String, unique: true },
    referredBy: String,
    role: { type: String, default: 'user' },
    createdAt: { type: Date, default: Date.now }
});

const depositSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    username: String,
    amount: Number,
    receiptImage: String, // رابط الصورة المرفوعة للوصل
    status: { type: String, default: 'pending' }, // pending, approved, rejected
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Deposit = mongoose.model('Deposit', depositSchema);
const Transaction = mongoose.model('Transaction', new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    type: String,
    amount: Number,
    description: String,
    createdAt: { type: Date, default: Date.now }
}));

// ============ 2. MIDDLEWARES (الحماية) ============

const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'premium_secret_777');
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch (e) { res.status(401).json({ error: 'جلسة غير صالحة' }); }
};

// ============ 3. HELPER FUNCTIONS (وظائف مساعدة) ============

// تحديث التعدين التلقائي وفحص انتهاء الباقة
const updateMiningState = async (user) => {
    const now = new Date();
    let updated = false;

    // 1. فحص انتهاء باقة الـ 7 أيام
    if (user.miningPlanActive && user.planExpiresAt && now > user.planExpiresAt) {
        user.miningPlanActive = false;
        user.miningMultiplier = 1;
        user.planExpiresAt = null;
        updated = true;
    }

    // 2. حساب الأرباح التلقائية (كل ساعتين)
    const msPassed = now - user.lastMiningClaim;
    const hoursPassed = msPassed / (1000 * 60 * 60);

    if (hoursPassed >= 2) {
        const periods = Math.floor(hoursPassed / 2);
        const baseReward = 10; // الربح الأساسي كل ساعتين
        const totalEarned = periods * baseReward * user.miningMultiplier;

        user.miningBalance += totalEarned;
        // تحديث الوقت لآخر فترة محسوبة
        user.lastMiningClaim = new Date(user.lastMiningClaim.getTime() + periods * 2 * 60 * 60 * 1000);
        updated = true;
    }

    if (updated) await user.save();
    return user;
};

// ============ 4. ROUTES (المسارات) ============

// تسجيل الدخول وجلب البيانات مع تحديث الحالة
app.get('/api/user/me', auth, async (req, res) => {
    try {
        let user = await User.findById(req.userId);
        user = await updateMiningState(user); // تحديث التعدين فوراً عند طلب البيانات
        
        res.json({
            username: user.username,
            wallet: user.wallet,
            miningBalance: user.miningBalance,
            miningMultiplier: user.miningMultiplier,
            isPlanActive: user.miningPlanActive,
            planExpires: user.planExpiresAt,
            referralCode: user.referralCode
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// إرسال طلب إيداع يدوي (وصل الدفع)
app.post('/api/deposit/request', auth, async (req, res) => {
    try {
        const { amount, receiptImage } = req.body;
        const user = await User.findById(req.userId);
        
        const request = new Deposit({
            userId: user._id,
            username: user.username,
            amount,
            receiptImage
        });
        
        await request.save();
        res.json({ message: 'تم استلام طلبك، سيتم شحن رصيدك بعد مراجعة الوصل' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// شراء باقة التعدين لمدة 7 أيام
app.post('/api/mining/buy-plan', auth, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        const PLAN_PRICE = 5000; // سعر الباقة مثال 5000 دينار

        if (user.wallet < PLAN_PRICE) {
            return res.status(400).json({ error: 'رصيد المحفظة غير كافٍ، اشحن أولاً' });
        }

        user.wallet -= PLAN_PRICE;
        user.miningMultiplier = 5; // الباقة تعطي 5 أضعاف الربح
        user.miningPlanActive = true;
        
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 7); // إضافة 7 أيام
        user.planExpiresAt = expiry;

        await user.save();
        
        const trans = new Transaction({
            userId: user._id,
            type: 'purchase',
            amount: PLAN_PRICE,
            description: 'شراء باقة تعدين 7 أيام'
        });
        await trans.save();

        res.json({ success: true, message: 'تم تفعيل باقة الـ 7 أيام بنجاح!' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// جمع أرباح التعدين إلى المحفظة
app.post('/api/mining/claim', auth, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (user.miningBalance <= 0) return res.status(400).json({ error: 'لا يوجد أرباح لجمعها' });

        const amount = user.miningBalance;
        user.wallet += amount;
        user.miningBalance = 0;
        await user.save();

        res.json({ success: true, newWallet: user.wallet });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ 5. SERVER INIT ============

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dinar-dz';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ Database Connected');
        app.listen(PORT, () => console.log(`🚀 Professional Server on port ${PORT}`));
    })
    .catch(err => console.error('❌ Error:', err));
