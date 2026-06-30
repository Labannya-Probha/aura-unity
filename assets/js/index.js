// ══════════════════════════════════════════
// SECURITY HELPERS
// ══════════════════════════════════════════
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rptTrusted(html = '') {
  return { html: String(html == null ? '' : html) };
}

// Login rate-limiting (client-side, defence-in-depth)
let _loginAttempts = 0;
let _loginLockUntil = 0;
const _MAX_ATTEMPTS = 5;
const _LOCKOUT_MS   = 15 * 60 * 1000; // 15 minutes

// Session idle timeout (30 minutes)
let _idleTimer;
const _IDLE_MS = 30 * 60 * 1000;
function _resetIdleTimer() {
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    toast('নিষ্ক্রিয়তার কারণে সেশন শেষ হয়েছে।', 'warning');
    setTimeout(logout, 2000);
  }, _IDLE_MS);
}
['click','keydown','mousemove','touchstart','scroll'].forEach(ev =>
  document.addEventListener(ev, _resetIdleTimer, { passive: true })
);

// ══════════════════════════════════════════
// SUPABASE INIT
// ══════════════════════════════════════════
const SUPA_URL  = 'https://ltcjgbhjkfvlzzvvulhz.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Y2pnYmhqa2Z2bHp6dnZ1bGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NDM2MjYsImV4cCI6MjA5ODExOTYyNn0.nfSI1_x4LSg9xNGQJSeflU8_zWSnpwRmzRBG0_YldUc';
const { createClient } = supabase;
const sb = createClient(SUPA_URL, SUPA_ANON);

// ══════════════════════════════════════════
// APP STATE
// ══════════════════════════════════════════
var S = {
  lang: 'bn',
  user: null,
  session: null,
  company: { name:"Challengers of 90's", sub:"Non Profit Krira Songothon ERP", address:"Victoria School Field, Sreemangal", phone:"01XXXXXXXXX", logo:"" },
  coa: [],
  jlc: 0,
  lastReceipt: null,
  editJournalId: null,
  tenantId: null,
  tenantSlug: null,
  tenantResolved: false,
  tenantResolveError: null,
  tenantWarningShown: false,
  welcomeShown: false,
  welcomeTimer: null,
  welcomeHideTimer: null,
  activeMemberRole: null,
  tenantColumnSupport: {}
};

var TT = {
  bn:{dashboard:'ড্যাশবোর্ড',collection:'মাসিক কালেকশন',voucher:'ভাউচার ও জার্নাল',receipt:'মানি রিসিট',reports:'রিপোর্টস',journal:'ভাউচার ও জার্নাল',ledger:'লেজার বুক',daybook:'ডে বুক',trialbalance:'ট্রায়াল ব্যালেন্স',balancesheet:'ব্যালেন্স শীট',coa:'চার্ট অব অ্যাকাউন্টস',company:'কোম্পানি তথ্য',users:'ইউজার'},
  en:{dashboard:'Dashboard',collection:'Collections',voucher:'Voucher & Journal',receipt:'Money Receipt',reports:'Reports',journal:'Voucher & Journal',ledger:'Ledger Book',daybook:'Day Book',trialbalance:'Trial Balance',balancesheet:'Balance Sheet',coa:'Chart of Accounts',company:'Company Info',users:'Users'}
};

const LOCAL_STATE_KEY = 'aura-unity-local-state-v2';

// Maps tenant_members.role values to display labels (Bengali/English)
const MEMBER_ROLE_LABELS = { owner: 'Owner', superuser: 'Super User', manager: 'ম্যানেজার', user: 'ইউজার' };
const MEMBER_ROLE_BADGES = { owner: 'bg-danger', superuser: 'bg-gold', manager: 'bg-navy', user: 'bg-green' };

function getRouteTenantSlug() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && ['login', 'dashboard', 'reports'].includes(parts[1])) return parts[0];
  return null;
}

function getTenantSlugCandidates(slug) {
  const decoded = (() => {
    try { return decodeURIComponent(String(slug || '')); }
    catch (_) { return String(slug || ''); }
  })();
  const compact = decoded.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const dashed = decoded.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return [...new Set([decoded, decoded.toLowerCase(), decoded.replace(/['’]/g, ''), compact, dashed].filter(Boolean))];
}

function isDefaultTenantSlug(slug) {
  return getTenantSlugCandidates(slug).some((candidate) => candidate === 'challangersof90s');
}

function safeJsonParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch (error) { console.warn('Local state parse failed:', error); return fallback; }
}

function getLocalState() {
  return safeJsonParse(localStorage.getItem(LOCAL_STATE_KEY), { daySessions:{}, receiptMeta:{} });
}

function setLocalState(state) {
  localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
  return state;
}

function updateLocalState(mutator) {
  const state = getLocalState();
  mutator(state);
  return setLocalState(state);
}

function getCurrentUserName() {
  return S.user?.name || document.getElementById('sbUname')?.textContent || 'System User';
}

function getCurrentRole() {
  return S.user?.role || document.getElementById('sbRole')?.textContent || 'ইউজার';
}

function isSuperUser() {
  if (S.activeMemberRole === 'owner' || S.activeMemberRole === 'superuser') return true;
  return /super\s*user/i.test(getCurrentRole());
}

function fmtDateTime(value) {
  if (!value) return '—';
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? value : dt.toLocaleString('en-GB');
}

function getCoaMap() {
  return S.coa.reduce((acc, row) => { acc[row.account_code] = row; return acc; }, {});
}

async function readJournalItemsWithContext(buildQuery) {
  const [itemsRes, journalsRes] = await Promise.all([
    readTenantRows('journal_items', buildQuery),
    readTenantRows('journals', (from) => from.select('id,journal_date,ref_no,narration')),
  ]);
  const journalMap = (journalsRes.data || []).reduce((acc, row) => {
    acc[row.id] = row;
    return acc;
  }, {});
  const coaMap = getCoaMap();
  return {
    data: (itemsRes.data || []).map((row) => ({
      ...row,
      coa: coaMap[row.account_code] || null,
      journals: journalMap[row.journal_id] || null,
    })),
    error: itemsRes.error || journalsRes.error || null,
  };
}

function getCurrentAssetAccounts() {
  const assets = S.coa.filter(a => String(a.account_group || '').toLowerCase() === 'asset' && String(a.account_type || 'ledger').toLowerCase() !== 'group');
  const fallback = [
    { account_code:'1110', account_name:'Cash in Hand', account_group:'Asset', opening_balance:0 },
    { account_code:'1120', account_name:'Bank Account', account_group:'Asset', opening_balance:0 }
  ];
  return (assets.length ? assets : fallback).map(a => ({ ...a, opening_balance:Number(a.opening_balance || 0) }));
}

function getPrimaryCashAccountCode() {
  const assets = getCurrentAssetAccounts();
  const match = assets.find(a => /cash/i.test(a.account_name || '') || a.account_code === '1110');
  return (match || assets[0] || {}).account_code || '1110';
}

function getSessionDates() {
  return Object.keys(getLocalState().daySessions || {}).sort();
}

function getDaySession(date) {
  return getLocalState().daySessions?.[date] || null;
}

function getPreviousDaySession(date) {
  const state = getLocalState();
  const dates = Object.keys(state.daySessions || {}).filter(d => d < date).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    const session = state.daySessions[dates[i]];
    if (session) return session;
  }
  return null;
}

function deriveOpeningBalances(date) {
  const current = getDaySession(date);
  if (current?.openingBalances) return current.openingBalances;
  const previous = getPreviousDaySession(date);
  if (previous?.closeSummary) {
    const carry = {};
    Object.keys(previous.closeSummary).forEach(code => { carry[code] = Number(previous.closeSummary[code]?.closing || 0); });
    return carry;
  }
  return getCurrentAssetAccounts().reduce((acc, a) => {
    acc[a.account_code] = Number(a.opening_balance || 0);
    return acc;
  }, {});
}

function renderOpeningBalanceRows(date, balances) {
  const body = document.getElementById('openingBalanceBody');
  if (!body) return;
  const opening = balances || deriveOpeningBalances(date || new Date().toISOString().slice(0,10));
  const rows = getCurrentAssetAccounts();
  body.innerHTML = rows.map(a => `
    <tr>
      <td><strong>${a.account_name}</strong><div class="td-m" style="font-size:11px">${a.account_code}</div></td>
      <td><input class="form-control" type="number" data-account="${a.account_code}" value="${Number(opening[a.account_code] ?? a.opening_balance ?? 0)}"></td>
    </tr>`).join('') || '<tr><td colspan="2" class="td-m" style="text-align:center;padding:18px">Current asset head পাওয়া যায়নি</td></tr>';
}

function collectOpeningBalancesFromUI() {
  const balances = {};
  document.querySelectorAll('#openingBalanceBody input[data-account]').forEach(input => {
    balances[input.getAttribute('data-account')] = Number(input.value || 0);
  });
  return balances;
}

function seedOpeningBalanceInputs() {
  const date = document.getElementById('dayDate')?.value || new Date().toISOString().slice(0,10);
  renderOpeningBalanceRows(date, deriveOpeningBalances(date));
  toast('Previous closing / opening balance লোড হয়েছে।', 'info');
}

function renderDayAuditTable() {
  const body = document.getElementById('dayAuditBody');
  if (!body) return;
  const sessions = Object.values(getLocalState().daySessions || {}).sort((a,b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 8);
  if (!sessions.length) {
    body.innerHTML = '<tr><td colspan="4" class="td-m" style="text-align:center;padding:18px">কোনো audit নেই</td></tr>';
    return;
  }
  body.innerHTML = sessions.map(s => `
    <tr>
      <td><strong>${esc(s.date || '—')}</strong></td>
      <td><span class="badge ${s.status === 'closed' ? 'bg-green' : 'bg-gold'}">${s.status === 'closed' ? 'Closed' : 'Open'}</span></td>
      <td>${s.openedBy ? `${esc(s.openedBy)}<div class="td-m" style="font-size:11px">${esc(fmtDateTime(s.openedAt))}</div>` : '<span class="td-m">—</span>'}</td>
      <td>${s.closedBy ? `${esc(s.closedBy)}<div class="td-m" style="font-size:11px">${esc(fmtDateTime(s.closedAt))}</div>` : '<span class="td-m">—</span>'}</td>
    </tr>`).join('');
}

function renderDayControlState() {
  const date = document.getElementById('dayDate')?.value || new Date().toISOString().slice(0,10);
  const session = getDaySession(date);
  const badge = document.getElementById('dayStatusBadge');
  const text = document.getElementById('dayStatusText');
  const openMeta = document.getElementById('dayOpenMeta');
  const closeMeta = document.getElementById('dayCloseMeta');
  if (badge) {
    badge.className = `badge ${session?.status === 'closed' ? 'bg-green' : session?.status === 'open' ? 'bg-gold' : 'bg-danger'}`;
    badge.textContent = session?.status === 'closed' ? 'Day Closed' : session?.status === 'open' ? 'Day Open' : 'Closed / Pending';
  }
  if (text) {
    text.textContent = session?.status === 'closed'
      ? `Closed for ${date}`
      : session?.status === 'open'
        ? `Open for ${date}`
        : (isSuperUser() ? 'Pending Day Open' : 'Pending Super User approval');
  }
  if (openMeta) openMeta.innerHTML = session?.openedBy ? `${session.openedBy}<div class="td-m" style="font-size:11px">${fmtDateTime(session.openedAt)}</div>` : '—';
  if (closeMeta) closeMeta.innerHTML = session?.closedBy ? `${session.closedBy}<div class="td-m" style="font-size:11px">${fmtDateTime(session.closedAt)}</div>` : '—';
  renderDayAuditTable();
}

function getReceiptMeta(receiptNo) {
  return getLocalState().receiptMeta?.[receiptNo] || {};
}

function persistReceiptMeta(receiptNo, payload) {
  updateLocalState(state => {
    state.receiptMeta = state.receiptMeta || {};
    state.receiptMeta[receiptNo] = { ...(state.receiptMeta[receiptNo] || {}), ...payload };
  });
}

function amountToWords(num) {
  const ones = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const toWords = n => {
    n = Math.floor(n || 0);
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + toWords(n % 100) : '');
    if (n < 100000) return toWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + toWords(n % 1000) : '');
    if (n < 10000000) return toWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + toWords(n % 100000) : '');
    return String(n);
  };
  return `${toWords(num || 0)} Taka Only`;
}

function getReceiptDraft() {
  const meta = getReceiptMeta(document.getElementById('colRno')?.value || '');
  const last = S.lastReceipt || {};
  const amount = Number(document.getElementById('colAmt')?.value || last.amount || meta.amount || 0);
  return {
    rno: document.getElementById('colRno')?.value || last.rno || meta.rno || genRno(),
    date: document.getElementById('colDate')?.value || last.date || meta.date || new Date().toISOString().slice(0,10),
    name: document.getElementById('colName')?.value.trim() || last.name || meta.name || '---',
    amount,
    desc: document.getElementById('colDesc')?.value.trim() || last.desc || meta.desc || '---',
    head: document.getElementById('colHead')?.value || last.head || meta.head || 'General Collection',
    mode: document.getElementById('colMode')?.value || last.mode || meta.mode || 'Cash'
  };
}

function canEditVoucher() {
  if (S.activeMemberRole === 'owner' || S.activeMemberRole === 'superuser' || S.activeMemberRole === 'manager') return true;
  return isSuperUser() || /admin|manager|ম্যানেজার/i.test(getCurrentRole());
}

function getVoucherPrefix(type) {
  const normalized = String(type || '').toLowerCase();
  if (normalized.includes('জার্নাল') || normalized.includes('journal')) return 'JV';
  if (normalized.includes('রিসিট') || normalized.includes('receipt')) return 'DV';
  if (normalized.includes('পেমেন্ট') || normalized.includes('payment')) return 'CV';
  if (normalized.includes('কনট্রা') || normalized.includes('contra')) return 'CN';
  return 'JV';
}

function makeVoucherRef(type) {
  return `${getVoucherPrefix(type)}-${new Date().getFullYear()}-${String(Math.floor(1000+Math.random()*9000))}`;
}

function refreshVoucherRef() {
  const type = document.getElementById('vchType')?.value || 'পেমেন্ট';
  const noEl = document.getElementById('vchNo');
  if (noEl && !noEl.dataset.locked) noEl.value = makeVoucherRef(type);
}

function setVoucherTab(_tab) { loadVoucherSummary(); }

async function fetchStatementSource(range) {
  const assets = getCurrentAssetAccounts();
  const assetCodes = assets.map(a => a.account_code);
  const coaMap = getCoaMap();
  const [colRes, vchRes, jRes] = await Promise.all([
    readTenantRows('collections', (from) => withDateRange(from.select('collection_date,receipt_no,description,amount').order('collection_date'), 'collection_date')),
    readTenantRows('vouchers', (from) => withDateRange(from.select('id,vch_date,description,amount,vch_type,account_code').order('vch_date'), 'vch_date')),
    readJournalItemsWithContext((from) => from.select('journal_id,account_code,debit,credit').in('account_code', assetCodes))
  ]);
  const journals = (jRes.data || []).filter(r => isWithinDateRange(r.journals?.journal_date, range));
  return { assets, assetCodes, coaMap, collections: colRes.data || [], vouchers: vchRes.data || [], journals };
}

function buildStatementSummary(source, openingBalances) {
  const assetSummary = source.assets.reduce((acc, asset) => {
    acc[asset.account_code] = {
      code: asset.account_code,
      name: asset.account_name,
      opening: Number(openingBalances[asset.account_code] ?? asset.opening_balance ?? 0),
      receipts: 0,
      payments: 0,
      net: 0,
      closing: Number(openingBalances[asset.account_code] ?? asset.opening_balance ?? 0)
    };
    return acc;
  }, {});
  const headSummary = {};
  const headPush = (head, receipt = 0, payment = 0) => {
    if (!headSummary[head]) headSummary[head] = { head, receipts:0, payments:0, net:0 };
    headSummary[head].receipts += Number(receipt || 0);
    headSummary[head].payments += Number(payment || 0);
    headSummary[head].net = headSummary[head].receipts - headSummary[head].payments;
  };
  const cashCode = getPrimaryCashAccountCode();
  source.collections.forEach(r => {
    const amount = Number(r.amount || 0);
    if (assetSummary[cashCode]) assetSummary[cashCode].receipts += amount;
    headPush(getReceiptMeta(r.receipt_no).head || 'Collection', amount, 0);
  });
  source.vouchers.forEach(r => {
    const amount = Number(r.amount || 0);
    const code = r.account_code;
    const accountName = source.coaMap[code]?.account_name || code || 'Voucher';
    const isPayment = String(r.vch_type || '').includes('পেমেন্ট') || String(r.vch_type || '').toLowerCase().includes('payment');
    if (assetSummary[code]) {
      if (isPayment) assetSummary[code].payments += amount;
      else assetSummary[code].receipts += amount;
    }
    headPush(`${r.vch_type || 'Voucher'} — ${accountName}`, isPayment ? 0 : amount, isPayment ? amount : 0);
  });
  source.journals.forEach(r => {
    const code = r.account_code;
    if (!assetSummary[code]) return;
    const debit = Number(r.debit || 0);
    const credit = Number(r.credit || 0);
    assetSummary[code].receipts += debit;
    assetSummary[code].payments += credit;
    const head = `${r.coa?.account_name || code} ${r.journals?.ref_no ? `(${r.journals.ref_no})` : ''}`.trim();
    headPush(head, debit, credit);
  });
  Object.values(assetSummary).forEach(item => {
    item.net = item.receipts - item.payments;
    item.closing = item.opening + item.net;
  });
  return {
    assetSummary,
    assetRows: Object.values(assetSummary),
    headRows: Object.values(headSummary).sort((a,b) => a.head.localeCompare(b.head))
  };
}

async function summarizeCurrentAssets(range, openingBalances) {
  const source = await fetchStatementSource(range);
  return buildStatementSummary(source, openingBalances || deriveOpeningBalances(range.from || new Date().toISOString().slice(0,10)));
}

async function openDay() {
  const date = document.getElementById('dayDate')?.value || new Date().toISOString().slice(0,10);
  if (!isSuperUser()) {
    renderDayControlState();
    toast('Day Open শুধু Super User করতে পারবে।', 'error');
    return;
  }
  const openingBalances = deriveOpeningBalances(date);
  updateLocalState(state => {
    const current = state.daySessions[date] || { date };
    state.daySessions[date] = {
      ...current,
      date,
      status: 'open',
      openingBalances,
      openedBy: getCurrentUserName(),
      openedRole: getCurrentRole(),
      openedAt: new Date().toISOString(),
      closeSummary: current.closeSummary || null,
      closedBy: current.closedBy || '',
      closedAt: current.closedAt || ''
    };
  });
  renderDayControlState();
  toast('Day Open সম্পন্ন হয়েছে।', 'success');
}

async function closeDay() {
  const date = document.getElementById('dayDate')?.value || new Date().toISOString().slice(0,10);
  const openingBalances = getDaySession(date)?.openingBalances || collectOpeningBalancesFromUI() || deriveOpeningBalances(date);
  const summary = await summarizeCurrentAssets({ from: date, to: date }, openingBalances);
  updateLocalState(state => {
    const current = state.daySessions[date] || { date };
    state.daySessions[date] = {
      ...current,
      date,
      status: 'closed',
      openingBalances,
      openedBy: current.openedBy || 'Auto carry forward',
      openedAt: current.openedAt || new Date().toISOString(),
      closedBy: getCurrentUserName(),
      closedAt: new Date().toISOString(),
      closeSummary: Object.values(summary.assetSummary).reduce((acc, item) => {
        acc[item.code] = item;
        return acc;
      }, {})
    };
  });
  renderDayControlState();
  toast('Day Close সম্পন্ন হয়েছে।', 'success');
}

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
  document.documentElement.setAttribute('data-lang', lang);
  document.getElementById('langBn').classList.toggle('active', lang==='bn');
  document.getElementById('langEn').classList.toggle('active', lang==='en');
  document.querySelectorAll('[data-bn][data-en]').forEach(el => {
    if (el.tagName==='INPUT'||el.tagName==='SELECT'||el.tagName==='TEXTAREA') return;
    const val = el.getAttribute('data-'+lang);
    if (val) el.textContent = val;
  });
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
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  const t = document.getElementById(id);
  if (t) t.classList.add('active');
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

    S.user = data.user;
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
}

// ══════════════════════════════════════════
// INIT APP
// ══════════════════════════════════════════
async function initApp() {
  const today = new Date().toISOString().slice(0,10);
  ['colDate','vchDate','jDate','dayDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });
  document.getElementById('jRef').value = makeVoucherRef('জার্নাল');
  document.getElementById('colRno').value = genRno();
  refreshVoucherRef();

  await getTenantId();
  // Reflect the resolved tenant member role in the sidebar
  if (S.activeMemberRole) {
    document.getElementById('sbRole').textContent = MEMBER_ROLE_LABELS[S.activeMemberRole] || S.activeMemberRole;
  }
  await loadVoucherSummary();
  await loadCompany();
  await loadCOA();
  renderDayControlState();
  await loadDashboard();
  initDashChart();
}

// ══════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════
async function loadDashboard() {
  const [{ count: colCount }, { count: vchCount }, { count: jCount }, colData] = await Promise.all([
    readTenantRows('collections', (from) => from.select('*', { count:'exact', head:true })),
    readTenantRows('vouchers', (from) => from.select('*', { count:'exact', head:true })),
    readTenantRows('journals', (from) => from.select('*', { count:'exact', head:true })),
    readTenantRows('collections', (from) => from.select('amount'))
  ]);
  const totalCol = (colData.data || []).reduce((s,r) => s + Number(r.amount||0), 0);
  document.getElementById('statCollection').textContent = fmt(totalCol);
  document.getElementById('statVoucher').textContent    = vchCount || 0;
  document.getElementById('statJournal').textContent    = jCount   || 0;
  document.getElementById('statCash').textContent       = fmt(totalCol);
}

// ══════════════════════════════════════════
// COMPANY
// ══════════════════════════════════════════
async function loadCompany() {
  const { data } = await readTenantRows('company_info', (from) => from.select('setting_key,setting_value'));
  if (!data || !data.length) return;
  data.forEach(r => { S.company[r.setting_key] = r.setting_value; });
  applyCompany();
}

function applyCompany() {
  const c = S.company;
  document.getElementById('sbName').textContent = c.name || "Challengers of 90's";
  document.getElementById('sbSub').textContent  = c.sub  || 'ERP System';
  if (c.logo) {
    ['sbLogo','rcpLogo','rcpLogo2','coLogoPreview'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.backgroundImage=`url(${c.logo})`; el.style.backgroundSize='cover'; el.textContent=''; }
    });
  }
  document.getElementById('coName').value  = c.name    || '';
  document.getElementById('coSub').value   = c.sub     || '';
  document.getElementById('coPhone').value = c.phone   || '';
  document.getElementById('coAddr').value  = c.address || '';
}

async function saveCompany() {
  const c = {
    name:    document.getElementById('coName').value.trim(),
    sub:     document.getElementById('coSub').value.trim(),
    phone:   document.getElementById('coPhone').value.trim(),
    address: document.getElementById('coAddr').value.trim(),
    logo:    S.company.logo || ''
  };
  if (!c.name) { toast('কোম্পানির নাম দিন।','warning'); return; }
  Object.assign(S.company, c);
  await getTenantId();
  if (!requireTenantForWrite()) return;
  const rows = tenantInsertPayload(Object.keys(c).map(k => ({ setting_key:k, setting_value:c[k], updated_at: new Date().toISOString() })));
  const { error } = await writeWithOptionalTenant('company_info', rows, (finalPayload) =>
    sb.from('company_info').upsert(finalPayload, { onConflict: S.tenantId ? 'tenant_id,setting_key' : 'setting_key' })
  );
  if (error) { toast('সেভ ব্যর্থ: '+error.message,'error'); return; }
  applyCompany();
  toast('কোম্পানি তথ্য সেভ হয়েছে।','success');
}

function loadLogo(ev) {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    S.company.logo = e.target.result;
    const p = document.getElementById('coLogoPreview');
    p.style.backgroundImage = `url(${e.target.result})`; p.style.backgroundSize='cover'; p.textContent='';
  };
  r.readAsDataURL(f);
}

// ══════════════════════════════════════════
// COA
// ══════════════════════════════════════════
async function loadCOA() {
  const { data, error } = await readTenantRows('coa', (from) => from.select('*').order('account_code'));
  if (error) { toast('COA লোড ব্যর্থ','error'); return; }
  S.coa = data || [];
  renderCOA(S.coa);
  populateAccSelects();
  renderDayControlState();
}

function renderCOA(rows) {
  const tb = document.getElementById('coaBody');
  if (!rows.length) { tb.innerHTML='<tr><td colspan="5" class="td-m" style="text-align:center;padding:20px">কোনো অ্যাকাউন্ট নেই</td></tr>'; return; }
  tb.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${esc(r.account_code)}</strong></td>
      <td>${esc(r.account_name)}</td>
      <td>${esc(r.account_group||'')}</td>
      <td><span class="badge bg-gold">${esc(r.account_type||'Ledger')}</span></td>
      <td class="td-g">${fmt(r.opening_balance||0)}</td>
    </tr>`).join('');
}

function populateAccSelects() {
  const opts = S.coa.map(a => `<option value="${a.account_code}">${a.account_code} — ${a.account_name}</option>`).join('');
  const vchAcc = document.getElementById('vchAcc');
  if (vchAcc) vchAcc.innerHTML = opts;
  document.getElementById('ledAcc').innerHTML = '<option value="">-- নির্বাচন করুন --</option>' + opts;
}

function showAccModal() { document.getElementById('accModal').classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

async function saveAccount() {
  const code = document.getElementById('accCode').value.trim();
  const name = document.getElementById('accName').value.trim();
  const grp  = document.getElementById('accGrp').value;
  const typ  = document.getElementById('accTyp').value;
  const op   = Number(document.getElementById('accOp').value) || 0;
  if (!code || !name) { toast('কোড ও নাম দিন।','warning'); return; }
  await getTenantId();
  if (!requireTenantForWrite()) return;
  const payload = tenantInsertPayload({ account_code:code, account_name:name, account_group:grp, account_type:typ, opening_balance:op });
  const { error } = await writeWithOptionalTenant('coa', payload, (finalPayload) =>
    sb.from('coa').upsert(finalPayload, { onConflict: S.tenantId ? 'tenant_id,account_code' : 'account_code' })
  );
  if (error) { toast('সেভ ব্যর্থ: '+error.message,'error'); return; }
  closeModal('accModal');
  toast('অ্যাকাউন্ট সেভ হয়েছে।','success');
  await loadCOA();
}

function loadCOASelect() { populateAccSelects(); }

function isUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
}

function firstUUID(...values) {
  return values.find(isUUID) || null;
}

async function resolveTenantFromMembership(userId) {
  if (!isUUID(userId)) return false;
  try {
    const tenantSlug = S.tenantSlug || getRouteTenantSlug();
    const requestedSlug = tenantSlug ? getTenantSlugCandidates(tenantSlug)[0] : null;
    const { data: rpcRows, error: rpcError } = await sb.rpc('resolve_current_tenant', { requested_slug: requestedSlug });
    const rpcTenant = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (!rpcError && rpcTenant?.tenant_id) {
      S.tenantId = rpcTenant.tenant_id;
      S.tenantSlug = rpcTenant.tenant_slug || tenantSlug || null;
      S.activeMemberRole = rpcTenant.role || 'user';
      S.tenantResolved = true;
      S.tenantResolveError = null;
      return true;
    }
    if (rpcError && rpcError.code !== '42883') {
      console.warn('[tenant] resolve_current_tenant failed:', rpcError.message);
    }

    let query = sb
      .from('tenant_members')
      .select(tenantSlug ? 'tenant_id, role, tenants!inner(slug)' : 'tenant_id, role')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('status', 'active')
      .limit(1);
    if (tenantSlug) query = query.in('tenants.slug', getTenantSlugCandidates(tenantSlug));
    const { data, error } = await query.maybeSingle();
    if (!error && data?.tenant_id) {
      S.tenantId = data.tenant_id;
      S.tenantSlug = data.tenants?.slug || tenantSlug || null;
      S.activeMemberRole = data.role || (() => { console.warn('[tenant] tenant_members role missing for user', userId); return 'user'; })();
      S.tenantResolved = true;
      S.tenantResolveError = null;
      return true;
    }
    if (error) console.warn('[tenant] tenant_members resolve failed:', error.message);
  } catch (error) {
    console.warn('[tenant] resolve failed:', error?.message || error);
  }
  return false;
}

async function getTenantId() {
  if (S.tenantResolved) return S.tenantId;
  S.tenantSlug = S.tenantSlug || getRouteTenantSlug();

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    S.session = session;
    if (!S.user) S.user = session.user;
  }

  const userId = S.user?.id || session?.user?.id;

  // Primary: resolve from tenant_members (proper multi-tenant model)
  if (await resolveTenantFromMembership(userId)) {
    return S.tenantId;
  }

  if (S.tenantSlug && isDefaultTenantSlug(S.tenantSlug)) {
    S.tenantId = '00000000-0000-0000-0000-000000000001';
    S.tenantSlug = 'challangersof90s';
    S.activeMemberRole = S.activeMemberRole || 'owner';
    S.tenantResolved = true;
    S.tenantResolveError = null;
    return S.tenantId;
  }

  if (S.tenantSlug) {
    S.tenantResolved = true;
    S.tenantResolveError = `No active tenant membership found for "${S.tenantSlug}".`;
    return null;
  }

  // Legacy fallback: check user metadata and users table (transition compatibility)
  const metaTenant = firstUUID(
    S.user?.tenant_id,
    S.user?.app_metadata?.tenant_id,
    S.user?.user_metadata?.tenant_id,
    session?.user?.app_metadata?.tenant_id,
    session?.user?.user_metadata?.tenant_id
  );
  if (metaTenant) {
    S.tenantId = metaTenant;
    S.tenantResolved = true;
    S.tenantResolveError = null;
    return S.tenantId;
  }

  const email = S.user?.email || session?.user?.email;
  if (email) {
    const { data: userRow } = await sb.from('users').select('tenant_id').eq('email', email).limit(1).maybeSingle();
    if (isUUID(userRow?.tenant_id)) {
      S.tenantId = userRow.tenant_id;
      S.tenantResolved = true;
      S.tenantResolveError = null;
      return S.tenantId;
    }
  }

  // Do NOT fall back to auth.users.id as tenant_id per multi-tenant requirements
  S.tenantResolved = true;
  S.tenantResolveError = 'No tenant assigned to this user.';
  return S.tenantId; // may be null
}

function hasTenantIdColumnError(error) {
  const msg = String(error?.message || '');
  return error?.code === 'PGRST204' && /\btenant_id\b/i.test(msg);
}

function removeTenantId(payload) {
  if (Array.isArray(payload)) {
    return payload.map(({ tenant_id, ...rest }) => rest);
  }
  if (payload && typeof payload === 'object') {
    const { tenant_id, ...rest } = payload;
    return rest;
  }
  return payload;
}

async function writeWithOptionalTenant(table, payload, executor) {
  const canRetryWithoutTenant =
    S.tenantColumnSupport[table] !== false &&
    (Array.isArray(payload)
      ? payload.some((item) => item && item.tenant_id != null)
      : payload && payload.tenant_id != null);

  let result = await executor(payload);
  if (canRetryWithoutTenant && hasTenantIdColumnError(result?.error)) {
    // Cache per-table fallback so tables without tenant_id do not trigger the same failed write twice.
    S.tenantColumnSupport[table] = false;
    result = await executor(removeTenantId(payload));
  }
  return result;
}

async function readTenantRows(table, buildQuery) {
  const tenantId = await getTenantId();

  if (tenantId && S.tenantColumnSupport[table] !== false) {
    const scoped = await buildQuery(sb.from(table)).eq('tenant_id', tenantId);
    if (!hasTenantIdColumnError(scoped.error)) return scoped;
    S.tenantColumnSupport[table] = false;
  }

  if (S.tenantSlug && !tenantId) {
    if (!S.tenantWarningShown) {
      S.tenantWarningShown = true;
      toast(S.tenantResolveError || 'Tenant context resolve হয়নি।', 'error');
    }
    return { data: [], count: 0, error: { message: S.tenantResolveError || 'Tenant context missing' } };
  }

  return buildQuery(sb.from(table));
}

function tenantInsertPayload(payload) {
  if (!S.tenantId) return payload;
  if (Array.isArray(payload)) return payload.map((item) => ({ ...item, tenant_id: S.tenantId }));
  return { ...payload, tenant_id: S.tenantId };
}

function requireTenantForWrite() {
  if (S.tenantSlug && !S.tenantId) {
    toast(S.tenantResolveError || 'Tenant resolve হয়নি, তাই save করা যাবে না।', 'error');
    return false;
  }
  return true;
}

// ══════════════════════════════════════════
// COLLECTION
// ══════════════════════════════════════════
function genRno() {
  const yr = String(new Date().getFullYear()).slice(-2);
  return 'MR-' + yr + '-' + String(Math.floor(1000+Math.random()*9000));
}

async function saveCollection() {
  const date = document.getElementById('colDate').value;
  const name = document.getElementById('colName').value.trim();
  const amt  = Number(document.getElementById('colAmt').value);
  const desc = document.getElementById('colDesc').value.trim();
  const head = document.getElementById('colHead').value;
  const mode = document.getElementById('colMode').value;
  const rno  = document.getElementById('colRno').value || genRno();
  const tenantId = await getTenantId();
  if (!requireTenantForWrite()) return;
  if (!name || !amt) { toast('নাম ও পরিমাণ দিন।','warning'); return; }
  const payload = {
    receipt_no: rno, collection_date: date, payer_name: name, amount: amt, description: desc
  };
  if (tenantId) payload.tenant_id = tenantId;

  const { error } = await writeWithOptionalTenant('collections', payload, (finalPayload) =>
    sb.from('collections').insert(finalPayload)
  );
  if (error) { toast('সেভ ব্যর্থ: '+error.message,'error'); return; }

  persistReceiptMeta(rno, { rno, date, name, amount: amt, desc, head, mode, savedBy:getCurrentUserName(), savedAt:new Date().toISOString() });
  S.lastReceipt = { rno, date, name, amount: amt, desc, head, mode };
  toast('কালেকশন সেভ হয়েছে।','success');
  document.getElementById('colName').value=''; document.getElementById('colAmt').value=''; document.getElementById('colDesc').value='';
  document.getElementById('colRno').value = genRno();
  genReceiptPreview();
  await loadCollections();
  await loadDashboard();
}

async function loadCollections() {
  const tb = document.getElementById('colList');
  tb.innerHTML = '<tr><td colspan="5" class="td-m" style="text-align:center;padding:20px">লোড হচ্ছে...</td></tr>';
  const { data, error } = await readTenantRows('collections', (from) => from.select('*').order('created_at', { ascending:false }).limit(20));
  if (error || !data.length) { tb.innerHTML='<tr><td colspan="5" class="td-m" style="text-align:center;padding:20px">কোনো কালেকশন নেই</td></tr>'; return; }
  tb.innerHTML = data.map(r => `
    <tr>
      <td><span class="badge bg-gold">${esc(r.receipt_no||'—')}</span></td>
      <td>${esc(r.collection_date||'')}</td>
      <td>${esc(r.payer_name||'')}</td>
      <td class="td-g"><strong>${fmt(r.amount)}</strong></td>
      <td class="td-m">${esc(r.description||'')}</td>
    </tr>`).join('');
}

// ══════════════════════════════════════════
// VOUCHER
// ══════════════════════════════════════════
async function saveVoucher() {
  const type = document.getElementById('vchType').value;
  const ref  = document.getElementById('vchNo').value || makeVoucherRef(type);
  const date = document.getElementById('vchDate').value;
  const acc  = document.getElementById('vchAcc').value;
  const amt  = Number(document.getElementById('vchAmt').value);
  const desc = document.getElementById('vchDesc').value.trim();
  const tenantId = await getTenantId();
  if (!requireTenantForWrite()) return;
  if (!amt) { toast('পরিমাণ দিন।','warning'); return; }
  const payload = { vch_type:type, vch_date:date, account_code:acc, amount:amt, description:desc };
  if (tenantId) payload.tenant_id = tenantId;
  const { data, error } = await writeWithOptionalTenant('vouchers', payload, (finalPayload) =>
    sb.from('vouchers').insert(finalPayload).select().single()
  );
  if (error) { toast('সেভ ব্যর্থ: '+error.message,'error'); return; }
  if (data?.id) persistReceiptMeta(`voucher-${data.id}`, { voucher_no: ref, voucher_type: type });
  toast('ভাউচার সেভ হয়েছে।','success');
  document.getElementById('vchAmt').value=''; document.getElementById('vchDesc').value=''; refreshVoucherRef();
  loadVoucherSummary();
}

// ══════════════════════════════════════════
// JOURNAL — Double Entry
// ══════════════════════════════════════════
function buildAccOpts() {
  return S.coa.map(a => `<option value="${a.account_code}">${a.account_code} — ${a.account_name}</option>`).join('');
}

function addJLine() {
  S.jlc++;
  const i = S.jlc;
  const d = document.createElement('div');
  d.className = 'entry-line'; d.id = 'jl-'+i;
  d.innerHTML = `
    <div class="ecell"><select class="form-control" style="border:none;background:transparent" onchange="updateJTotals()">${buildAccOpts()}</select></div>
    <div class="ecell"><input class="form-control" style="border:none;background:transparent" placeholder="Narration"></div>
    <div class="ecell"><input type="number" class="jDr form-control" style="border:none;background:transparent;color:var(--em)" placeholder="0.00" min="0" oninput="updateJTotals()"></div>
    <div class="ecell"><input type="number" class="jCr form-control" style="border:none;background:transparent;color:var(--danger)" placeholder="0.00" min="0" oninput="updateJTotals()"></div>
    <div class="ecell" style="text-align:center"><button class="btn-rm" onclick="rmJLine(${i})">×</button></div>`;
  document.getElementById('jLines').appendChild(d);
  updateJTotals();
}

function rmJLine(i) { const el=document.getElementById('jl-'+i); if(el){el.remove();updateJTotals();} }

function updateJTotals() {
  let dr=0, cr=0;
  document.querySelectorAll('.jDr').forEach(x => dr+=Number(x.value||0));
  document.querySelectorAll('.jCr').forEach(x => cr+=Number(x.value||0));
  document.getElementById('jTDr').textContent = dr.toFixed(2);
  document.getElementById('jTCr').textContent = cr.toFixed(2);
  const ok = Math.abs(dr-cr) < 0.01;
  document.getElementById('jBalBadge').className = `badge ${ok?'bg-green':'bg-danger'}`;
  document.getElementById('jBalBadge').textContent = ok ? '✓ Balanced' : '✗ Unbalanced';
  document.getElementById('jBalMsg').className = `alert ${ok?'alert-success':'alert-danger'}`;
  document.getElementById('jBalMsg').textContent = ok ? '✓ ব্যালেন্সড' : '✗ আনব্যালেন্সড';
}

function resetJournalForm() {
  document.getElementById('jNar').value = '';
  document.getElementById('jRef').value = makeVoucherRef('জার্নাল');
  document.querySelectorAll('#jLines .entry-line:not(.entry-line-hdr)').forEach(el => el.remove());
  S.jlc = 0;
  S.editJournalId = null;
  addJLine(); addJLine();
  updateJTotals();
  const btn = document.getElementById('saveJournalBtn');
  if (btn) btn.textContent = 'জার্নাল ভাউচার সেভ';
}

async function saveJournal() {
  let dr=0, cr=0;
  document.querySelectorAll('.jDr').forEach(x => dr+=Number(x.value||0));
  document.querySelectorAll('.jCr').forEach(x => cr+=Number(x.value||0));
  const tenantId = await getTenantId();
  if (!requireTenantForWrite()) return;
  if (Math.abs(dr-cr) > 0.01) { toast('ডেবিট ≠ ক্রেডিট!','error'); return; }

  const lines = [];
  document.querySelectorAll('#jLines .entry-line:not(.entry-line-hdr)').forEach(row => {
    const accCode = row.querySelector('select').value;
    const debit   = Number(row.querySelector('.jDr').value||0);
    const credit  = Number(row.querySelector('.jCr').value||0);
    if (accCode && (debit||credit)) lines.push({ account_code:accCode, debit, credit });
  });

  const ref = document.getElementById('jRef').value || makeVoucherRef('জার্নাল');
  const payload = {
    journal_date: document.getElementById('jDate').value,
    ref_no: ref,
    narration: document.getElementById('jNar').value,
    total_debit: dr, total_credit: cr
  };
  if (tenantId) payload.tenant_id = tenantId;
  let jData, jErr;
  if (S.editJournalId) {
    if (!canEditVoucher()) { toast('Edit করার অনুমতি নেই।', 'error'); return; }
    ({ data: jData, error: jErr } = await writeWithOptionalTenant('journals', payload, (finalPayload) =>
      sb.from('journals').update(finalPayload).eq('id', S.editJournalId).select().single()
    ));
  } else {
    ({ data: jData, error: jErr } = await writeWithOptionalTenant('journals', payload, (finalPayload) =>
      sb.from('journals').insert(finalPayload).select().single()
    ));
  }

  if (jErr) { toast('জার্নাল সেভ ব্যর্থ: '+jErr.message,'error'); return; }

  if (S.editJournalId) {
    const { error: dErr } = await sb.from('journal_items').delete().eq('journal_id', S.editJournalId);
    if (dErr) { toast('পুরনো জার্নাল আইটেম মুছতে ব্যর্থ: '+dErr.message,'error'); return; }
  }
  const items = lines.map(l => {
    const item = { journal_id: jData.id, account_code: l.account_code, debit: l.debit, credit: l.credit };
    if (tenantId) item.tenant_id = tenantId;
    return item;
  });
  const { error: iErr } = await writeWithOptionalTenant('journal_items', items, (finalPayload) =>
    sb.from('journal_items').insert(finalPayload)
  );
  if (iErr) { toast('জার্নাল আইটেম সেভ ব্যর্থ: '+iErr.message,'error'); return; }

  toast(S.editJournalId ? 'জার্নাল আপডেট হয়েছে।' : 'জার্নাল সেভ হয়েছে।','success');
  resetJournalForm();
  await loadVoucherSummary();
  await loadDashboard();
}

async function loadVoucherSummary() {
  const journalBody = document.getElementById('journalSummaryBody');
  if (!journalBody) return;
  journalBody.innerHTML = '<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">লোড হচ্ছে...</td></tr>';
  const jRes = await readTenantRows('journals', (from) => from.select('id,journal_date,ref_no,narration,total_debit,total_credit').order('journal_date', { ascending:false }).limit(50));
  const reconciledSet = getReconciledJournals();
  const showReconciledOnly = document.getElementById('showReconciledOnly')?.checked;
  let journals = jRes.data || [];
  if (showReconciledOnly) journals = journals.filter(j => reconciledSet.has(String(j.id)));
  journalBody.innerHTML = journals.map(j => {
    const isReconciled = reconciledSet.has(String(j.id));
    return `<tr>
      <td><span class="badge bg-navy">${esc(j.ref_no || 'JV')}</span>${isReconciled ? ' <span class="badge bg-green" style="font-size:9px">✓ Reconciled</span>' : ''}</td>
      <td>${esc(j.journal_date || '')}</td>
      <td>${esc(j.narration || '')}</td>
      <td class="td-g">${fmt(j.total_debit || 0)}</td>
      <td class="td-r">${fmt(j.total_credit || 0)}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="editJournal(${j.id})">Edit</button>
          <button class="btn btn-primary btn-sm" onclick="printJournalVoucher(${j.id})">Print</button>
          <button class="btn btn-sm" style="background:${isReconciled?'var(--em-lt)':'var(--info-lt)'};border:1px solid ${isReconciled?'var(--em)':'var(--info)'};color:${isReconciled?'var(--em)':'var(--info)'}" onclick="toggleReconcile(${j.id})">${isReconciled ? '✓ Reconciled' : '⇌ Reconcile'}</button>
          <button class="btn btn-danger-lt btn-sm" onclick="deleteJournal(${j.id})">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">কোনো জার্নাল ভাউচার নেই</td></tr>';
}

async function editJournal(id) {
  if (!canEditVoucher()) { toast('Admin/Superuser edit করতে পারবে।', 'error'); return; }
  const { data: journalRows, error } = await readTenantRows('journals', (from) => from.select('*').eq('id', id).limit(1));
  const journal = journalRows?.[0];
  if (error || !journal) { toast('জার্নাল লোড ব্যর্থ।', 'error'); return; }
  const { data: items, error: iErr } = await readTenantRows('journal_items', (from) => from.select('*').eq('journal_id', id));
  if (iErr) { toast('জার্নাল আইটেম লোড ব্যর্থ।', 'error'); return; }
  S.editJournalId = id;
  document.getElementById('jDate').value = journal.journal_date || '';
  document.getElementById('jRef').value = journal.ref_no || '';
  document.getElementById('jNar').value = journal.narration || '';
  document.querySelectorAll('#jLines .entry-line:not(.entry-line-hdr)').forEach(el => el.remove());
  S.jlc = 0;
  (items || []).forEach(item => {
    addJLine();
    const row = document.getElementById(`jl-${S.jlc}`);
    row.querySelector('select').value = item.account_code || '';
    row.querySelector('.jDr').value = Number(item.debit || 0) || '';
    row.querySelector('.jCr').value = Number(item.credit || 0) || '';
  });
  if (!(items || []).length) { addJLine(); addJLine(); }
  updateJTotals();
  const btn = document.getElementById('saveJournalBtn');
  if (btn) btn.textContent = 'জার্নাল আপডেট করুন';
  document.getElementById('jDate')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteJournal(id) {
  if (!isSuperUser()) { toast('শুধু Super User delete করতে পারবে।', 'error'); return; }
  if (!window.confirm('এই জার্নাল ভাউচার মুছে ফেলতে চান?')) return;
  const { error: iErr } = await sb.from('journal_items').delete().eq('journal_id', id);
  if (iErr) { toast('জার্নাল আইটেম ডিলিট ব্যর্থ: '+iErr.message, 'error'); return; }
  const { error } = await sb.from('journals').delete().eq('id', id);
  if (error) { toast('জার্নাল ডিলিট ব্যর্থ: '+error.message, 'error'); return; }
  toast('জার্নাল ভাউচার ডিলিট হয়েছে।', 'success');
  await loadVoucherSummary();
  await loadDashboard();
}

// ══════════════════════════════════════════
// RECONCILIATION
// ══════════════════════════════════════════
function getReconciledJournals() {
  try { return new Set(JSON.parse(localStorage.getItem('aura_reconciled') || '[]').map(String)); } catch(e) { console.error('Reconciled journals parse error:', e); return new Set(); }
}
function saveReconciledJournals(set) {
  localStorage.setItem('aura_reconciled', JSON.stringify([...set]));
}
function toggleReconcile(id) {
  const set = getReconciledJournals();
  const key = String(id);
  if (set.has(key)) { set.delete(key); toast('Reconcile চিহ্ন সরানো হয়েছে।', 'info'); }
  else { set.add(key); toast('✓ Reconciled হিসেবে চিহ্নিত হয়েছে।', 'success'); }
  saveReconciledJournals(set);
  loadVoucherSummary();
}

async function printJournalVoucher(id) {
  const { data: journalRows, error } = await readTenantRows('journals', (from) => from.select('*').eq('id', id).limit(1));
  const journal = journalRows?.[0];
  if (error || !journal) { toast('প্রিন্ট ডেটা পাওয়া যায়নি।', 'error'); return; }
  const { data: items } = await readTenantRows('journal_items', (from) => from.select('account_code,debit,credit').eq('journal_id', id));
  const coaMap = getCoaMap();
  const co = S.company || {};
  const coName   = co.name    || 'Aura Stay BD';
  const coSub    = co.sub     || '';
  const coAddr   = co.address || '';
  const coPhone  = co.phone   || '';
  const coLogo   = co.logo    || '';
  const bin      = co.bin     || '';
  const totalDr  = Number(journal.total_debit  || 0);
  const totalCr  = Number(journal.total_credit || 0);
  const inWords  = amountToWords(Math.max(totalDr, totalCr));
  const preparedBy = getCurrentUserName() || 'System';
  const safeCoName = esc(coName);
  const safeCoSub = esc(coSub);
  const safeCoAddr = esc(coAddr);
  const safeCoPhone = esc(coPhone);
  const safeBin = esc(bin);
  const safePreparedBy = esc(preparedBy);
  const safeJournalRef = esc(journal.ref_no || 'Journal Voucher');
  const safeJournalDate = esc(journal.journal_date || '—');
  const safeNarration = esc(journal.narration || '');
  const safeInWords = esc(inWords);
  const safeLogoSrc = /^(https?:|data:image\/)/i.test(coLogo) ? coLogo : '';

  const logoHtml = safeLogoSrc
    ? `<img src="${esc(safeLogoSrc)}" style="width:52px;height:52px;border-radius:10px;object-fit:cover;border:1.5px solid #D4A017">`
    : `<div style="width:52px;height:52px;border-radius:10px;background:linear-gradient(135deg,#D4A017,#B8860B);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;color:#080F1E">${esc(coName[0]||'A')}</div>`;

  const rowsHtml = (items || []).map(r => {
    const acc = coaMap[r.account_code] || {};
    return `<tr>
      <td style="padding:7px 10px;border:1px solid #D0D8E8;font-size:12px">${esc(r.account_code || '')}</td>
      <td style="padding:7px 10px;border:1px solid #D0D8E8;font-size:12px">${esc(acc.account_name || r.account_code || '')}</td>
      <td style="padding:7px 10px;border:1px solid #D0D8E8;font-size:12px;text-align:right">${Number(r.debit||0) > 0 ? fmt(r.debit) : ''}</td>
      <td style="padding:7px 10px;border:1px solid #D0D8E8;font-size:12px;text-align:right">${Number(r.credit||0) > 0 ? fmt(r.credit) : ''}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${safeJournalRef}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{margin:0}
  body{font-family:Arial,sans-serif;color:#0B1629;background:#fff;padding:12mm 14mm}
  table{width:100%;border-collapse:collapse}
</style>
</head>
<body>
  <!-- Header -->
  <div style="display:flex;align-items:center;gap:16px;padding-bottom:10px;border-bottom:3px solid #1A7A4A">
    ${logoHtml}
    <div>
      <div style="font-size:20px;font-weight:900;color:#080F1E">${safeCoName}</div>
      ${coSub ? `<div style="font-size:12px;color:#647188">${safeCoSub}</div>` : ''}
      <div style="font-size:11.5px;color:#647188">${safeCoAddr}${coAddr && coPhone ? ' · ' : ''}${safeCoPhone}</div>
      ${bin ? `<div style="font-size:11px;color:#647188">BIN: ${safeBin}</div>` : ''}
    </div>
  </div>

  <!-- Title -->
  <div style="text-align:center;margin:14px 0">
    <span style="border:1.5px solid #1A7A4A;border-radius:6px;padding:6px 28px;font-size:14px;font-weight:700;color:#0B1629;letter-spacing:.05em">
      JOURNAL VOUCHER / জার্নাল ভাউচার
    </span>
  </div>

  <!-- Meta -->
  <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:12.5px">
    <div>
      <div><strong>Voucher No:</strong> ${safeJournalRef}</div>
      <div><strong>Source:</strong> MANUAL_JOURNAL</div>
    </div>
    <div style="text-align:right">
      <div><strong>Date:</strong> ${safeJournalDate}</div>
    </div>
  </div>
  ${journal.narration ? `<div style="font-size:12px;color:#647188;margin-bottom:10px"><strong>Narration:</strong> ${safeNarration}</div>` : ''}

  <!-- Entry Table -->
  <table>
    <thead>
      <tr style="background:#1A7A4A;color:#fff">
        <th style="padding:8px 10px;font-size:12px;text-align:left;border:1px solid #1A7A4A">A/C Code</th>
        <th style="padding:8px 10px;font-size:12px;text-align:left;border:1px solid #1A7A4A">Account Head &amp; Particulars</th>
        <th style="padding:8px 10px;font-size:12px;text-align:right;border:1px solid #1A7A4A">Debit (৳)</th>
        <th style="padding:8px 10px;font-size:12px;text-align:right;border:1px solid #1A7A4A">Credit (৳)</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr style="font-weight:700;background:#F6F4EF">
        <td colspan="2" style="padding:8px 10px;border:1px solid #D0D8E8;font-size:12px">TOTAL</td>
        <td style="padding:8px 10px;border:1px solid #D0D8E8;font-size:12px;text-align:right">৳ ${totalDr.toFixed(2)}</td>
        <td style="padding:8px 10px;border:1px solid #D0D8E8;font-size:12px;text-align:right">৳ ${totalCr.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- In Words -->
  <div style="font-size:12.5px;margin-top:10px"><strong>In words:</strong> ${safeInWords}</div>

  <!-- Signatures -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:24px;margin-top:36px">
      <div style="text-align:center"><div style="border-top:1.5px solid #0B1629;padding-top:6px;font-size:11.5px">Prepared by<br><small style="color:#647188">${safePreparedBy}</small></div></div>
      <div style="text-align:center"><div style="border-top:1.5px solid #0B1629;padding-top:6px;font-size:11.5px">Checked by</div></div>
      <div style="text-align:center"><div style="border-top:1.5px solid #0B1629;padding-top:6px;font-size:11.5px">Approved by</div></div>
      <div style="text-align:center"><div style="border-top:1.5px solid #0B1629;padding-top:6px;font-size:11.5px">Receiver's Signature</div></div>
  </div>

  <!-- Footer -->
  <div style="margin-top:24px;text-align:center;font-size:10.5px;color:#647188;border-top:1px solid #E2E8F4;padding-top:8px">
    Prepared under the double-entry system in accordance with IFRS. System-generated voucher — ${safeCoName}.
  </div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) { URL.revokeObjectURL(url); toast('পপ-আপ ব্লক হয়েছে।', 'error'); return; }
  win.addEventListener('load', () => {
    win.print();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, { once: true });
}

// ══════════════════════════════════════════
// DAYBOOK
// ══════════════════════════════════════════
async function loadDaybook() {
  const tb = document.getElementById('dbBody');
  tb.innerHTML = '<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">লোড হচ্ছে...</td></tr>';

  const [colRes, vchRes, jRes] = await Promise.all([
    readTenantRows('collections', (from) => from.select('collection_date,description,amount,receipt_no').order('collection_date')),
    readTenantRows('vouchers', (from) => from.select('vch_date,description,amount,vch_type,account_code').order('vch_date')),
    readTenantRows('journals', (from) => from.select('journal_date,narration,ref_no,total_debit,total_credit').order('journal_date'))
  ]);

  const rows = [];
  (colRes.data||[]).forEach(r => rows.push({ date:r.collection_date, desc:'Collection: '+(r.description||''), dr:r.amount, cr:0, acc:'Cash in Hand', ref:r.receipt_no }));
  (vchRes.data||[]).forEach(r => {
    const isPayment = String(r.vch_type||'').toLowerCase().includes('পেমেন্ট');
    rows.push({ date:r.vch_date, desc:r.description||r.vch_type, dr:isPayment?0:r.amount, cr:isPayment?r.amount:0, acc:r.account_code, ref:'' });
  });
  (jRes.data||[]).forEach(r => rows.push({ date:r.journal_date, desc:r.narration||'Journal', dr:r.total_debit, cr:r.total_credit, acc:'Journal', ref:r.ref_no }));

  rows.sort((a,b) => new Date(b.date)-new Date(a.date));

  if (!rows.length) { tb.innerHTML='<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">কোনো এন্ট্রি নেই</td></tr>'; return; }
  tb.innerHTML = rows.map(r => `
    <tr>
      <td>${esc(r.date||'')}</td>
      <td>${esc(r.desc||'')}</td>
      <td class="${r.dr?'td-g':'td-m'}">${r.dr?fmt(r.dr):'—'}</td>
      <td class="${r.cr?'td-r':'td-m'}">${r.cr?fmt(r.cr):'—'}</td>
      <td class="td-m">${esc(r.acc||'')}</td>
      <td class="td-m">${esc(r.ref||'')}</td>
    </tr>`).join('');
}

// ══════════════════════════════════════════
// LEDGER
// ══════════════════════════════════════════
async function loadLedger() {
  const accCode = document.getElementById('ledAcc').value;
  if (!accCode) return;
  const tb = document.getElementById('ledBody');
  tb.innerHTML = '<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">লোড হচ্ছে...</td></tr>';

  const { data, error } = await readJournalItemsWithContext((from) => from
    .select('journal_id,debit,credit,account_code')
    .eq('account_code', accCode)
    .order('journal_id'));

  if (error || !data.length) { tb.innerHTML='<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">কোনো এন্ট্রি নেই</td></tr>'; return; }

  let tDr=0, tCr=0, bal=0;
  tb.innerHTML = data.map(r => {
    const dr = Number(r.debit||0), cr = Number(r.credit||0);
    tDr+=dr; tCr+=cr; bal=tDr-tCr;
    const j = r.journals||{};
    return `<tr>
      <td>${esc(j.journal_date||'')}</td>
      <td>${esc(j.narration||'')}</td>
      <td class="td-m">${esc(j.ref_no||'')}</td>
      <td class="${dr?'td-g':'td-m'}">${dr?fmt(dr):'—'}</td>
      <td class="${cr?'td-r':'td-m'}">${cr?fmt(cr):'—'}</td>
      <td style="font-weight:600">${fmt(bal)}</td>
    </tr>`;
  }).join('');

  document.getElementById('ledDr').textContent  = fmt(tDr);
  document.getElementById('ledCr').textContent  = fmt(tCr);
  document.getElementById('ledBal').textContent = fmt(tDr-tCr);
}

// ══════════════════════════════════════════
// TRIAL BALANCE
// ══════════════════════════════════════════
async function loadTrialBalance() {
  const tb = document.getElementById('tbBody');
  tb.innerHTML = '<tr><td colspan="4" class="td-m" style="text-align:center;padding:20px">লোড হচ্ছে...</td></tr>';

  const { data, error } = await readJournalItemsWithContext((from) => from
    .select('journal_id,account_code,debit,credit'));

  if (error) { tb.innerHTML='<tr><td colspan="4" class="td-m" style="text-align:center">এরর: '+error.message+'</td></tr>'; return; }

  const accs = {};
  (data||[]).forEach(r => {
    if (!accs[r.account_code]) accs[r.account_code] = { name:(r.coa?.account_name||r.account_code), group:(r.coa?.account_group||''), dr:0, cr:0 };
    accs[r.account_code].dr += Number(r.debit||0);
    accs[r.account_code].cr += Number(r.credit||0);
  });

  let tDr=0, tCr=0;
  const rows = Object.keys(accs).map(code => {
    const a = accs[code];
    const dr = a.dr > a.cr ? a.dr-a.cr : 0;
    const cr = a.cr > a.dr ? a.cr-a.dr : 0;
    tDr+=dr; tCr+=cr;
    return `<tr>
      <td>${esc(a.name)}</td>
      <td class="td-m">${esc(a.group)}</td>
      <td class="${dr?'td-g':'td-m'}">${dr?fmt(dr):'—'}</td>
      <td class="${cr?'td-r':'td-m'}">${cr?fmt(cr):'—'}</td>
    </tr>`;
  });

  if (!rows.length) { tb.innerHTML='<tr><td colspan="4" class="td-m" style="text-align:center;padding:20px">কোনো এন্ট্রি নেই</td></tr>'; return; }

  const balanced = Math.abs(tDr-tCr) < 1;
  tb.innerHTML = rows.join('') + `<tr style="background:var(--navy2)">
    <td style="color:#fff;font-weight:700;padding:10px 16px">মোট</td>
    <td></td>
    <td style="color:var(--gold-lt);font-weight:700;padding:10px 16px">${fmt(tDr)}</td>
    <td style="color:var(--gold-lt);font-weight:700;padding:10px 16px">${fmt(tCr)}</td>
  </tr>`;
  document.getElementById('tbBadge').className = `badge ${balanced?'bg-green':'bg-danger'}`;
  document.getElementById('tbBadge').textContent = balanced?'✓ Balanced':'✗ Unbalanced';
}

// ══════════════════════════════════════════
// BALANCE SHEET
// ══════════════════════════════════════════
async function loadBalanceSheet() {
  const { data } = await readJournalItemsWithContext((from) => from.select('journal_id,account_code,debit,credit'));
  const accs = {};
  (data||[]).forEach(r => {
    if (!accs[r.account_code]) accs[r.account_code] = { group:(r.coa?.account_group||''), net:0 };
    accs[r.account_code].net += Number(r.debit||0) - Number(r.credit||0);
  });
  let assets=0, liab=0;
  Object.values(accs).forEach(a => {
    if (['Asset'].includes(a.group)) assets += a.net;
    if (['Liability'].includes(a.group)) liab += a.net;
  });
  document.getElementById('bsA').textContent = fmt(assets);
  document.getElementById('bsL').textContent = fmt(liab);
  document.getElementById('bsF').textContent = fmt(assets - liab);
}

// ══════════════════════════════════════════
// REPORTS (basic)
// ══════════════════════════════════════════


// ══════════════════════════════════════════
// REPORTS ENGINE
// ══════════════════════════════════════════
var currentReportName  = '';
var currentReportTitle = '';

const RPT_TITLES = {
  collection:'মাসিক কালেকশন রিপোর্ট',
  daybook:'ডে বুক (General Ledger)',
  trial:'ট্রায়াল ব্যালেন্স',
  pl:'Income & Expenditure Statement',
  bs:'Statement of Financial Position',
  cashbank:'ক্যাশ ও ব্যাংক বুক',
  receiptpayment:'Receipt & Payment Statement',
};

function getReportDateRange() {
  return {
    from: document.getElementById('rptFromDate')?.value || '',
    to: document.getElementById('rptToDate')?.value || ''
  };
}

function getReportRangeLabel() {
  const { from, to } = getReportDateRange();
  if (!from && !to) return '';
  if (from && to) return `${from} → ${to}`;
  if (from) return `From: ${from}`;
  return `To: ${to}`;
}

function isWithinDateRange(value, range) {
  if (!range.from && !range.to) return true;
  if (!value) return false;
  const d = String(value).slice(0, 10);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

function withDateRange(query, column) {
  const range = getReportDateRange();
  let q = query;
  if (range.from) q = q.gte(column, range.from);
  if (range.to) q = q.lte(column, range.to);
  return q;
}

function applyReportDateRange() {
  const { from, to } = getReportDateRange();
  if (from && to && from > to) { toast('From Date, To Date থেকে বড় হতে পারবে না।', 'warning'); return; }
  if (!currentReportName) { toast('আগে একটি রিপোর্ট নির্বাচন করুন।', 'info'); return; }
  loadReport(currentReportName);
}

function clearReportDateRange() {
  const fromEl = document.getElementById('rptFromDate');
  const toEl = document.getElementById('rptToDate');
  if (fromEl) fromEl.value = '';
  if (toEl) toEl.value = '';
  if (currentReportName) loadReport(currentReportName);
}

function setActiveRptBtn(name) {
  document.querySelectorAll('.rpt-btn').forEach(b=>{ b.classList.remove('btn-primary'); b.classList.add('btn-ghost'); });
  const map={collection:0,daybook:1,trial:2,pl:3,bs:4,cashbank:5,receiptpayment:6};
  if (map[name]!==undefined) {
    const btns=document.querySelectorAll('.rpt-btn');
    btns[map[name]].classList.remove('btn-ghost');
    btns[map[name]].classList.add('btn-primary');
  }
}

async function loadReport(name) {
  const { from, to } = getReportDateRange();
  if (from && to && from > to) { toast('From Date, To Date থেকে বড় হতে পারবে না।', 'warning'); return; }
  currentReportName  = name;
  currentReportTitle = RPT_TITLES[name]||name;
  const resultEl  = document.getElementById('reportResult');
  const card      = document.getElementById('reportCard');
  const titleEl   = document.getElementById('rptTitle');
  const subEl     = document.getElementById('rptSubtitle');
  resultEl.innerHTML='<div style="text-align:center;padding:40px;color:var(--muted)">⏳ লোড হচ্ছে...</div>';
  card.classList.remove('hidden');
  titleEl.textContent = currentReportTitle;
  const rangeLabel = getReportRangeLabel();
  subEl.textContent   = (S.company?.name||"Challengers of 90's") + ' | ' + new Date().toLocaleDateString('bn-BD') + (rangeLabel ? ` | ${rangeLabel}` : '');
  setActiveRptBtn(name);
  let html='';
  if      (name==='collection') html=await buildCollectionReport();
  else if (name==='daybook')    html=await buildDaybookReport();
  else if (name==='trial')      html=await buildTrialReport();
  else if (name==='pl')         html=await buildPLReport();
  else if (name==='bs')         html=await buildBSReport();
  else if (name==='cashbank')   html=await buildCashBankReport();
  else if (name==='receiptpayment') html=await buildReceiptPaymentReport();
  resultEl.innerHTML = html||'<div class="alert alert-warning">কোনো ডেটা নেই।</div>';
  card.scrollIntoView({behavior:'smooth',block:'start'});
}

function rptTable(headers, rows, totals) {
  let th=headers.map((h,i)=>`<th style="background:#0F1F3D;color:#fff;padding:9px 14px;text-align:${i===0?'left':'right'};font-size:11px;font-weight:700;white-space:nowrap">${esc(h)}</th>`).join('');
  let tbody=rows.map((r,ri)=>{
    const bg=r._section?'#E8F0FE':(ri%2===0?'#fff':'#FAFAF8');
    const fw=r._bold?'700':'400';
    const cells=r.cells.map((c,ci)=>{
      const align=ci===0?'left':'right';
      const color=c.color||'#0B1629';
      const val=c && typeof c === 'object' && c.val!==undefined ? c.val : c;
      const safeVal=val && typeof val === 'object' && Object.prototype.hasOwnProperty.call(val, 'html')
        ? String(val.html ?? '')
        : esc(val);
      const indent=(ci===0&&r._indent)?`padding-left:${14+r._indent*18}px`:'';
      return `<td style="padding:9px 14px;${indent};border-bottom:1px solid #E2E8F4;text-align:${align};font-weight:${fw};color:${color};font-size:13px">${safeVal}</td>`;
    }).join('');
    return `<tr style="background:${bg}">${cells}</tr>`;
  }).join('');
  let tfoot='';
  if(totals){
    const tc=totals.map((c,i)=>`<td style="padding:10px 14px;text-align:${i===0?'left':'right'};font-weight:800;color:#fff;font-size:13px">${esc(c||'')}</td>`).join('');
    tfoot=`<tr style="background:#0F1F3D">${tc}</tr>`;
  }
  return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>${th}</tr></thead><tbody>${tbody}${tfoot}</tbody></table></div>`;
}

function rptFmt(n) { return '৳ '+Number(n||0).toLocaleString('en-IN'); }
function rptDash() { return rptTrusted('<span style="color:#BCC5D4">—</span>'); }
function rptHdr(label,sub='') {
  return `<div style="background:linear-gradient(135deg,#0F1F3D,#1A3260);color:#fff;padding:14px 16px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:0">${esc(label)}<div style="font-weight:400;color:#C7D3E6;font-size:11px;letter-spacing:0;text-transform:none;margin-top:4px">${esc(sub || getReportRangeLabel() || 'Professional ERP Format')}</div></div>`;
}
function rptMeta(note='') {
  return `<div class="report-meta"><span><strong>Period:</strong> ${esc(getReportRangeLabel() || 'All available dates')}</span><span><strong>Prepared By:</strong> ${esc(getCurrentUserName())}</span><span><strong>Generated:</strong> ${esc(new Date().toLocaleString('en-GB'))}</span>${note?`<span>${esc(note)}</span>`:''}</div>`;
}
function wrapReportShell(title, subtitle, content, note='') {
  return `<div class="report-shell">${rptHdr(title, subtitle)}<div style="padding:16px">${content}</div>${rptMeta(note)}</div>`;
}

async function buildCollectionReport() {
  const {data,error}=await readTenantRows('collections', (from) => withDateRange(
    from.select('receipt_no,collection_date,payer_name,amount,description').order('collection_date',{ascending:false}),
    'collection_date'
  ));
  const monthly={};
  let grand=0;
  (data||[]).forEach(r=>{ const m=(r.collection_date||'').slice(0,7) || 'Undated'; if(!monthly[m])monthly[m]=[]; monthly[m].push(r); grand+=Number(r.amount||0); });
  let rows=[];
  Object.keys(monthly).sort().reverse().forEach(m=>{
    const mT=monthly[m].reduce((s,r)=>s+Number(r.amount||0),0);
    rows.push({cells:[{val:m,color:'#0F1F3D'},{val:''},{val:''},{val:rptFmt(mT),color:'#1A7A4A'},{val:''}],_section:true,_bold:true});
    monthly[m].forEach(r=>rows.push({cells:[{val:r.collection_date||rptDash()},{val:rptTrusted(`<span style="background:#FDF8EC;border:1px solid rgba(212,160,23,.3);padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#7A5500">${esc(r.receipt_no||'—')}</span>`)},{val:r.payer_name||'—'},{val:rptFmt(r.amount),color:'#1A7A4A'},{val:r.description||'—'}],_indent:1}));
  });
  if (!rows.length) rows.push({cells:[{val:rptDash()},{val:'—'},{val:'No collection yet',color:'#647188'},{val:rptFmt(0),color:'#1A7A4A'},{val:'Professional empty report format'}]});
  return wrapReportShell('মাসিক কালেকশন','Monthly Collection Summary',
    rptTable(['তারিখ','রিসিট নং','দাতার নাম','পরিমাণ (BDT)','বিবরণ'],rows,['মোট',`${(data||[]).length} টি`,'',rptFmt(grand),''])
  );
}

async function buildDaybookReport() {
  const [colRes,vchRes,jRes]=await Promise.all([
    readTenantRows('collections', (from) => withDateRange(from.select('collection_date,description,amount,receipt_no').order('collection_date'), 'collection_date')),
    readTenantRows('vouchers', (from) => withDateRange(from.select('vch_date,description,amount,vch_type,account_code').order('vch_date'), 'vch_date')),
    readTenantRows('journals', (from) => withDateRange(from.select('journal_date,narration,ref_no,total_debit,total_credit').order('journal_date'), 'journal_date')),
  ]);
  const all=[];
  (colRes.data||[]).forEach(r=>all.push({date:r.collection_date,desc:'Collection: '+(r.description||r.receipt_no||''),dr:Number(r.amount||0),cr:0,acc:'Cash in Hand',ref:r.receipt_no}));
  (vchRes.data||[]).forEach(r=>{ const ip=String(r.vch_type||'').includes('পেমেন্ট')||String(r.vch_type||'').toLowerCase().includes('payment'); all.push({date:r.vch_date,desc:(r.vch_type||'')+': '+(r.description||''),dr:ip?0:Number(r.amount||0),cr:ip?Number(r.amount||0):0,acc:r.account_code||'',ref:''}); });
  (jRes.data||[]).forEach(r=>all.push({date:r.journal_date,desc:r.narration||'Journal Voucher',dr:Number(r.total_debit||0),cr:Number(r.total_credit||0),acc:'Journal Voucher',ref:r.ref_no}));
  all.sort((a,b)=>new Date(a.date)-new Date(b.date));
  let tDr=0,tCr=0;
  const rows=(all.length?all:[{date:'',ref:'',desc:'No transaction posted yet',acc:'—',dr:0,cr:0}]).map(r=>{ tDr+=r.dr; tCr+=r.cr; return {cells:[{val:r.date||rptDash()},{val:r.ref||'',color:'#647188'},{val:r.desc||''},{val:r.acc||'',color:'#647188'},{val:r.dr?rptFmt(r.dr):rptDash(),color:r.dr?'#1A7A4A':'#BCC5D4'},{val:r.cr?rptFmt(r.cr):rptDash(),color:r.cr?'#C0392B':'#BCC5D4'}]}; });
  return wrapReportShell('ডে বুক','General Ledger — All Transactions',
    rptTable(['তারিখ','রেফ','বিবরণ','অ্যাকাউন্ট','ডেবিট (BDT)','ক্রেডিট (BDT)'],rows,['','','মোট','',rptFmt(tDr),rptFmt(tCr)])
  );
}

async function buildTrialReport() {
  const range = getReportDateRange();
  const {data}=await readJournalItemsWithContext((from) => from.select('journal_id,account_code,debit,credit'));
  const accs={};
  (data||[]).filter(r=>isWithinDateRange(r.journals?.journal_date, range)).forEach(r=>{ if(!accs[r.account_code])accs[r.account_code]={name:r.coa?.account_name||r.account_code,group:r.coa?.account_group||'',dr:0,cr:0}; accs[r.account_code].dr+=Number(r.debit||0); accs[r.account_code].cr+=Number(r.credit||0); });
  let tDr=0,tCr=0;
  const rows=Object.keys(accs).map(code=>{ const a=accs[code]; const dr=a.dr>a.cr?a.dr-a.cr:0,cr=a.cr>a.dr?a.cr-a.dr:0; tDr+=dr; tCr+=cr; return {cells:[{val:code,color:'#647188'},{val:a.name},{val:a.group,color:'#647188'},{val:dr?rptFmt(dr):rptDash(),color:dr?'#1A7A4A':'#BCC5D4'},{val:cr?rptFmt(cr):rptDash(),color:cr?'#C0392B':'#BCC5D4'}]}; });
  if(!rows.length) rows.push({cells:[{val:'—',color:'#647188'},{val:'Opening / no activity'},{val:'Asset',color:'#647188'},{val:rptFmt(0),color:'#1A7A4A'},{val:rptFmt(0),color:'#C0392B'}]});
  const bal=Math.abs(tDr-tCr)<1;
  const check=`<div class="report-highlight"><span style="font-weight:700;color:${bal?'#135A36':'#C0392B'}">${bal?'✓ Trial Balance agrees — Debit = Credit':'✗ Trial Balance does NOT agree — please review'}</span><strong>${rptFmt(Math.abs(tDr-tCr))}</strong></div>`;
  return wrapReportShell('ট্রায়াল ব্যালেন্স','As at '+new Date().toLocaleDateString('en-GB'),
    rptTable(['কোড','অ্যাকাউন্ট','গ্রুপ','ডেবিট (BDT)','ক্রেডিট (BDT)'],rows,['','মোট','',rptFmt(tDr),rptFmt(tCr)])+check
  );
}

async function buildPLReport() {
  const range = getReportDateRange();
  const {data}=await readJournalItemsWithContext((from) => from.select('journal_id,account_code,debit,credit'));
  const inc={},exp={};
  (data||[]).filter(r=>isWithinDateRange(r.journals?.journal_date, range)).forEach(r=>{ const g=r.coa?.account_group||''; const net=Number(r.debit||0)-Number(r.credit||0); if(g==='Income')inc[r.coa?.account_name||r.account_code]=(inc[r.coa?.account_name||r.account_code]||0)+(-net); if(g==='Expense')exp[r.coa?.account_name||r.account_code]=(exp[r.coa?.account_name||r.account_code]||0)+net; });
  const tI=Object.values(inc).reduce((s,v)=>s+v,0), tE=Object.values(exp).reduce((s,v)=>s+v,0), sur=tI-tE;
  const rows=[];
  rows.push({cells:[{val:'আয় (INCOME)',color:'#0F1F3D'},{val:''}],_section:true,_bold:true});
  Object.keys(inc).forEach(k=>rows.push({cells:[{val:k},{val:rptFmt(inc[k]),color:'#1A7A4A'}],_indent:1}));
  if(!Object.keys(inc).length) rows.push({cells:[{val:'Subscription / Donation',color:'#BCC5D4'},{val:rptFmt(0),color:'#1A7A4A'}],_indent:1});
  rows.push({cells:[{val:'মোট আয়',color:'#1A7A4A'},{val:rptFmt(tI),color:'#1A7A4A'}],_bold:true});
  rows.push({cells:[{val:''},{val:''}]});
  rows.push({cells:[{val:'ব্যয় (EXPENDITURE)',color:'#0F1F3D'},{val:''}],_section:true,_bold:true});
  Object.keys(exp).forEach(k=>rows.push({cells:[{val:k},{val:rptFmt(exp[k]),color:'#C0392B'}],_indent:1}));
  if(!Object.keys(exp).length) rows.push({cells:[{val:'Administrative expenses',color:'#BCC5D4'},{val:rptFmt(0),color:'#C0392B'}],_indent:1});
  rows.push({cells:[{val:'মোট ব্যয়',color:'#C0392B'},{val:rptFmt(tE),color:'#C0392B'}],_bold:true});
  rows.push({cells:[{val:''},{val:''}]});
  rows.push({cells:[{val:sur>=0?'নিট উদ্বৃত্ত (NET SURPLUS)':'নিট ঘাটতি (NET DEFICIT)',color:sur>=0?'#1A7A4A':'#C0392B'},{val:rptFmt(Math.abs(sur)),color:sur>=0?'#1A7A4A':'#C0392B'}],_bold:true});
  return wrapReportShell('Income & Expenditure','For the selected period', rptTable(['বিবরণ','পরিমাণ (BDT)'],rows,null));
}

async function buildBSReport() {
  const range = getReportDateRange();
  const {data}=await readJournalItemsWithContext((from) => from.select('journal_id,account_code,debit,credit'));
  const grps={Asset:{},Liability:{},Equity:{},Income:{},Expense:{}};
  (data||[]).filter(r=>isWithinDateRange(r.journals?.journal_date, range)).forEach(r=>{ const g=r.coa?.account_group||'Other'; const net=Number(r.debit||0)-Number(r.credit||0); if(grps[g])grps[g][r.coa?.account_name||r.account_code]=(grps[g][r.coa?.account_name||r.account_code]||0)+net; });
  const sg=g=>Object.values(grps[g]||{}).reduce((s,v)=>s+v,0);
  const tA=sg('Asset'),tL=sg('Liability'),tE=sg('Equity'),sur=sg('Income')-sg('Expense');
  const rows=[];
  rows.push({cells:[{val:'সম্পদ (ASSETS)',color:'#0F1F3D'},{val:''}],_section:true,_bold:true});
  Object.keys(grps.Asset).forEach(k=>rows.push({cells:[{val:k},{val:rptFmt(grps.Asset[k]),color:'#1A7A4A'}],_indent:1}));
  if(!Object.keys(grps.Asset).length) rows.push({cells:[{val:'Cash and equivalents',color:'#BCC5D4'},{val:rptFmt(0),color:'#1A7A4A'}],_indent:1});
  rows.push({cells:[{val:'মোট সম্পদ',color:'#1558B0'},{val:rptFmt(tA),color:'#1558B0'}],_bold:true});
  rows.push({cells:[{val:''},{val:''}]});
  rows.push({cells:[{val:'দায় (LIABILITIES)',color:'#0F1F3D'},{val:''}],_section:true,_bold:true});
  Object.keys(grps.Liability).forEach(k=>rows.push({cells:[{val:k},{val:rptFmt(grps.Liability[k]),color:'#C0392B'}],_indent:1}));
  if(!Object.keys(grps.Liability).length) rows.push({cells:[{val:'Accounts payable',color:'#BCC5D4'},{val:rptFmt(0),color:'#C0392B'}],_indent:1});
  rows.push({cells:[{val:'মোট দায়',color:'#C0392B'},{val:rptFmt(tL),color:'#C0392B'}],_bold:true});
  rows.push({cells:[{val:''},{val:''}]});
  rows.push({cells:[{val:'তহবিল (FUND/EQUITY)',color:'#0F1F3D'},{val:''}],_section:true,_bold:true});
  Object.keys(grps.Equity).forEach(k=>rows.push({cells:[{val:k},{val:rptFmt(grps.Equity[k]),color:'#1A7A4A'}],_indent:1}));
  rows.push({cells:[{val:'চলতি বছরের উদ্বৃত্ত',color:'#1A7A4A'},{val:rptFmt(sur),color:'#1A7A4A'}],_indent:1});
  rows.push({cells:[{val:'মোট তহবিল',color:'#1A7A4A'},{val:rptFmt(tE+sur),color:'#1A7A4A'}],_bold:true});
  const bal=Math.abs(tA-(tL+tE+sur))<1;
  const check=`<div class="report-highlight"><span style="font-weight:700;color:${bal?'#135A36':'#C0392B'}">${bal?'✓ Balance Sheet balances':'✗ Does NOT balance — please review'}</span><strong>${rptFmt(Math.abs(tA-(tL+tE+sur)))}</strong></div>`;
  return wrapReportShell('Statement of Financial Position','As at selected period end', rptTable(['বিবরণ','পরিমাণ (BDT)'],rows,null)+check);
}

async function buildCashBankReport() {
  const range = getReportDateRange();
  const reportFrom = range.from || getSessionDates()[0] || new Date().toISOString().slice(0,10);
  const source = await fetchStatementSource({ from: reportFrom, to: range.to || reportFrom });
  const openingBalances = deriveOpeningBalances(reportFrom);
  const all=[];
  source.collections.forEach(r=>all.push({date:r.collection_date,ref:r.receipt_no||'',desc:(getReceiptMeta(r.receipt_no).head || 'Collection') + ': ' + (r.description||''),acc:'Cash in Hand',dr:Number(r.amount||0),cr:0}));
  source.vouchers.forEach(r=>{ const payment=String(r.vch_type||'').includes('পেমেন্ট')||String(r.vch_type||'').toLowerCase().includes('payment'); all.push({date:r.vch_date,ref:getReceiptMeta(`voucher-${r.id || ''}`).voucher_no || '',desc:r.description||r.vch_type||'Voucher',acc:source.coaMap[r.account_code]?.account_name||r.account_code||'',dr:payment?0:Number(r.amount||0),cr:payment?Number(r.amount||0):0}); });
  source.journals.forEach(r=>{ const j=r.journals||{}; all.push({date:j.journal_date,ref:j.ref_no||'',desc:j.narration||'',acc:r.coa?.account_name||r.account_code||'',dr:Number(r.debit||0),cr:Number(r.credit||0)}); });
  all.sort((a,b)=>new Date(a.date||'1970-01-01')-new Date(b.date||'1970-01-01'));
  let runBal=Object.values(openingBalances).reduce((s,v)=>s+Number(v||0),0);
  const rows=[{cells:[{val:reportFrom,color:'#647188'},{val:'OPEN',color:'#647188'},{val:'Opening Balance'},{val:'Cash / Bank / Current Assets',color:'#647188'},{val:rptDash(),color:'#BCC5D4'},{val:rptDash(),color:'#BCC5D4'},{val:rptFmt(runBal),color:'#1558B0'}],_section:true,_bold:true}];
  all.forEach(r=>{ runBal+=Number(r.dr||0)-Number(r.cr||0); rows.push({cells:[{val:r.date||''},{val:r.ref||'',color:'#647188'},{val:r.desc||''},{val:r.acc||'',color:'#647188'},{val:r.dr?rptFmt(r.dr):rptDash(),color:r.dr?'#1A7A4A':'#BCC5D4'},{val:r.cr?rptFmt(r.cr):rptDash(),color:r.cr?'#C0392B':'#BCC5D4'},{val:rptFmt(runBal),color:runBal>=0?'#1558B0':'#C0392B'}]}); });
  const closing=`<div class="report-highlight"><span style="font-weight:700;color:#1558B0">Closing Balance</span><strong style="color:${runBal>=0?'#1A7A4A':'#C0392B'}">${rptFmt(runBal)}</strong></div>`;
  return wrapReportShell('ক্যাশ ও ব্যাংক বুক','Opening to closing movement summary', rptTable(['তারিখ','রেফ','বিবরণ','অ্যাকাউন্ট','প্রাপ্তি (BDT)','প্রদান (BDT)','ব্যালেন্স'],rows,null)+closing);
}

async function buildReceiptPaymentReport() {
  const range = getReportDateRange();
  const reportFrom = range.from || getSessionDates()[0] || new Date().toISOString().slice(0,10);
  const reportTo = range.to || new Date().toISOString().slice(0,10);
  const openingBalances = deriveOpeningBalances(reportFrom);
  const summary = await summarizeCurrentAssets({ from: reportFrom, to: reportTo }, openingBalances);
  const assetRows = (summary.assetRows.length ? summary.assetRows : [{name:'Cash in Hand',opening:0,receipts:0,payments:0,net:0,closing:0}]).map(item => ({
    cells:[
      {val:item.name},{val:rptFmt(item.opening),color:'#1558B0'},{val:rptFmt(item.receipts),color:'#1A7A4A'},{val:rptFmt(item.payments),color:'#C0392B'},{val:rptFmt(item.net),color:item.net>=0?'#1A7A4A':'#C0392B'},{val:rptFmt(item.closing),color:'#0F1F3D'}
    ]
  }));
  const headRows = (summary.headRows.length ? summary.headRows : [{head:'No transaction head posted yet',receipts:0,payments:0,net:0}]).map(row => ({
    cells:[
      {val:row.head,color:row.head.includes('No transaction')?'#647188':'#0B1629'},{val:rptFmt(row.receipts),color:'#1A7A4A'},{val:rptFmt(row.payments),color:'#C0392B'},{val:rptFmt(row.net),color:row.net>=0?'#1A7A4A':'#C0392B'}
    ]
  }));
  const totalClosing = summary.assetRows.reduce((s,row)=>s+Number(row.closing||0),0);
  const assetTable = rptTable(['Current Asset Head','Opening','Receipts','Payments','Net Movement','Closing'], assetRows, null);
  const headTable = rptTable(['Transaction Head','Receipts','Payments','Net'], headRows, null);
  const closing = `<div class="report-highlight"><span style="font-weight:700;color:#1558B0">Total Closing Balance (Cash/Bank/Current Assets)</span><strong>${rptFmt(totalClosing)}</strong></div>`;
  return wrapReportShell('Receipt & Payment Statement','Head wise summary including opening and closing balances', assetTable + '<div class="report-section-gap"></div>' + headTable + closing);
}

function printReport() {
  const org=S.company?.name||"Challengers of 90's";
  const title=currentReportTitle||'রিপোর্ট';
  const today=new Date().toLocaleDateString('bn-BD');
  const body=document.getElementById('reportResult').innerHTML;
  const win=window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
    <style>body{font-family:Arial,sans-serif;padding:15mm;color:#0B1629;font-size:12px}
    h1{color:#0F1F3D;font-size:18px;margin:0}h2{color:#647188;font-size:13px;font-weight:normal;margin:4px 0 16px}
    table{width:100%;border-collapse:collapse}th{background:#0F1F3D;color:#fff;padding:8px 12px;font-size:11px;text-align:left}
    td{padding:8px 12px;border-bottom:1px solid #E2E8F4;font-size:12px}
    .footer{margin-top:24px;padding-top:10px;border-top:1px solid #E2E8F4;font-size:10px;color:#647188;text-align:center}
    @media print{body{padding:10mm}}</style>
  </head><body>
  <h1>${org}</h1><h2>${title} &nbsp;|&nbsp; ${today}</h2>
  ${body}
  <div class="footer">Generated by Aura Unity ERP &nbsp;|&nbsp; © 2026 Aura Stay</div>
  <script>window.onload=()=>window.print();<\/script></body></html>`);
  win.document.close();
}

function exportPDF() {
  toast('প্রিন্ট ডায়ালগ থেকে "Save as PDF" নির্বাচন করুন।','info');
  setTimeout(printReport, 400);
}

function exportExcel() {
  const title=currentReportTitle||'report';
  const body=document.getElementById('reportResult');
  const tables=body.querySelectorAll('table');
  if(!tables.length){ toast('রিপোর্ট আগে লোড করুন।','warning'); return; }
  const org=S.company?.name||"Challengers of 90's";
  const today=new Date().toISOString().slice(0,10);
  let csv='\uFEFF';
  csv+=`"${org}"\n"${title}"\n"Date: ${today}"\n\n`;
  tables.forEach(tbl=>{
    const ths=tbl.querySelectorAll('thead th');
    if(ths.length) csv+=[...ths].map(th=>`"${th.textContent.trim()}"`).join(',')+'\n';
    tbl.querySelectorAll('tbody tr').forEach(tr=>{
      const tds=tr.querySelectorAll('td');
      if(tds.length) csv+=[...tds].map(td=>`"${td.textContent.trim().replace(/"/g,'""')}"`).join(',')+'\n';
    });
    csv+='\n';
  });
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`${title.replace(/\s+/g,'_')}_${today}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast('Excel (CSV) ডাউনলোড শুরু হয়েছে। ✅','success');
}

// ══════════════════════════════════════════
// RECEIPT
// ══════════════════════════════════════════
var sigState = { drawing:false, dataUrl:null };

function initSignaturePad() {
  const canvas = document.getElementById('sigCanvas');
  if (!canvas || canvas._sigInit) return;
  canvas._sigInit = true;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle='#0F1F3D'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.lineJoin='round';
  function getPos(e) {
    const r = canvas.getBoundingClientRect(), src = e.touches?e.touches[0]:e;
    return { x:(src.clientX-r.left)*(canvas.width/r.width), y:(src.clientY-r.top)*(canvas.height/r.height) };
  }
  function start(e){e.preventDefault();sigState.drawing=true;const p=getPos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);}
  function draw(e){e.preventDefault();if(!sigState.drawing)return;const p=getPos(e);ctx.lineTo(p.x,p.y);ctx.stroke();}
  function stop(){sigState.drawing=false;sigState.dataUrl=canvas.toDataURL();}
  canvas.addEventListener('mousedown',start); canvas.addEventListener('mousemove',draw);
  canvas.addEventListener('mouseup',stop); canvas.addEventListener('mouseleave',stop);
  canvas.addEventListener('touchstart',start,{passive:false}); canvas.addEventListener('touchmove',draw,{passive:false});
  canvas.addEventListener('touchend',stop);
}

function clearSignature() {
  const c=document.getElementById('sigCanvas'); if(!c)return;
  c.getContext('2d').clearRect(0,0,c.width,c.height); sigState.dataUrl=null;
  ['sigImg1Auth','sigImg2Auth'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='';});
}

function applySignature() {
  if (!sigState.dataUrl) return;
  ['sigImg1Auth','sigImg2Auth'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.innerHTML=`<img src="${sigState.dataUrl}" style="height:30px;max-width:90px;object-fit:contain">`;
  });
}

function genReceiptPreview() {
  const draft = getReceiptDraft();
  const rno  = draft.rno;
  const date = draft.date;
  const name = draft.name;
  const amount = Number(draft.amount || 0);
  const amt  = '৳ '+amount.toLocaleString('en-IN');
  const desc = draft.desc;
  const head = draft.head;
  const mode = draft.mode;
  const org  = S.company.name || "Challengers of 90's";
  const addr = S.company.address || '';
  const prepared = getCurrentUserName();

  const set = (id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
  set('rcpNo',rno); set('rcpNo2',rno);
  set('rcpDate',date); set('rcpDate2',date);
  set('rcpPayer',name); set('rcpPayer2',name);
  set('rcpAmt',amt); set('rcpAmt2',amt);
  set('rcpAmtWords',amountToWords(amount)); set('rcpAmtWords2',amountToWords(amount));
  set('rcpHead',head); set('rcpHead2',head);
  set('rcpMode',mode); set('rcpMode2',mode);
  set('rcpPrepared',prepared); set('rcpPrepared2',prepared);
  set('rcpDesc',desc); set('rcpDesc2',desc);
  set('rcpName',org); set('rcpName2',org);
  set('rcpAddr',addr); set('rcpAddr2',addr);

  const qrText = `Receipt: ${rno}\nDate: ${date}\nFrom: ${name}\nHead: ${head}\nMode: ${mode}\nAmount: ${amt}\nOrg: ${org}`;
  setTimeout(()=>{
    if(typeof QRCode!=='undefined'){
      ['qrCanvas1','qrCanvas2'].forEach(id=>{
        const c=document.getElementById(id);
        if(c) QRCode.toCanvas(c,qrText,{width:56,margin:1,color:{dark:'#0F1F3D',light:'#ffffff'}},()=>{});
      });
    }
  },100);
  if(sigState.dataUrl) applySignature();
  initSignaturePad();
}

function printReceipt() {
  genReceiptPreview();
  setTimeout(()=>{
    const pa=document.getElementById('printArea');
    pa.innerHTML=document.getElementById('receiptPreview').outerHTML;
    pa.style.display='block'; window.print(); pa.style.display='none'; pa.innerHTML='';
  },300);
}

// ══════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════
var charts={};
function initDashChart() {
  const ctx=document.getElementById('dashChart'); if(!ctx)return;
  if(charts.d) charts.d.destroy();
  charts.d=new Chart(ctx,{type:'bar',data:{labels:['কালেকশন','ভাউচার','জার্নাল','ব্যালেন্স'],datasets:[{data:[0,0,0,0],backgroundColor:['rgba(212,160,23,.85)','rgba(26,122,74,.85)','rgba(21,88,176,.85)','rgba(192,57,43,.75)'],borderRadius:8,borderSkipped:false}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>'৳'+Number(v).toLocaleString()},grid:{color:'rgba(0,0,0,.04)'}},x:{grid:{display:false}}}}});
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function fmt(n) { return '৳ '+Number(n||0).toLocaleString('en-IN'); }

// ══════════════════════════════════════════
// USER MANAGEMENT
// ══════════════════════════════════════════

// Password visibility toggle
function togglePassVis() {
  const inp = document.getElementById('nuPass');
  const btn = document.getElementById('passToggle');
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}

// Password strength checker
function checkPassStrength(val) {
  const bar   = document.getElementById('passStrengthBar');
  const label = document.getElementById('passStrengthLabel');
  if (!val) { bar.style.width='0%'; label.textContent=''; return; }
  let score = 0;
  if (val.length >= 8)  score++;
  if (val.length >= 12) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const levels = [
    { pct:'20%', color:'#C0392B', text:'খুব দুর্বল' },
    { pct:'40%', color:'#E67E22', text:'দুর্বল' },
    { pct:'60%', color:'#F1C40F', text:'মাঝারি' },
    { pct:'80%', color:'#27AE60', text:'শক্তিশালী' },
    { pct:'100%',color:'#1A7A4A', text:'খুব শক্তিশালী ✅' },
  ];
  const l = levels[Math.min(score, 4)];
  bar.style.width  = l.pct;
  bar.style.background = l.color;
  label.style.color    = l.color;
  label.textContent    = l.text;
}

// Map UI role labels to tenant_members DB role values
function mapUiRoleToDbRole(uiRole) {
  const r = String(uiRole || '').toLowerCase();
  if (r.includes('owner'))                               return 'owner';
  if (r.includes('super') || r.includes('admin'))        return 'superuser';
  if (r.includes('manager') || r.includes('ম্যানেজার')) return 'manager';
  return 'user';
}

// Add user via Edge Function
async function addUser() {
  const username = document.getElementById('nuName').value.trim().toLowerCase().replace(/\s+/g, '');
  const role     = document.getElementById('nuRole').value;
  const password = document.getElementById('nuPass').value;
  const errEl    = document.getElementById('userAddErr');
  const okEl     = document.getElementById('userAddOk');
  const btn      = document.getElementById('addUserBtn');

  errEl.classList.add('hidden'); okEl.classList.add('hidden');

  if (!username) { errEl.textContent='ইউজারনেম দিন।'; errEl.classList.remove('hidden'); return; }
  if (password.length < 8) { errEl.textContent='পাসওয়ার্ড কমপক্ষে ৮ অক্ষর হতে হবে।'; errEl.classList.remove('hidden'); return; }

  btn.disabled = true; btn.textContent = '⏳ যোগ হচ্ছে...';

  try {
    // Get current session token
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token || SUPA_ANON;

    const res = await fetch(`${SUPA_URL}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_ANON,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ username, password, role, ...(S.tenantId ? { tenant_id: S.tenantId } : {}) }),
    });

    const data = await res.json();
    btn.disabled = false;
    btn.innerHTML = '＋ <span>ইউজার যোগ করুন</span>';

    if (!data.ok) {
      errEl.textContent = data.message || 'ইউজার যোগ ব্যর্থ।';
      errEl.classList.remove('hidden');
      return;
    }

    // Add new user to the current tenant as a member
    if (data.user?.id && S.tenantId) {
      const dbRole = mapUiRoleToDbRole(role);
      const { error: memberErr } = await sb.from('tenant_members').insert({
        tenant_id: S.tenantId,
        user_id: data.user.id,
        role: dbRole,
        status: 'active',
        is_active: true
      });
      if (memberErr) {
        console.warn('tenant_members insert failed:', memberErr.message);
      }
    }

    okEl.textContent = `✅ "${username}" সফলভাবে যোগ হয়েছে! Email: ${data.user.email}`;
    okEl.classList.remove('hidden');

    // Reset form
    document.getElementById('nuName').value = '';
    document.getElementById('nuPass').value = '';
    document.getElementById('nuRole').value = 'ইউজার';
    document.getElementById('passStrengthBar').style.width = '0%';
    document.getElementById('passStrengthLabel').textContent = '';

    toast(`ইউজার "${username}" যোগ হয়েছে।`, 'success');
    await loadUsers();

  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '＋ <span>ইউজার যোগ করুন</span>';
    errEl.textContent = 'সংযোগ ব্যর্থ: ' + e.message;
    errEl.classList.remove('hidden');
  }
}
// Load user list — tenant-scoped when tenant is resolved, falls back to public.users
async function loadUsers() {
  const tb = document.getElementById('userTable');
  tb.innerHTML = '<tr><td colspan="5" class="td-m" style="text-align:center;padding:20px">লোড হচ্ছে...</td></tr>';

  // When tenant is resolved, show tenant-scoped app users directly. The
  // tenant_members.user_id column points at auth.users, so PostgREST cannot
  // embed public.users from that relationship.
  if (S.tenantId) {
    const { data, error } = await sb
      .from('users')
      .select('id, username, email, created_at')
      .eq('tenant_id', S.tenantId)
      .order('created_at', { ascending: false });

    if (error || !data?.length) {
      tb.innerHTML = '<tr><td colspan="5" class="td-m" style="text-align:center;padding:20px">কোনো ইউজার নেই</td></tr>';
      return;
    }

    const roleMap = { 'superuser': 'Super User' };
    tb.innerHTML = data.map(u => {
      const uname     = u.username || u.email?.split('@')[0] || '—';
      const roleLabel = roleMap[uname.toLowerCase()] || 'ইউজার';
      const badgeCls  = roleLabel === 'Super User' ? 'bg-gold' : 'bg-green';
      const date      = u.created_at ? u.created_at.slice(0,10) : '—';
      return `<tr>
        <td><strong>${esc(uname)}</strong></td>
        <td class="td-m">${esc(u.email || '—')}</td>
        <td><span class="badge ${badgeCls}">${esc(roleLabel)}</span></td>
        <td class="td-m">${esc(date)}</td>
        <td><span class="badge bg-green">Active</span></td>
      </tr>`;
    }).join('');
    return;
  }

  // Pre-migration fallback: load from public.users
  const { data, error } = await sb
    .from('users')
    .select('id, username, email, created_at')
    .order('created_at', { ascending: false });

  if (error || !data?.length) {
    tb.innerHTML = '<tr><td colspan="5" class="td-m" style="text-align:center;padding:20px">কোনো ইউজার নেই</td></tr>';
    return;
  }

  const roleMap = { 'superuser': 'Super User' };
  tb.innerHTML = data.map(u => {
    const uname = u.username || u.email?.split('@')[0] || '—';
    const role  = roleMap[uname.toLowerCase()] || 'ইউজার';
    const badgeCls = role === 'Super User' ? 'bg-gold' : role === 'ম্যানেজার' ? 'bg-navy' : 'bg-green';
    const date  = u.created_at ? u.created_at.slice(0,10) : '—';
    return `<tr>
      <td><strong>${esc(uname)}</strong></td>
      <td class="td-m">${esc(u.email || '—')}</td>
      <td><span class="badge ${badgeCls}">${esc(role)}</span></td>
      <td class="td-m">${esc(date)}</td>
      <td><span class="badge bg-green">Active</span></td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════════
// AUTH STATE CHANGE — auto-restore session
// ══════════════════════════════════════════
sb.auth.onAuthStateChange(async (event, session) => {
  if (event==='SIGNED_IN' && session) {
    S.user=session.user; S.session=session; S.tenantId=null; S.tenantSlug=getRouteTenantSlug(); S.tenantResolved=false; S.welcomeShown=false; S.activeMemberRole=null;
    // Already handled by login()
  }
});

// ══════════════════════════════════════════
// DOM READY
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('colRno').value = genRno();
  genReceiptPreview();

  // Register PWA service worker and activate fresh deploys promptly.
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      registration.update().catch(() => {});

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;

        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    }).catch((e) => console.debug('[SW] Registration failed:', e));
  }

  // Check existing session
  sb.auth.getSession().then(async ({ data:{ session } }) => {
    if (session) {
      S.user = session.user; S.session = session; S.tenantSlug = getRouteTenantSlug(); S.welcomeShown = false;
      document.getElementById('loginModal').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      document.getElementById('mobBottomNav').classList.remove('hidden');
      // Username display only — tenant and role are resolved inside initApp via getTenantId
      const { data: pub } = await sb.from('users').select('username').eq('email', session.user.email).limit(1).maybeSingle();
      document.getElementById('sbUname').textContent = pub?.username || session.user.email?.split('@')[0] || 'user';
      _resetIdleTimer();
      await initApp();
      showWelcomePopover(pub?.username || session.user.email?.split('@')[0] || 'user');
    }
  });
});
