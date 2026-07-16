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
  lang: 'en',
  user: null,
  session: null,
  company: { name:"Challengers of 90's", sub:"Non Profit Krira Songothon ERP", address:"Victoria School Field, Sreemangal", phone:"01XXXXXXXXX", logo:"" },
  coa: [],
  jlc: 0,
  lastReceipt: null,
  editCollectionId: null,
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
const MEMBER_ROLE_LABELS = { owner: 'Superuser/Superadmin', superuser: 'Superuser/Superadmin', manager: 'Admin', user: 'User' };
const MEMBER_ROLE_BADGES = { owner: 'bg-danger', superuser: 'bg-gold', manager: 'bg-navy', user: 'bg-green' };
const UI_TEXT = {
  loading: { bn:'লোড হচ্ছে...', en:'Loading...' },
  noCollection: { bn:'কোনো কালেকশন নেই', en:'No collection found' },
  edit: { bn:'এডিট', en:'Edit' },
  print: { bn:'প্রিন্ট', en:'Print' },
  delete: { bn:'ডিলিট', en:'Delete' },
  active: { bn:'Active', en:'Active' },
  roleBasedAccess: { bn:'রোল ভিত্তিক অ্যাক্সেস', en:'Role based access' },
  readOnly: { bn:'শুধু দেখা যাবে', en:'Read only' },
  tenantRequired: { bn:'Tenant দরকার', en:'Tenant required' },
  noUser: { bn:'কোনো ইউজার নেই', en:'No user found' },
  noLedger: { bn:'নির্বাচিত সময়সীমায় কোনো লেজার এন্ট্রি নেই', en:'No ledger entry found for selected range' },
  dateRangeInvalid: { bn:'From Date, To Date থেকে বড় হতে পারবে না।', en:'From date cannot be after To date.' },
  xlsxMissing: { bn:'XLSX library load হয়নি। Page refresh করে আবার চেষ্টা করুন।', en:'XLSX library did not load. Refresh and try again.' },
  masterDataDenied: { bn:'শুধু Superuser/Superadmin অথবা Admin ওপেনিং ব্যালেন্স ইমপোর্ট করতে পারবে।', en:'Only Superuser/Superadmin or Admin can import opening balances.' },
  validCoaMissing: { bn:'Valid COA row পাওয়া যায়নি।', en:'No valid COA rows were found.' },
  coaImported: { bn:'COA row ইমপোর্ট/আপডেট হয়েছে।', en:'COA rows imported/updated.' },
  collectionEditDenied: { bn:'শুধু Superuser/Superadmin অথবা Admin collection edit করতে পারবে।', en:'Only Superuser/Superadmin or Admin can edit collections.' },
  collectionMissing: { bn:'Collection row পাওয়া যায়নি।', en:'Collection row not found.' },
  collectionLoaded: { bn:'Collection edit করার জন্য লোড হয়েছে।', en:'Collection loaded for editing.' },
  receiptMissing: { bn:'Receipt data পাওয়া যায়নি।', en:'Receipt data not found.' },
  collectionDeleteDenied: { bn:'শুধু Superuser/Superadmin collection delete করতে পারবে।', en:'Only Superuser/Superadmin can delete collections.' },
  collectionDeleted: { bn:'Collection delete হয়েছে।', en:'Collection deleted.' },
  roleUpdateDenied: { bn:'শুধু Superuser/Superadmin role update করতে পারবে।', en:'Only Superuser/Superadmin can update roles.' },
  tenantNotResolved: { bn:'Tenant resolve হয়নি।', en:'Tenant is not resolved.' },
  roleUpdated: { bn:'User role update হয়েছে।', en:'User role updated.' },
  xlsxDownloaded: { bn:'XLSX download শুরু হয়েছে।', en:'XLSX download started.' },
  deleteDenied: { bn:'শুধু Super User delete করতে পারবে।', en:'Only Super User can delete data.' },
  wipeDenied: { bn:'শুধু Superuser/Superadmin data wipe করতে পারবে।', en:'Only Superuser/Superadmin can wipe data.' },
  wipeTenantMissing: { bn:'Tenant resolve হয়নি, wipe করা যাবে না।', en:'Tenant is not resolved, data wipe is blocked.' },
  wipeConfirmPrompt: { bn:'ডাটা ওয়াইপ করতে tenant slug/name লিখুন:', en:'Type the tenant slug/name to wipe accounting data:' },
  wipeConfirmMismatch: { bn:'Confirmation মেলেনি। Data wipe cancel হয়েছে।', en:'Confirmation did not match. Data wipe cancelled.' },
  wipeDone: { bn:'Tenant accounting data wipe হয়েছে।', en:'Tenant accounting data wiped.' },
  wipeFailed: { bn:'Data wipe ব্যর্থ: ', en:'Data wipe failed: ' }
};
const ROLE_LABELS_I18N = {
  owner: { bn:'Superuser/Superadmin', en:'Superuser/Superadmin' },
  superuser: { bn:'Superuser/Superadmin', en:'Superuser/Superadmin' },
  manager: { bn:'Admin', en:'Admin' },
  user: { bn:'ইউজার', en:'User' }
};
const STATIC_TEXT_PAIRS = [
  ['তারিখ', 'Date'],
  ['রিসিট নং (অটো)', 'Receipt No (Auto)'],
  ['সদস্য / দাতার নাম', 'Member / Donor Name'],
  ['পরিমাণ (টাকা)', 'Amount (BDT)'],
  ['রিসিট হেড', 'Receipt Head'],
  ['পেমেন্ট মোড', 'Payment Mode'],
  ['বিবরণ / Purpose', 'Description / Purpose'],
  ['সাম্প্রতিক কালেকশন', 'Recent Collections'],
  ['কোড', 'Code'],
  ['নাম', 'Name'],
  ['গ্রুপ', 'Group'],
  ['টাইপ', 'Type'],
  ['ওপেনিং', 'Opening'],
  ['লেজার বুক', 'Ledger Book'],
  ['মোট ডেবিট', 'Total Debit'],
  ['মোট ক্রেডিট', 'Total Credit'],
  ['ব্যালেন্স', 'Balance'],
  ['লোড', 'Load'],
  ['কোম্পানি তথ্য', 'Company Info'],
  ['কোম্পানির নাম', 'Company Name'],
  ['সাব টাইটেল', 'Subtitle'],
  ['ফোন', 'Phone'],
  ['ঠিকানা', 'Address'],
  ['লোগো আপলোড', 'Logo Upload'],
  ['সেভ করুন', 'Save'],
  ['ইউজারনেম', 'Username'],
  ['রোল', 'Role'],
  ['পাসওয়ার্ড', 'Password'],
  ['বর্তমান ইউজার তালিকা', 'Current Users'],
  ['জার্নাল নং', 'Journal No'],
  ['বিবরণ', 'Description'],
  ['ডেবিট', 'Debit'],
  ['ক্রেডিট', 'Credit'],
  ['অ্যাকশন', 'Actions'],
  ['ডে বুক', 'Day Book'],
  ['ট্রায়াল ব্যালেন্স', 'Trial Balance'],
  ['ব্যালেন্স শীট', 'Balance Sheet'],
  ['আর্থিক রিপোর্টস', 'Financial Reports'],
  ['From Date', 'From Date'],
  ['To Date', 'To Date']
];
const STATIC_TEXT_LOOKUP = STATIC_TEXT_PAIRS.reduce((acc, [bn, en]) => {
  acc.bn[en] = bn;
  acc.bn[bn] = bn;
  acc.en[bn] = en;
  acc.en[en] = en;
  return acc;
}, { bn:{}, en:{} });

function t(key) {
  return UI_TEXT[key]?.[S.lang] || UI_TEXT[key]?.en || key;
}

function roleText(role) {
  const normalized = normalizeRole(role);
  return ROLE_LABELS_I18N[normalized]?.[S.lang] || MEMBER_ROLE_LABELS[normalized] || normalized;
}

function applyStaticTextDictionary(lang) {
  document.querySelectorAll('label, th, button, option, .card-title, .card-sub, .ledger-box-lbl, .rcp-key').forEach(el => {
    if (el.hasAttribute('data-bn') && el.hasAttribute('data-en')) return;
    if (['INPUT','SELECT','TEXTAREA'].includes(el.tagName)) return;
    if (el.children.length) return;
    const current = el.textContent.trim();
    const next = STATIC_TEXT_LOOKUP[lang]?.[current];
    if (next) el.textContent = next;
  });
}

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

function syncSidebarRole() {
  const roleEl = document.getElementById('sbRole');
  const userName = (document.getElementById('sbUname')?.textContent || '').trim().toLowerCase();
  if (!roleEl) return;
  if (userName === 'superuser') {
    roleEl.textContent = 'Superuser/Superadmin';
    return;
  }
  if (S.activeMemberRole) {
    roleEl.textContent = roleText(S.activeMemberRole);
  }
  updateDestructiveControls();
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
    readTenantRows('journals', (from) => from.select('id,journal_date,ref_no,narration,status')),
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

// Only rows whose parent journal is 'posted' should affect financial statements.
// Rows with no status recorded (legacy) default to 'posted' for backward compatibility.
function isPostedJournalRow(row) {
  return (row.journals?.status || 'posted') === 'posted';
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
    </tr>`).join('') || '<tr><td colspan="2" class="td-m" style="text-align:center;padding:18px">Current asset head পাওয়া যায়নি</td></tr>';
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
    rno: document.getElementById('colRno')?.value || last.rno || meta.rno || genRnoFallback(),
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

function canManageMasterData() {
  return ['owner', 'superuser', 'manager'].includes(S.activeMemberRole) || canEditVoucher();
}

function canManageUsers() {
  return ['owner', 'superuser'].includes(S.activeMemberRole) || isSuperUser();
}

function canDeleteData() {
  const uname = (document.getElementById('sbUname')?.textContent || S.user?.name || '').trim().toLowerCase();
  return uname === 'superuser' || ['owner', 'superuser'].includes(S.activeMemberRole) || /super\s*user|owner/i.test(getCurrentRole());
}

function updateDestructiveControls() {
  const wipeCard = document.getElementById('dataWipeCard');
  if (wipeCard) wipeCard.classList.toggle('hidden', !S.session || !canDeleteData());
}

function normalizeRole(role) {
  const value = String(role || '').toLowerCase();
  if (value === 'owner') return 'superuser';
  if (value.includes('super')) return 'superuser';
  if (value.includes('admin') || value.includes('manager')) return 'manager';
  return 'user';
}

function roleBadge(role) {
  return MEMBER_ROLE_BADGES[normalizeRole(role)] || 'bg-green';
}

function getVoucherPrefix(type) {
  const normalized = String(type || '').toLowerCase();
  if (normalized.includes('জার্নাল') || normalized.includes('journal')) return 'JV';
  if (normalized.includes('রিসিট') || normalized.includes('receipt')) return 'DV';
  if (normalized.includes('পেমেন্ট') || normalized.includes('payment')) return 'CV';
  if (normalized.includes('কনট্রা') || normalized.includes('contra')) return 'CN';
  return 'JV';
}

function makeVoucherRefFallback(type) {
  return `${getVoucherPrefix(type)}-${new Date().getFullYear()}-${String(Math.floor(1000+Math.random()*9000))}`;
}

async function makeVoucherRef(type) {
  const tenantId = await getTenantId();
  const prefix = getVoucherPrefix(type);
  const yr = new Date().getFullYear();
  if (!tenantId) return makeVoucherRefFallback(type);
  const { data, error } = await sb.rpc('next_voucher_number', { p_tenant_id: tenantId, p_seq_type: prefix });
  if (error || data == null) return makeVoucherRefFallback(type);
  return `${prefix}-${yr}-${String(data).padStart(8, '0')}`;
}

async function refreshVoucherRef() {
  const type = document.getElementById('vchType')?.value || 'পেমেন্ট';
  const noEl = document.getElementById('vchNo');
  if (noEl && !noEl.dataset.locked) noEl.value = await makeVoucherRef(type);
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
  const journals = (jRes.data || []).filter(isPostedJournalRow).filter(r => isWithinDateRange(r.journals?.journal_date, range));
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

// ══════════════════════════════════════════
// INIT APP
// ══════════════════════════════════════════
async function initApp() {
  const today = new Date().toISOString().slice(0,10);
  ['colDate','vchDate','jDate','dayDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });
  document.getElementById('jRef').value = await makeVoucherRef('জার্নাল');
  document.getElementById('colRno').value = await genRno();
  await refreshVoucherRef();

  await getTenantId();
  // Reflect the resolved tenant member role in the sidebar
  syncSidebarRole();
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
      if (el) { el.style.backgroundImage=`url("${c.logo}")`; el.style.backgroundSize='cover'; el.textContent=''; }
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
  if (!rows.length) { tb.innerHTML=`<tr><td colspan="5" class="td-m" style="text-align:center;padding:20px">${S.lang === 'bn' ? 'কোনো অ্যাকাউন্ট নেই' : 'No account found'}</td></tr>`; return; }
  tb.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${esc(r.account_code)}</strong></td>
      <td>${esc(r.account_name)}</td>
      <td>${esc(r.account_group||'')}</td>
      <td><span class="badge bg-gold">${esc(r.account_type||'Ledger')}</span></td>
      <td class="td-g">${fmt(r.opening_balance||0)}</td>
    </tr>`).join('');
}

function requireXLSX() {
  if (typeof XLSX === 'undefined') {
    toast(t('xlsxMissing'), 'error');
    return false;
  }
  return true;
}

function coaRowsForSheet(rows = S.coa) {
  return (rows || []).map(r => ({
    'Account Code': r.account_code || '',
    'Account Name': r.account_name || '',
    'Group': r.account_group || 'Asset',
    'Type': r.account_type || 'Ledger',
    'Opening Balance': Number(r.opening_balance || 0)
  }));
}

function downloadXLSX(filename, sheets) {
  if (!requireXLSX()) return;
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

function downloadCOATemplate() {
  downloadXLSX('coa_opening_balance_template.xlsx', {
    COA: coaRowsForSheet(S.coa.length ? S.coa : [
      { account_code:'1110', account_name:'Cash in Hand', account_group:'Asset', account_type:'Ledger', opening_balance:0 }
    ]).map(r => ({
      'Account Code': r['Account Code'],
      'Account Name': r['Account Name'],
      'Group': r.Group,
      'Type': r.Type,
      'Opening Balance': r['Opening Balance']
    }))
  });
}

function exportCOAXLSX() {
  downloadXLSX(`chart_of_accounts_${new Date().toISOString().slice(0,10)}.xlsx`, { COA: coaRowsForSheet() });
}

function readFirstSheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const wb = XLSX.read(new Uint8Array(event.target.result), { type:'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { defval:'' }));
      } catch (error) { reject(error); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function pick(row, ...keys) {
  const entries = Object.entries(row || {});
  for (const key of keys) {
    const match = entries.find(([k]) => k.trim().toLowerCase() === key.trim().toLowerCase());
    if (match) return match[1];
  }
  return '';
}

async function importCOAOpeningBalances(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !requireXLSX()) return;
  if (!canManageMasterData()) { toast(t('masterDataDenied'), 'error'); return; }
  await getTenantId();
  if (!requireTenantForWrite()) return;
  try {
    const rows = await readFirstSheet(file);
    const payload = rows.map(row => {
      const code = String(pick(row, 'Account Code', 'Code', 'account_code')).trim();
      if (!code) return null;
      return tenantInsertPayload({
        account_code: code,
        account_name: String(pick(row, 'Account Name', 'Name', 'account_name') || code).trim(),
        account_group: String(pick(row, 'Group', 'Account Group', 'account_group') || 'Asset').trim(),
        account_type: String(pick(row, 'Type', 'Account Type', 'account_type') || 'Ledger').trim(),
        opening_balance: Number(pick(row, 'Opening Balance', 'Opening', 'opening_balance') || 0)
      });
    }).filter(Boolean);
    if (!payload.length) { toast(t('validCoaMissing'), 'warning'); return; }
    const { error } = await writeWithOptionalTenant('coa', payload, (finalPayload) =>
      sb.from('coa').upsert(finalPayload, { onConflict: S.tenantId ? 'tenant_id,account_code' : 'account_code' })
    );
    if (error) { toast('COA import failed: ' + error.message, 'error'); return; }
    toast(`${payload.length} ${t('coaImported')}`, 'success');
    await loadCOA();
    await loadDashboard();
  } catch (error) {
    toast('XLSX import failed: ' + error.message, 'error');
  }
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
      toast(S.tenantResolveError || 'Tenant context resolve হয়নি।', 'error');
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
    toast(S.tenantResolveError || 'Tenant resolve হয়নি, তাই save করা যাবে না।', 'error');
    return false;
  }
  return true;
}

// ══════════════════════════════════════════
// COLLECTION
// ══════════════════════════════════════════
function genRnoFallback() {
  const yr = String(new Date().getFullYear()).slice(-2);
  return 'MR-' + yr + '-' + String(Math.floor(1000+Math.random()*9000));
}

async function genRno() {
  const tenantId = await getTenantId();
  if (!tenantId) return genRnoFallback();
  const { data, error } = await sb.rpc('next_voucher_number', { p_tenant_id: tenantId, p_seq_type: 'money_receipt' });
  if (error || data == null) return genRnoFallback();
  const yr = String(new Date().getFullYear()).slice(-2);
  return 'MR-' + yr + '-' + String(data).padStart(8, '0');
}

// ══════════════════════════════════════════
// COLLECTION → GENERAL LEDGER AUTO-POSTING
// ══════════════════════════════════════════

// Head → Income account mapping (adjust/extend as needed)
const COLLECTION_HEAD_ACCOUNT_MAP = {
  'general collection': '4102',
  'subscription': '4102',
  'sponsorship': '4301',
  'admission fee': '4101',
  'donation': '4401'
};
function resolveIncomeAccountForHead(head) {
  const key = String(head || '').trim().toLowerCase();
  return COLLECTION_HEAD_ACCOUNT_MAP[key] || '4102';
}

const COLLECTION_MODE_ASSET_MAP = {
  'cash': '1101',
  'bank transfer': '1103',
  'mobile banking': '1103',   // bKash/Nagad merged under Bank-Operating unless colMode dropdown is split
  'cheque': '1103'
};
function resolveAssetAccountForMode(mode) {
  const key = String(mode || '').trim().toLowerCase();
  return COLLECTION_MODE_ASSET_MAP[key] || '1101';
}

// Create or update the journal + journal_items linked to a collection.
// Collections represent real, completed cash/bank events, so they always post as 'posted' (no draft stage).
async function postCollectionToLedger(collectionRow, { head, mode }, existingJournalId = null) {
  const tenantId = await getTenantId();
  const debitAccount  = resolveAssetAccountForMode(mode);
  const creditAccount = resolveIncomeAccountForHead(head);
  const amount = Number(collectionRow.amount || 0);
  const narration = `Collection ${collectionRow.receipt_no} — ${collectionRow.payer_name || ''}`.trim();
  const { data: { session } } = await sb.auth.getSession();

  const journalPayload = {
    journal_date: collectionRow.collection_date,
    ref_no: collectionRow.receipt_no,
    narration,
    total_debit: amount,
    total_credit: amount,
    status: 'posted',
    posted_by: session?.user?.id || null,
    posted_at: new Date().toISOString()
  };
  if (tenantId) journalPayload.tenant_id = tenantId;

  let journalId = existingJournalId;
  if (journalId) {
    const { error: updErr } = await writeWithOptionalTenant('journals', journalPayload, (fp) =>
      sb.from('journals').update(fp).eq('id', journalId)
    );
    if (updErr) return { error: updErr };
    const { error: delErr } = await sb.from('journal_items').delete().eq('journal_id', journalId);
    if (delErr) return { error: delErr };
  } else {
    const { data: jData, error: jErr } = await writeWithOptionalTenant('journals', journalPayload, (fp) =>
      sb.from('journals').insert(fp).select().single()
    );
    if (jErr) return { error: jErr };
    journalId = jData.id;
  }

  const items = [
    { journal_id: journalId, account_code: debitAccount,  debit: amount, credit: 0 },
    { journal_id: journalId, account_code: creditAccount, debit: 0, credit: amount }
  ].map(item => tenantId ? { ...item, tenant_id: tenantId } : item);

  const { error: iErr } = await writeWithOptionalTenant('journal_items', items, (fp) => sb.from('journal_items').insert(fp));
  if (iErr) return { error: iErr };
  return { journalId, account_code: creditAccount };
}

async function deleteCollectionLedgerEntry(journalId) {
  if (!journalId) return;
  await sb.from('journal_items').delete().eq('journal_id', journalId);
  await sb.from('journals').delete().eq('id', journalId);
}

async function saveCollection() {
  const date = document.getElementById('colDate').value;
  const name = document.getElementById('colName').value.trim();
  const amt  = Number(document.getElementById('colAmt').value);
  const desc = document.getElementById('colDesc').value.trim();
  const head = document.getElementById('colHead').value;
  const mode = document.getElementById('colMode').value;
  const rno  = document.getElementById('colRno').value || await genRno();
  const tenantId = await getTenantId();
  if (!requireTenantForWrite()) return;
  if (!name || !amt) { toast('নাম ও পরিমাণ দিন।','warning'); return; }

  const payload = {
    receipt_no: rno, collection_date: date, payer_name: name, amount: amt, description: desc, member_id: _selectedMemberId || null
  };
  if (tenantId) payload.tenant_id = tenantId;

  const existingRow = S.editCollectionId ? await findCollectionByReceipt(rno) : null;

  const { data, error } = S.editCollectionId
    ? await writeWithOptionalTenant('collections', payload, (finalPayload) =>
        sb.from('collections').update(finalPayload).eq('id', S.editCollectionId).select().single()
      )
    : await writeWithOptionalTenant('collections', payload, (finalPayload) =>
        sb.from('collections').insert(finalPayload).select().single()
      );
  if (error) { toast('সেভ ব্যর্থ: '+error.message,'error'); return; }

  // Auto-post to General Ledger (Dr Cash/Bank — Cr mapped Income head)
  const ledgerResult = await postCollectionToLedger(data, { head, mode }, existingRow?.journal_id || null);
  if (ledgerResult.error) {
    toast('Ledger posting ব্যর্থ: ' + ledgerResult.error.message, 'error');
  } else {
    await sb.from('collections').update({ account_code: ledgerResult.account_code, journal_id: ledgerResult.journalId }).eq('id', data.id);
  }

  persistReceiptMeta(rno, { rno, date, name, amount: amt, desc, head, mode, savedBy:getCurrentUserName(), savedAt:new Date().toISOString() });
  S.lastReceipt = { rno, date, name, amount: amt, desc, head, mode };
  toast(S.editCollectionId ? 'Collection updated.' : 'Collection saved.','success');
  S.editCollectionId = null;
  _selectedMemberId = null;
  document.getElementById('colName').value=''; document.getElementById('colAmt').value=''; document.getElementById('colDesc').value='';
  document.getElementById('colRno').value = await genRno();
  genReceiptPreview();
  await loadCollections();
  await loadDashboard();
}

// ══════════════════════════════════════════
// MEMBERS / CONTACTS DIRECTORY
// ══════════════════════════════════════════
let _memberSearchTimer = null;
let _selectedMemberId = null;

async function searchMembers(query) {
  const tenantId = await getTenantId();
  let q = sb.from('members').select('*').order('full_name');
  if (tenantId) q = q.eq('tenant_id', tenantId);
  if (query) q = q.ilike('full_name', `%${query}%`);
  const { data } = await q.limit(8);
  return data || [];
}

async function onColNameInput(value) {
  _selectedMemberId = null;
  clearTimeout(_memberSearchTimer);
  const dropdown = document.getElementById('colNameDropdown');
  if (!dropdown) return;
  if (!value || value.trim().length < 1) { dropdown.classList.add('hidden'); return; }
  _memberSearchTimer = setTimeout(async () => {
    const matches = await searchMembers(value.trim());
    const createRow = `<div style="padding:8px 12px;cursor:pointer;color:#1A7A4A" onclick="quickCreateMember('${esc(value.trim())}')">+ Create new member "${esc(value.trim())}"</div>`;
    if (!matches.length) {
      dropdown.innerHTML = createRow;
    } else {
      dropdown.innerHTML = matches.map(m => `
        <div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #eee" onclick="selectMember(${m.id}, '${esc(m.full_name)}')">
          <strong>${esc(m.full_name)}</strong> ${m.designation ? `<span class="td-m">(${esc(m.designation)})</span>` : ''}
          <div class="td-m" style="font-size:11px">${esc(m.member_code)}</div>
        </div>`).join('') + createRow;
    }
    dropdown.classList.remove('hidden');
  }, 250);
}

function selectMember(id, name) {
  _selectedMemberId = id;
  const nameInput = document.getElementById('colName');
  if (nameInput) nameInput.value = name;
  document.getElementById('colNameDropdown')?.classList.add('hidden');
}

async function quickCreateMember(name) {
  const tenantId = await getTenantId();
  const seq = await sb.rpc('next_voucher_number', { p_tenant_id: tenantId, p_seq_type: 'member' });
  const payload = { full_name: name, member_code: 'MEM-' + String(seq.data).padStart(4,'0'), status: 'active' };
  if (tenantId) payload.tenant_id = tenantId;
  const { data, error } = await sb.from('members').insert(payload).select().single();
  if (error) { toast('Member create ব্যর্থ: ' + error.message, 'error'); return; }
  selectMember(data.id, data.full_name);
  toast(`Member "${name}" created (${data.member_code})`, 'success');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#colNameSuggest')) document.getElementById('colNameDropdown')?.classList.add('hidden');
});

async function loadMembers() {
  const { data } = await readTenantRows('members', (from) => from.select('*').order('full_name'));
  window._allMembers = data || [];
  renderMembers(window._allMembers);
}

function renderMembers(rows) {
  const tb = document.getElementById('membersBody');
  if (!tb) return;
  tb.innerHTML = rows.map(m => `
    <tr>
      <td><span class="badge bg-gold">${esc(m.member_code)}</span></td>
      <td><strong>${esc(m.full_name)}</strong></td>
      <td class="td-m">${esc(m.designation||'—')}</td>
      <td class="td-m">${esc(m.phone||'—')}</td>
      <td><span class="badge ${m.status==='active'?'bg-green':'bg-danger'}">${esc(m.status)}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="viewMemberDetail(${m.id})">Ledger</button>
        <button class="btn btn-ghost btn-sm" onclick="openMemberModal(${m.id})">Edit</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">কোনো member নেই</td></tr>';
}

function filterMembers(query) {
  const q = query.trim().toLowerCase();
  const filtered = (window._allMembers||[]).filter(m =>
    m.full_name.toLowerCase().includes(q) || (m.member_code||'').toLowerCase().includes(q) || (m.phone||'').includes(q));
  renderMembers(filtered);
}

function openMemberModal(id = null) {
  document.getElementById('memEditId').value = id || '';
  const m = id ? (window._allMembers||[]).find(x => x.id === id) : null;
  document.getElementById('memberModalTitle').textContent = id ? 'Edit Member' : 'New Member';
  document.getElementById('memName').value = m?.full_name || '';
  document.getElementById('memDesig').value = m?.designation || '';
  document.getElementById('memPhone').value = m?.phone || '';
  document.getElementById('memAddr').value = m?.address || '';
  document.getElementById('memberModal').classList.remove('hidden');
}

async function saveMember() {
  const id = document.getElementById('memEditId').value;
  const tenantId = await getTenantId();
  const payload = {
    full_name: document.getElementById('memName').value.trim(),
    designation: document.getElementById('memDesig').value.trim(),
    phone: document.getElementById('memPhone').value.trim(),
    address: document.getElementById('memAddr').value.trim()
  };
  if (!payload.full_name) { toast('নাম দিন।', 'warning'); return; }
  let error;
  if (id) {
    ({ error } = await sb.from('members').update(payload).eq('id', id));
  } else {
    const seq = await sb.rpc('next_voucher_number', { p_tenant_id: tenantId, p_seq_type: 'member' });
    payload.member_code = 'MEM-' + String(seq.data).padStart(4,'0');
    payload.status = 'active';
    if (tenantId) payload.tenant_id = tenantId;
    ({ error } = await sb.from('members').insert(payload));
  }
  if (error) { toast('সেভ ব্যর্থ: ' + error.message, 'error'); return; }
  toast('Member সেভ হয়েছে।', 'success');
  closeModal('memberModal');
  await loadMembers();
}

let _currentDetailMemberId = null;
async function viewMemberDetail(id) {
  _currentDetailMemberId = id;
  const m = (window._allMembers||[]).find(x => x.id === id);
  if (!m) return;
  document.getElementById('mdName').textContent = `${m.full_name} (${m.member_code})`;
  document.getElementById('mdContact').innerHTML = `${m.designation ? esc(m.designation)+' · ' : ''}${esc(m.phone||'No phone')} · ${esc(m.address||'No address')}`;
  const { data } = await sb.from('collections').select('collection_date,receipt_no,description,amount').eq('member_id', id).order('collection_date', { ascending:false });
  const rows = data || [];
  const total = rows.reduce((s,r) => s + Number(r.amount||0), 0);
  document.getElementById('mdLedgerBody').innerHTML = rows.map(r => `
    <tr><td>${esc(r.collection_date)}</td><td>${esc(r.receipt_no)}</td><td>${esc(r.description||'')}</td><td class="td-g">${fmt(r.amount)}</td></tr>
  `).join('') || '<tr><td colspan="4" class="td-m" style="text-align:center">কোনো transaction নেই</td></tr>';
  document.getElementById('mdLedgerTotal').textContent = fmt(total);
  document.getElementById('memberDetailModal').classList.remove('hidden');
}

function editMemberFromDetail() {
  closeModal('memberDetailModal');
  openMemberModal(_currentDetailMemberId);
}

async function loadCollections() {
  const tb = document.getElementById('colList');
  tb.innerHTML = `<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">${esc(t('loading'))}</td></tr>`;
  const { data, error } = await readTenantRows('collections', (from) => from.select('*').order('created_at', { ascending:false }).limit(20));
  if (error || !data.length) { tb.innerHTML=`<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">${esc(t('noCollection'))}</td></tr>`; return; }
  tb.innerHTML = data.map(r => `
    <tr>
      <td><span class="badge bg-gold">${esc(r.receipt_no||'—')}</span></td>
      <td>${esc(r.collection_date||'')}</td>
      <td>${esc(r.payer_name||'')}</td>
      <td class="td-g"><strong>${fmt(r.amount)}</strong></td>
      <td class="td-m">${esc(r.description||'')}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick='editCollection(${JSON.stringify(r.receipt_no || '')})'>${esc(t('edit'))}</button>
          <button class="btn btn-primary btn-sm" onclick='printCollectionReceipt(${JSON.stringify(r.receipt_no || '')})'>${esc(t('print'))}</button>
          ${canDeleteData() ? `<button class="btn btn-danger-lt btn-sm" onclick='deleteCollection(${JSON.stringify(r.receipt_no || '')})'>${esc(t('delete'))}</button>` : ''}
        </div>
      </td>
    </tr>`).join('');
}

async function findCollectionByReceipt(receiptNo) {
  const { data, error } = await readTenantRows('collections', (from) => from.select('*').eq('receipt_no', receiptNo).limit(1));
  if (error || !data?.[0]) return null;
  return data[0];
}

async function editCollection(receiptNo) {
  if (!canEditVoucher()) { toast(t('collectionEditDenied'), 'error'); return; }
  const row = await findCollectionByReceipt(receiptNo);
  if (!row) { toast(t('collectionMissing'), 'error'); return; }
  const meta = getReceiptMeta(row.receipt_no);
  S.editCollectionId = row.id;
  _selectedMemberId = row.member_id || null;
  document.getElementById('colDate').value = row.collection_date || '';
  document.getElementById('colRno').value = row.receipt_no || '';
  document.getElementById('colName').value = row.payer_name || '';
  document.getElementById('colAmt').value = Number(row.amount || 0) || '';
  document.getElementById('colDesc').value = row.description || '';
  document.getElementById('colHead').value = meta.head || 'General Collection';
  document.getElementById('colMode').value = meta.mode || 'Cash';
  document.getElementById('colDate')?.scrollIntoView({ behavior:'smooth', block:'center' });
  toast(t('collectionLoaded'), 'info');
}

async function printCollectionReceipt(receiptNo) {
  window.open(`money-receipt.html?receipt_no=${encodeURIComponent(receiptNo)}&lang=${S.lang}`, '_blank');
}

async function deleteCollection(receiptNo) {
  if (!canDeleteData()) { toast(t('deleteDenied'), 'error'); return; }
  if (!window.confirm(`Delete collection ${receiptNo}?`)) return;
  const row = await findCollectionByReceipt(receiptNo);
  let query = sb.from('collections').delete().eq('receipt_no', receiptNo);
  if (S.tenantId) query = query.eq('tenant_id', S.tenantId);
  const { error } = await query;
  if (error) { toast('Collection delete failed: ' + error.message, 'error'); return; }
  if (row?.journal_id) await deleteCollectionLedgerEntry(row.journal_id);
  toast(t('collectionDeleted'), 'success');
  await loadCollections();
  await loadDashboard();
}

async function wipeTenantAccountingData() {
  if (!canDeleteData()) { toast(t('wipeDenied'), 'error'); return; }
  await getTenantId();
  if (!S.tenantId) { toast(t('wipeTenantMissing'), 'error'); return; }
  const selected = new Set(Array.from(document.querySelectorAll('.wipe-table:checked')).map(el => el.value));
  if (!selected.size) { toast('Select at least one data area to wipe.', 'warning'); return; }
  const expected = S.tenantSlug || getRouteTenantSlug() || S.company?.name || '';
  const typed = window.prompt(`${t('wipeConfirmPrompt')}\n${expected}`);
  if (!typed || typed.trim().toLowerCase() !== String(expected).trim().toLowerCase()) {
    toast(t('wipeConfirmMismatch'), 'warning');
    return;
  }
  const tables = [];
  if (selected.has('journals')) tables.push('journal_items', 'journals');
  if (selected.has('vouchers')) tables.push('vouchers');
  if (selected.has('collections')) tables.push('collections');
  if (selected.has('coa')) tables.push('coa');
  for (const table of [...new Set(tables)]) {
    const { error } = await sb.from(table).delete().eq('tenant_id', S.tenantId);
    if (error) { toast(t('wipeFailed') + error.message, 'error'); return; }
  }
  if (selected.has('local_state')) {
    updateLocalState((state) => {
      state.receiptMeta = {};
      state.daySessions = {};
    });
  }
  if (selected.has('coa')) S.coa = [];
  S.lastReceipt = null;
  S.editCollectionId = null;
  S.editJournalId = null;
  toast(t('wipeDone'), 'success');
  await loadCOA();
  await loadCollections();
  await loadDashboard();
}

// ══════════════════════════════════════════
// VOUCHER
// ══════════════════════════════════════════
async function saveVoucher() {
  const type = document.getElementById('vchType').value;
  const ref  = document.getElementById('vchNo').value || await makeVoucherRef(type);
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
  document.getElementById('vchAmt').value=''; document.getElementById('vchDesc').value=''; await refreshVoucherRef();
  loadVoucherSummary();
}

// ══════════════════════════════════════════
// JOURNAL — Double Entry — Draft → Posted → Cancelled workflow
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

async function resetJournalForm() {
  document.getElementById('jNar').value = '';
  document.getElementById('jRef').value = await makeVoucherRef('জার্নাল');
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

  const ref = document.getElementById('jRef').value || await makeVoucherRef('জার্নাল');
  const payload = {
    journal_date: document.getElementById('jDate').value,
    ref_no: ref,
    narration: document.getElementById('jNar').value,
    total_debit: dr, total_credit: cr
  };
  if (tenantId) payload.tenant_id = tenantId;
  // New manual journal vouchers start as Draft and require an explicit "Post" action.
  // Editing an existing journal preserves its current status (posted journals cannot reach this path — see editJournal()).
  if (!S.editJournalId) payload.status = 'draft';

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

  toast(S.editJournalId ? 'জার্নাল আপডেট হয়েছে।' : 'জার্নাল Draft হিসেবে সেভ হয়েছে — Post করুন Reports-এ যোগ করতে।','success');
  await resetJournalForm();
  await loadVoucherSummary();
  await loadDashboard();
}

async function postJournal(id) {
  if (!canEditVoucher()) { toast('Post করার অনুমতি নেই।', 'error'); return; }
  const { data: { session } } = await sb.auth.getSession();
  const { error } = await sb.from('journals')
    .update({ status: 'posted', posted_by: session?.user?.id || null, posted_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'draft');
  if (error) { toast('Post ব্যর্থ: ' + error.message, 'error'); return; }
  toast('জার্নাল Post হয়েছে — এখন লক করা এবং Reports-এ যুক্ত হয়েছে।', 'success');
  await loadVoucherSummary();
  await loadDashboard();
}

async function cancelJournal(id) {
  if (!canDeleteData()) { toast('শুধু Superuser cancel করতে পারবে।', 'error'); return; }
  if (!window.confirm('এই posted জার্নাল cancel করতে চান? এটি ডিলিট হবে না, শুধু Reports থেকে বাদ যাবে।')) return;
  const { data: { session } } = await sb.auth.getSession();
  const { error } = await sb.from('journals')
    .update({ status: 'cancelled', cancelled_by: session?.user?.id || null, cancelled_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { toast('Cancel ব্যর্থ: ' + error.message, 'error'); return; }
  toast('জার্নাল Cancelled।', 'success');
  await loadVoucherSummary();
  await loadDashboard();
}

async function editJournal(id) {
  if (!canEditVoucher()) { toast('Admin/Superuser edit করতে পারবে।', 'error'); return; }
  const { data: journalRows, error } = await readTenantRows('journals', (from) => from.select('*').eq('id', id).limit(1));
  const journal = journalRows?.[0];
  if (error || !journal) { toast('জার্নাল লোড ব্যর্থ।', 'error'); return; }
  if ((journal.status || 'posted') !== 'draft') { toast('শুধু Draft journal edit করা যাবে — posted journal Cancel করে notun journal দিন।', 'error'); return; }
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
  if (!canDeleteData()) { toast(t('deleteDenied'), 'error'); return; }
  const { data: rows } = await readTenantRows('journals', (from) => from.select('status').eq('id', id).limit(1));
  if (rows?.[0]?.status === 'posted') { toast('Posted journal ডিলিট করা যাবে না — Cancel করুন।', 'error'); return; }
  if (!window.confirm('এই জার্নাল ভাউচার মুছে ফেলতে চান?')) return;
  const { error: iErr } = await sb.from('journal_items').delete().eq('journal_id', id);
  if (iErr) { toast('জার্নাল আইটেম ডিলিট ব্যর্থ: '+iErr.message, 'error'); return; }
  const { error } = await sb.from('journals').delete().eq('id', id);
  if (error) { toast('জার্নাল ডিলিট ব্যর্থ: '+error.message, 'error'); return; }
  toast('জার্নাল ভাউচার ডিলিট হয়েছে।', 'success');
  await loadVoucherSummary();
  await loadDashboard();
}

async function loadVoucherSummary() {
  const journalBody = document.getElementById('journalSummaryBody');
  if (!journalBody) return;
  journalBody.innerHTML = '<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">লোড হচ্ছে...</td></tr>';
  const jRes = await readTenantRows('journals', (from) => from.select('id,journal_date,ref_no,narration,total_debit,total_credit,status').order('journal_date', { ascending:false }).limit(50));
  const reconciledSet = getReconciledJournals();
  const showReconciledOnly = document.getElementById('showReconciledOnly')?.checked;
  let journals = jRes.data || [];
  if (showReconciledOnly) journals = journals.filter(j => reconciledSet.has(String(j.id)));
  journalBody.innerHTML = journals.map(j => {
    const isReconciled = reconciledSet.has(String(j.id));
    const status = j.status || 'posted';
    const statusBadge = status === 'draft'
      ? '<span class="badge bg-gold" style="font-size:9px">DRAFT</span>'
      : status === 'cancelled'
        ? '<span class="badge bg-danger" style="font-size:9px">CANCELLED</span>'
        : '<span class="badge bg-green" style="font-size:9px">POSTED</span>';
    const actions = status === 'draft'
      ? `<button class="btn btn-ghost btn-sm" onclick="editJournal(${j.id})">Edit</button>
         <button class="btn btn-gold btn-sm" onclick="postJournal(${j.id})">✓ Post</button>
         ${canDeleteData() ? `<button class="btn btn-danger-lt btn-sm" onclick="deleteJournal(${j.id})">${esc(t('delete'))}</button>` : ''}`
      : status === 'posted'
        ? `<button class="btn btn-primary btn-sm" onclick="printJournalVoucher(${j.id})">Print</button>
           <button class="btn btn-sm" style="background:${isReconciled?'var(--em-lt)':'var(--info-lt)'};border:1px solid ${isReconciled?'var(--em)':'var(--info)'};color:${isReconciled?'var(--em)':'var(--info)'}" onclick="toggleReconcile(${j.id})">${isReconciled ? '✓ Reconciled' : '⇌ Reconcile'}</button>
           ${canDeleteData() ? `<button class="btn btn-danger-lt btn-sm" onclick="cancelJournal(${j.id})">Cancel</button>` : ''}`
        : `<button class="btn btn-ghost btn-sm" onclick="printJournalVoucher(${j.id})">Print</button>`;
    return `<tr>
      <td><span class="badge bg-navy">${esc(j.ref_no || 'JV')}</span> ${statusBadge}</td>
      <td>${esc(j.journal_date || '')}</td>
      <td>${esc(j.narration || '')}</td>
      <td class="td-g">${fmt(j.total_debit || 0)}</td>
      <td class="td-r">${fmt(j.total_credit || 0)}</td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap">${actions}</div></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">কোনো জার্নাল ভাউচার নেই</td></tr>';
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
  <div style="margin-top:24px;display:flex;justify-content:space-between;gap:16px;font-size:10.5px;color:#647188;border-top:1px solid #E2E8F4;padding-top:8px">     <span>&copy; 2026 Aura Stay</span><strong style="color:#0B1629">Powered by Aura Stay</strong>   </div>
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
    readTenantRows('journals', (from) => from.select('journal_date,narration,ref_no,total_debit,total_credit,status').order('journal_date'))
  ]);

  const rows = [];
  (colRes.data||[]).forEach(r => rows.push({ date:r.collection_date, desc:'Collection: '+(r.description||''), dr:r.amount, cr:0, acc:'Cash in Hand', ref:r.receipt_no }));
  (vchRes.data||[]).forEach(r => {
    const isPayment = String(r.vch_type||'').toLowerCase().includes('পেমেন্ট');
    rows.push({ date:r.vch_date, desc:r.description||r.vch_type, dr:isPayment?0:r.amount, cr:isPayment?r.amount:0, acc:r.account_code, ref:'' });
  });
  (jRes.data||[]).filter(r => (r.status||'posted')==='posted').forEach(r => rows.push({ date:r.journal_date, desc:r.narration||'Journal', dr:r.total_debit, cr:r.total_credit, acc:'Journal', ref:r.ref_no }));

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
  const fromDate = document.getElementById('ledFrom')?.value || '';
  const toDate = document.getElementById('ledTo')?.value || '';
  if (fromDate && toDate && fromDate > toDate) { toast(t('dateRangeInvalid'), 'warning'); return; }
  const tb = document.getElementById('ledBody');
  tb.innerHTML = '<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">লোড হচ্ছে...</td></tr>';

  const { data: rawData, error } = await readJournalItemsWithContext((from) => from
    .select('journal_id,debit,credit,account_code')
    .eq('account_code', accCode)
    .order('journal_id'));

  const rows = (rawData || []).filter(isPostedJournalRow).filter(row => {
    const d = String(row.journals?.journal_date || '').slice(0, 10);
    if (!d) return false;
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  });

  if (error || !rows.length) { tb.innerHTML=`<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">${esc(t('noLedger'))}</td></tr>`; return; }

  let tDr=0, tCr=0, bal=0;
  tb.innerHTML = rows.map(r => {
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

function clearLedgerRange() {
  const from = document.getElementById('ledFrom');
  const to = document.getElementById('ledTo');
  if (from) from.value = '';
  if (to) to.value = '';
  loadLedger();
}

// ══════════════════════════════════════════
// TRIAL BALANCE
// ══════════════════════════════════════════
async function loadTrialBalance() {
  const tb = document.getElementById('tbBody');
  tb.innerHTML = '<tr><td colspan="4" class="td-m" style="text-align:center;padding:20px">লোড হচ্ছে...</td></tr>';

  const { data: rawData, error } = await readJournalItemsWithContext((from) => from
    .select('journal_id,account_code,debit,credit'));

  if (error) { tb.innerHTML='<tr><td colspan="4" class="td-m" style="text-align:center">এরর: '+error.message+'</td></tr>'; return; }
  const data = (rawData || []).filter(isPostedJournalRow);

  const accs = {};
  data.forEach(r => {
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
  const { data: rawData } = await readJournalItemsWithContext((from) => from.select('journal_id,account_code,debit,credit'));
  const data = (rawData || []).filter(isPostedJournalRow);
  const accs = {};
  data.forEach(r => {
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

