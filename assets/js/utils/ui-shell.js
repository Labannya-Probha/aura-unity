// ══════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════
function toast(msg, type='success') {
  const icons = {success:'✅',error:'❌',info:'ℹ️',warning:'⚠️'};
  const t = document.createElement('div');
  t.className = `toast t-${type}`;
  const icon = document.createElement('span');
  icon.style.fontSize = '17px';
  icon.textContent = icons[type] || icons.info;
  const text = document.createElement('span');
  text.textContent = msg;
  t.append(icon, text);
  document.getElementById('toastWrap').appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='.3s'; setTimeout(()=>t.remove(),300); }, 3200);
}

function normalizeWelcomeName(name = '') {
  return (name || '').trim();
}

function getWelcomeText(safeName = '') {
  return safeName ? `স্বাগতম, ${safeName}!` : 'স্বাগতম!';
}

function getBadgeInitial(safeName = '') {
  if (!safeName) return '';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(safeName)[Symbol.iterator]().next().value;
    return (first?.segment || '').toUpperCase();
  }
  return (Array.from(safeName)[0] || '').toUpperCase();
}

function applyWelcomeBrand(pop, badge, safeName) {
  const company = S.company || {};
  const primary = company.primary_color || company.primaryColor || company.brand_primary || company.brandPrimary || '';
  const secondary = company.secondary_color || company.secondaryColor || company.brand_secondary || company.brandSecondary || '';
  const accent = company.accent_color || company.accentColor || company.brand_accent || company.brandAccent || '';
  if (primary) pop.style.setProperty('--welcome-primary', primary);
  if (secondary) pop.style.setProperty('--welcome-secondary', secondary);
  if (accent) pop.style.setProperty('--welcome-accent', accent);

  const logo = company.logo || '';
  if (logo) {
    badge.style.backgroundImage = `url(${logo})`;
    badge.textContent = '';
    return;
  }
  badge.style.backgroundImage = '';
  badge.textContent = getBadgeInitial(company.name || safeName) || 'A';
}

function showWelcomePopover(name = '') {
  const POPOVER_TRANSITION_MS = 260;
  const POPOVER_DISPLAY_MS = 3200;
  const pop = document.getElementById('welcomePopover');
  const badge = document.getElementById('welcomeBadge');
  const text = document.getElementById('welcomeText');
  if (!pop || !badge || !text || S.welcomeShown) return;
  S.welcomeShown = true;
  clearTimeout(S.welcomeTimer);
  clearTimeout(S.welcomeHideTimer);
  const safeName = normalizeWelcomeName(name);
  applyWelcomeBrand(pop, badge, safeName);
  text.textContent = getWelcomeText(safeName);
  pop.classList.remove('hidden');
  pop.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => requestAnimationFrame(() => pop.classList.add('show')));
  S.welcomeTimer = setTimeout(() => {
    pop.classList.remove('show');
    S.welcomeHideTimer = setTimeout(() => {
      pop.classList.add('hidden');
      pop.setAttribute('aria-hidden', 'true');
    }, POPOVER_TRANSITION_MS);
  }, POPOVER_DISPLAY_MS);
}

// ══════════════════════════════════════════
// LANGUAGE
// ══════════════════════════════════════════
function setLang(lang) {
  S.lang = lang;
  localStorage.setItem('aura_lang', lang);
  document.documentElement.setAttribute('data-lang', lang);
  document.getElementById('langBn')?.classList.toggle('active', lang==='bn');
  document.getElementById('langEn')?.classList.toggle('active', lang==='en');
  document.querySelectorAll('[data-lang-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang-btn') === lang);
  });
  document.querySelectorAll('[data-bn][data-en]').forEach(el => {
    if (el.tagName==='INPUT'||el.tagName==='SELECT'||el.tagName==='TEXTAREA') return;
    const val = el.getAttribute('data-'+lang);
    if (val) el.textContent = val;
  });
  applyStaticTextDictionary(lang);
  const activeModule = document.querySelector('.module.active')?.id || 'dashboard';
  const title = document.getElementById('topTitle');
  if (title) title.textContent = TT[lang]?.[activeModule] || activeModule;
  syncSidebarRole();
  updateDestructiveControls();
  refreshActiveLanguageContent(activeModule);
}

function refreshActiveLanguageContent(activeModule) {
  syncRoleInputOptions();
  if (activeModule === 'coa') renderCOA(S.coa || []);
  if (activeModule === 'collection') loadCollections();
  if (activeModule === 'users') loadUsers();
  if (activeModule === 'ledger') loadLedger();
  if (activeModule === 'receipt') genReceiptPreview();
  if (activeModule === 'dashboard') loadDashboard();
}

function syncRoleInputOptions() {
  const select = document.getElementById('nuRole');
  if (!select) return;
  const current = normalizeRole(select.value || 'user');
  const roles = ['user', 'manager', 'superuser'];
  select.innerHTML = roles.map(role => `<option value="${role}" ${role===current?'selected':''}>${esc(roleText(role))}</option>`).join('');
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
// MOBILE SIDEBAR TOGGLE
// ══════════════════════════════════════════
function openMobSidebar() {
  document.querySelector('.sidebar').classList.add('mob-open');
  document.getElementById('mobOverlay').classList.add('mob-open');
}
function closeMobSidebar() {
  document.querySelector('.sidebar').classList.remove('mob-open');
  document.getElementById('mobOverlay').classList.remove('mob-open');
}

// ══════════════════════════════════════════
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => {
    openModule(el.getAttribute('data-module'));
    closeMobSidebar();
  });
});
function openModule(id) {
  if (id==='journal') id = 'voucher';
  updateDestructiveControls();
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  const t = document.getElementById(id);
  if (t) t.classList.add('active');
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  document.querySelector('.content')?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.getAttribute('data-module')===id));
  document.querySelectorAll('.mob-nav-btn[data-module]').forEach(b => b.classList.toggle('active', b.getAttribute('data-module')===id));
  document.getElementById('topTitle').textContent = TT[S.lang][id] || id;
  document.getElementById('topSub').textContent = '';
  if (id==='collection') loadCollections();
  if (id==='daybook')    loadDaybook();
  if (id==='trialbalance') loadTrialBalance();
  if (id==='balancesheet') loadBalanceSheet();
  if (id==='coa')        loadCOA();
  if (id==='voucher')    { renderDayControlState(); if (S.jlc===0) { addJLine(); addJLine(); } loadVoucherSummary(); }
  if (id==='ledger')     loadCOASelect();
  if (id==='receipt')    { genReceiptPreview(); setTimeout(initSignaturePad, 200); }
  if (id==='dashboard')  loadDashboard();
  if (id==='users')      loadUsers();
  if (id==='contacts')   loadMembers();
  if (id==='periodclose' && window.PeriodClosingV1) window.PeriodClosingV1.load();
}

// ══════════════════════════════════════════
// LOGIN — Supabase Auth
// ══════════════════════════════════════════
async function login() {
  const now = Date.now();
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value; // do NOT trim passwords
  const err = document.getElementById('loginErr');
  const btn = document.getElementById('loginBtn');

  // Client-side rate-limit (defence-in-depth)
  if (now < _loginLockUntil) {
    const remaining = Math.ceil((_loginLockUntil - now) / 1000);
    err.textContent = `অনেক বেশি প্রচেষ্টা। ${remaining} সেকেন্ড পরে আবার চেষ্টা করুন।`;
    err.classList.remove('hidden');
    return;
  }

  if (!username || !password) {
    err.textContent = 'ইউজারনেম ও পাসওয়ার্ড দিন।';
    err.classList.remove('hidden');
    return;
  }
  err.classList.add('hidden');
  btn.disabled = true; btn.textContent = '...';

  try {
    // Edge Function দিয়ে username → email → Supabase Auth
    const res = await fetch(`${SUPA_URL}/functions/v1/login-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_ANON,
        'Authorization': `Bearer ${SUPA_ANON}`,
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    btn.disabled = false;
    btn.innerHTML = '<span data-bn="লগইন করুন" data-en="Sign In">লগইন করুন</span>';

    if (!data.ok) {
      _loginAttempts++;
      if (_loginAttempts >= _MAX_ATTEMPTS) {
        _loginLockUntil = Date.now() + _LOCKOUT_MS;
        _loginAttempts = 0;
        err.textContent = 'অনেক বেশি ব্যর্থ প্রচেষ্টা। ১৫ মিনিট পরে আবার চেষ্টা করুন।';
      } else {
        err.textContent = data.message || 'ইউজারনেম বা পাসওয়ার্ড ভুল।';
      }
      err.classList.remove('hidden');
      return;
    }

    _loginAttempts = 0;
    _loginLockUntil = 0;

    // Supabase client এ session set করো
    if (data.access_token) {
      await sb.auth.setSession({
        access_token:  data.access_token,
        refresh_token: data.refresh_token || '',
      });
    }
    const { data: { session } } = await sb.auth.getSession();

    S.user = data.user;
    S.session = session;
    S.tenantId = null;
    S.tenantSlug = getRouteTenantSlug();
    S.tenantResolved = false;
    S.welcomeShown = false;
    S.activeMemberRole = null;

    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('mobBottomNav').classList.remove('hidden');
    document.getElementById('sbRole').textContent  = data.user.role  || 'Super User';
    document.getElementById('sbUname').textContent = data.user.name  || username;

    _resetIdleTimer();
    await initApp();
    const welcomeName = normalizeWelcomeName(data.user.name || username);
    showWelcomePopover(welcomeName);

  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '<span>লগইন করুন</span>';
    err.textContent = 'সংযোগ ব্যর্থ: ' + e.message;
    err.classList.remove('hidden');
  }
}

async function logout() {
  await sb.auth.signOut();
  S.user = null; S.session = null; S.tenantId = null; S.tenantSlug = getRouteTenantSlug(); S.tenantResolved = false; S.welcomeShown = false; S.activeMemberRole = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('mobBottomNav').classList.add('hidden');
  document.getElementById('loginModal').classList.remove('hidden');
  updateDestructiveControls();
}

