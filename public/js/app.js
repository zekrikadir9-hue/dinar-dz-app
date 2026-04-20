let currentUser = null;
let token = localStorage.getItem('token');
let cart = [];
const API_BASE = '';

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initAuth();
  initModals();
  loadStats();
  if (token) checkAuth();
});

function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      showPage(page);
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(page + 'Page').classList.add('active');
  if (page === 'shop') loadProducts();
  if (page === 'wallet') loadTransactions();
  if (page === 'referral') loadReferralData();
  if (page === 'lottery') loadLotteries();
}

function initAuth() {
  document.getElementById('loginBtn').addEventListener('click', () => document.getElementById('authModal').classList.add('active'));
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')));
  });
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('loginForm').style.display = tab.dataset.tab === 'login' ? 'block' : 'none';
      document.getElementById('registerForm').style.display = tab.dataset.tab === 'register' ? 'block' : 'none';
    });
  });

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (res.ok) {
        token = data.token;
        localStorage.setItem('token', token);
        currentUser = data.user;
        updateUI();
        document.getElementById('authModal').classList.remove('active');
        showNotification('تم الدخول بنجاح!');
      } else {
        showNotification(data.error, true);
      }
    } catch (e) { showNotification('حدث خطأ', true); }
  });

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const phone = document.getElementById('registerPhone').value;
    const password = document.getElementById('registerPassword').value;
    const referralCode = document.getElementById('registerReferralCode').value;
    try {
      const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email, phone, password, referralCode }) });
      const data = await res.json();
      if (res.ok) {
        token = data.token;
        localStorage.setItem('token', token);
        currentUser = data.user;
        updateUI();
        document.getElementById('authModal').classList.remove('active');
        showNotification('تم التسجيل بنجاح!');
      } else {
        showNotification(data.error, true);
      }
    } catch (e) { showNotification('حدث خطأ', true); }
  });
}

async function checkAuth() {
  try {
    const res = await fetch('/api/user', { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.ok) {
      currentUser = await res.json();
      updateUI();
    } else {
      logout();
    }
  } catch (e) { logout(); }
}

function logout() {
  token = null;
  currentUser = null;
  cart = [];
  localStorage.removeItem('token');
  updateUI();
  showPage('home');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-page="home"]').classList.add('active');
}

function updateUI() {
  const loginBtn = document.getElementById('loginBtn');
  const userInfo = document.getElementById('userInfo');
  const cartBtn = document.getElementById('cartBtn');
  if (currentUser) {
    loginBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    cartBtn.style.display = 'flex';
    document.getElementById('headerWallet').textContent = currentUser.wallet;
  } else {
    loginBtn.style.display = 'block';
    userInfo.style.display = 'none';
    cartBtn.style.display = 'none';
  }
}

function initModals() {
  document.getElementById('depositBtn').addEventListener('click', () => document.getElementById('depositModal').classList.add('active'));
  document.getElementById('depositForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseInt(document.getElementById('depositAmount').value);
    try {
      const res = await fetch('/api/wallet/deposit', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ amount }) });
      const data = await res.json();
      if (res.ok) {
        currentUser.wallet = data.wallet;
        updateUI();
        document.getElementById('depositModal').classList.remove('active');
        showNotification('تم شحن ' + amount + ' د.ج!');
      } else {
        showNotification(data.error, true);
      }
    } catch (e) { showNotification('حدث خطأ', true); }
  });

  document.getElementById('rechargePhoneBtn').addEventListener('click', () => document.getElementById('rechargeModal').classList.add('active'));
  document.getElementById('rechargeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const operator = document.getElementById('rechargeOperator').value;
    const phoneNumber = document.getElementById('rechargePhone').value;
    const amount = parseInt(document.getElementById('rechargeAmount').value);
    try {
      const res = await fetch('/api/recharge', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ operator, phoneNumber, amount }) });
      const data = await res.json();
      if (res.ok) {
        currentUser.wallet = data.wallet;
        updateUI();
        document.getElementById('rechargeModal').classList.remove('active');
        showNotification('تم شحن ' + amount + ' د.ج للرقم ' + phoneNumber + '!');
      } else {
        showNotification(data.error, true);
      }
    } catch (e) { showNotification('حدث خطأ', true); }
  });

  document.getElementById('payBillBtn').addEventListener('click', () => document.getElementById('billModal').classList.add('active'));
  document.getElementById('billForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const billType = document.getElementById('billType').value;
    const phoneNumber = document.getElementById('billNumber').value;
    const amount = parseInt(document.getElementById('billAmount').value);
    try {
      const res = await fetch('/api/bill/pay', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ billType, phoneNumber, amount }) });
      const data = await res.json();
      if (res.ok) {
        currentUser.wallet = data.wallet;
        updateUI();
        document.getElementById('billModal').classList.remove('active');
        showNotification('تم دفع الفاتورة!');
      } else {
        showNotification(data.error, true);
      }
    } catch (e) { showNotification('حدث خطأ', true); }
  });

  document.getElementById('cartBtn').addEventListener('click', () => { document.getElementById('cartModal').classList.add('active'); renderCart(); });
  document.getElementById('checkoutBtn').addEventListener('click', async () => {
    if (cart.length === 0) { showNotification('السلة فارغة!', true); return; }
    const total = cart.reduce((sum, item) => sum + item.price, 0);
    try {
      const res = await fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ products: cart, total }) });
      const data = await res.json();
      if (res.ok) {
        currentUser.wallet = data.wallet;
        updateUI();
        cart = [];
        document.getElementById('cartCount').textContent = '0';
        document.getElementById('cartModal').classList.remove('active');
        showNotification('تم الشراء بنجاح!');
      } else {
        showNotification(data.error, true);
      }
    } catch (e) { showNotification('حدث خطأ', true); }
  });
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    document.getElementById('totalUsers').textContent = data.users;
    document.getElementById('totalProducts').textContent = data.products;
    document.getElementById('totalOrders').textContent = data.orders;
  } catch (e) {}
}

document.getElementById('startMiningBtn').addEventListener('click', async () => {
  if (!token) { showNotification('يرجى تسجيل الدخول أولاً!', true); return; }
  try {
    const res = await fetch('/api/mining/start', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('miningBalance').textContent = data.miningBalance.toFixed(2);
      showNotification('اربحت ' + data.earned.toFixed(2) + ' عملة!');
    }
  } catch (e) { showNotification('حدث خطأ', true); }
});

document.getElementById('claimMiningBtn').addEventListener('click', async () => {
  if (!token) { showNotification('يرجى تسجيل الدخول أولاً!', true); return; }
  try {
    const res = await fetch('/api/mining/claim', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    if (res.ok) {
      currentUser.wallet = data.wallet;
      document.getElementById('miningBalance').textContent = '0';
      updateUI();
      showNotification('تم سحب الرصيد!');
    }
  } catch (e) { showNotification('حدث خطأ', true); }
});

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    const products = await res.json();
    renderProducts(products);
  } catch (e) { showNotification('حدث خطأ', true); }
}

function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = products.map(p => 
    '<div class="product-card"><img src="' + p.image + '" alt="' + p.name + '" class="product-image"><div class="product-info"><h3>' + p.name + '</h3><p>' + p.description + '</p><div class="product-price">' + p.price + ' د.ج</div><button class="add-to-cart" data-id="' + p._id + '" data-name="' + p.name + '" data-price="' + p.price + '"><i class="fas fa-cart-plus"></i> إضافة للسلة</button></div></div>'
  ).join('');
  grid.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!token) { showNotification('يرجى تسجيل الدخول أولاً!', true); return; }
      cart.push({ id: btn.dataset.id, name: btn.dataset.name, price: parseInt(btn.dataset.price) });
      document.getElementById('cartCount').textContent = cart.length;
      showNotification('تمت الإضافة للسلة!');
    });
  });
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const category = btn.dataset.category;
    try {
      const res = await fetch('/api/products');
      let products = await res.json();
      if (category !== 'all') products = products.filter(p => p.category === category);
      renderProducts(products);
    } catch (e) {}
  });
});

async function loadTransactions() {
  if (!token) return;
  try {
    const res = await fetch('/api/transactions', { headers: { 'Authorization': 'Bearer ' + token } });
    const transactions = await res.json();
    document.getElementById('walletBalance').textContent = currentUser.wallet;
    const list = document.getElementById('transactionsList');
    list.innerHTML = transactions.map(t => 
      '<div class="transaction-item"><div class="transaction-info"><h4>' + t.description + '</h4><p>' + new Date(t.createdAt).toLocaleString('ar') + '</p></div><div class="transaction-amount ' + (t.type === 'deposit' || t.type === 'mining' || t.type === 'referral' ? 'positive' : 'negative') + '">' + (t.type === 'deposit' || t.type === 'mining' || t.type === 'referral' ? '+' : '-') + t.amount + ' د.ج</div></div>'
    ).join('');
  } catch (e) {}
}

function loadReferralData() {
  if (!token) return;
  document.getElementById('myReferralCode').textContent = currentUser.referralCode;
  document.getElementById('referralsCount').textContent = currentUser.referrals;
  document.getElementById('referralEarnings').textContent = currentUser.referralEarnings;
  document.getElementById('userLevel').textContent = currentUser.level;
  document.getElementById('copyCodeBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(currentUser.referralCode);
    showNotification('تم نسخ الكود!');
  });
}

async function loadLotteries() {
  try {
    const res = await fetch('/api/lottery');
    const lotteries = await res.json();
    renderLotteries(lotteries);
  } catch (e) {}
}

function renderLotteries(lotteries) {
  const grid = document.getElementById('lotteriesGrid');
  grid.innerHTML = lotteries.map(l => 
    '<div class="lottery-card ' + (l.status === 'completed' ? 'winner' : '') + '"><h3>' + l.name + '</h3><p>' + l.description + '</p><div class="prize">' + l.prize + '</div><div class="participants">' + l.participants.length + ' مشارك</div>' + 
    (l.status === 'completed' ? '<div class="winner-badge">الفائز: ' + l.winner + '</div>' : '<button class="join-lottery" data-id="' + l._id + '">انضم للسحب</button>') + '</div>'
  ).join('');
  grid.querySelectorAll('.join-lottery').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!token) { showNotification('يرجى تسجيل الدخول أولاً!', true); return; }
      try {
        const res = await fetch('/api/lottery/join', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ lotteryId: btn.dataset.id }) });
        if (res.ok) { showNotification('تم الانضمام للسحب!'); loadLotteries(); }
        else { const data = await res.json(); showNotification(data.error, true); }
      } catch (e) { showNotification('حدث خطأ', true); }
    });
  });
}

function renderCart() {
  const cartItems = document.getElementById('cartItems');
  const cartTotal = document.getElementById('cartTotal');
  if (cart.length === 0) {
    cartItems.innerHTML = '<p style="text-align: center; color: var(--text-muted);">السلة فارغة</p>';
    cartTotal.textContent = '0';
    return;
  }
  cartItems.innerHTML = cart.map((item, index) => 
    '<div class="cart-item"><div class="cart-item-info"><h4>' + item.name + '</h4><p>' + item.price + ' د.ج</p></div><button class="cart-item-remove" data-index="' + index + '">×</button></div>'
  ).join('');
  cartTotal.textContent = cart.reduce((sum, item) => sum + item.price, 0);
  cartItems.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => { cart.splice(parseInt(btn.dataset.index), 1); document.getElementById('cartCount').textContent = cart.length; renderCart(); });
  });
}

function showNotification(message, isError = false) {
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();
  const notif = document.createElement('div');
  notif.className = 'notification' + (isError ? ' error' : '');
  notif.textContent = message;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}