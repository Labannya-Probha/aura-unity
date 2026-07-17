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

