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
  bn:{dashboard:'ড্যাশবোর্ড',collection:'মাসিক কালেকশন',voucher:'ভাউচার ও জার্নাল',receipt:'মানি রিসিট',reports:'রিপোর্টস',journal:'ভাউচার ও জার্নাল',ledger:'লেজার বুক',daybook:'ডে বুক',trialbalance:'ট্রায়াল ব্যালেন্স',balancesheet:'ব্যালেন্স শীট',coa:'চার্ট অব অ্যাকাউন্টস',periodclose:'পিরিয়ড ক্লোজিং',receivables:'প্রাপ্য হিসাব', company:'কোম্পানি তথ্য',users:'ইউজার'},
  en:{dashboard:'Dashboard',collection:'Collections',voucher:'Voucher & Journal',receipt:'Money Receipt',reports:'Reports',journal:'Voucher & Journal',ledger:'Ledger Book',daybook:'Day Book',trialbalance:'Trial Balance',balancesheet:'Balance Sheet',coa:'Chart of Accounts',periodclose:'Period Closing',receivables:'Receivables', company:'Company Info',users:'Users'}
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

