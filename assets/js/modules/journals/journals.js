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

async function submitJournal(id) {
  const note = window.prompt('Submission note (optional):', 'Ready for approval');
  if (note === null) return;
  try {
    const { error } = await sb.rpc('submit_journal_entry', {
      p_journal_id: Number(id),
      p_note: note || null
    });
    if (error) throw error;
    toast('Journal submitted for approval.', 'success');
    await loadVoucherSummary();
  } catch (error) {
    toast('Submit failed: ' + error.message, 'error');
  }
}

async function approveJournal(id) {
  const note = window.prompt('Approval note (optional):', 'Checked and approved');
  if (note === null) return;
  try {
    const { error } = await sb.rpc('approve_journal_entry', {
      p_journal_id: Number(id),
      p_note: note || null
    });
    if (error) throw error;
    toast('Journal approved.', 'success');
    await loadVoucherSummary();
  } catch (error) {
    toast('Approve failed: ' + error.message, 'error');
  }
}

async function rejectJournal(id) {
  const reason = window.prompt('Rejection reason:');
  if (reason === null) return;
  if (!reason.trim()) {
    toast('Rejection reason is required.', 'warning');
    return;
  }
  try {
    const { error } = await sb.rpc('reject_journal_entry', {
      p_journal_id: Number(id),
      p_reason: reason.trim()
    });
    if (error) throw error;
    toast('Journal rejected and returned for correction.', 'success');
    await loadVoucherSummary();
  } catch (error) {
    toast('Reject failed: ' + error.message, 'error');
  }
}

async function postJournal(id) {
  const reason = window.prompt('Posting note (optional):', 'Approved journal posted');
  if (reason === null) return;
  try {
    const { error } = await sb.rpc('post_journal_entry', {
      p_journal_id: Number(id),
      p_reason: reason || null
    });
    if (error) throw error;
    toast('Journal posted to the General Ledger.', 'success');
    await loadVoucherSummary();
    await loadDashboard();
  } catch (error) {
    toast('Post failed: ' + error.message, 'error');
  }
}

async function reverseJournal(id) {
  const reversalDate = window.prompt(
    'Reversal date (YYYY-MM-DD):',
    new Date().toISOString().slice(0, 10)
  );
  if (reversalDate === null) return;

  const reason = window.prompt('Reversal reason:');
  if (reason === null) return;
  if (!reason.trim()) {
    toast('Reversal reason is required.', 'warning');
    return;
  }

  if (!window.confirm('Create a complete reversing journal? The original entry will remain in the audit trail.')) return;

  try {
    const { data, error } = await sb.rpc('reverse_journal_entry', {
      p_journal_id: Number(id),
      p_reversal_date: reversalDate,
      p_reason: reason.trim()
    });
    if (error) throw error;
    toast('Journal reversed. Reversal journal #' + data + ' created.', 'success');
    await loadVoucherSummary();
    await loadDashboard();
  } catch (error) {
    toast('Reverse failed: ' + error.message, 'error');
  }
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

  journalBody.innerHTML =
    '<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">Loading...</td></tr>';

  const jRes = await readTenantRows('journals', (from) =>
    from
      .select('id,journal_date,ref_no,narration,total_debit,total_credit,status,submitted_by,approved_by,reversed_by_journal_id')
      .order('journal_date', { ascending:false })
      .order('id', { ascending:false })
      .limit(100)
  );

  if (jRes.error) {
    journalBody.innerHTML =
      `<tr><td colspan="6" class="td-r" style="text-align:center;padding:20px">${esc(jRes.error.message)}</td></tr>`;
    return;
  }

  const reconciledSet = getReconciledJournals();
  const showReconciledOnly = document.getElementById('showReconciledOnly')?.checked;
  let journals = jRes.data || [];
  if (showReconciledOnly) journals = journals.filter(j => reconciledSet.has(String(j.id)));

  function workflowBadge(status) {
    const map = {
      draft: ['DRAFT', 'bg-gold'],
      submitted: ['SUBMITTED', 'bg-info'],
      approved: ['APPROVED', 'bg-navy'],
      rejected: ['REJECTED', 'bg-danger'],
      posted: ['POSTED', 'bg-green'],
      reversed: ['REVERSED', 'bg-danger'],
      cancelled: ['CANCELLED', 'bg-danger']
    };
    const item = map[status] || [String(status || 'UNKNOWN').toUpperCase(), 'bg-navy'];
    return `<span class="badge ${item[1]}" style="font-size:9px">${item[0]}</span>`;
  }

  function workflowActions(j) {
    const status = j.status || 'posted';

    if (status === 'draft' || status === 'rejected') {
      return `
        <button class="btn btn-ghost btn-sm" onclick="editJournal(${j.id})">Edit</button>
        <button class="btn btn-primary btn-sm" onclick="submitJournal(${j.id})">Submit</button>
        ${canDeleteData()
          ? `<button class="btn btn-danger-lt btn-sm" onclick="deleteJournal(${j.id})">${esc(t('delete'))}</button>`
          : ''}
      `;
    }

    if (status === 'submitted') {
      return `
        <button class="btn btn-success btn-sm" onclick="approveJournal(${j.id})">Approve</button>
        <button class="btn btn-danger-lt btn-sm" onclick="rejectJournal(${j.id})">Reject</button>
        <button class="btn btn-ghost btn-sm" onclick="printJournalVoucher(${j.id})">View</button>
      `;
    }

    if (status === 'approved') {
      return `
        <button class="btn btn-gold btn-sm" onclick="postJournal(${j.id})">Post</button>
        <button class="btn btn-ghost btn-sm" onclick="printJournalVoucher(${j.id})">View</button>
      `;
    }

    if (status === 'posted') {
      const isReconciled = reconciledSet.has(String(j.id));
      return `
        <button class="btn btn-primary btn-sm" onclick="printJournalVoucher(${j.id})">Print</button>
        <button
          class="btn btn-sm"
          style="background:${isReconciled?'var(--em-lt)':'var(--info-lt)'};
                 border:1px solid ${isReconciled?'var(--em)':'var(--info)'};
                 color:${isReconciled?'var(--em)':'var(--info)'}"
          onclick="toggleReconcile(${j.id})">
          ${isReconciled ? '✓ Reconciled' : '⇌ Reconcile'}
        </button>
        <button class="btn btn-danger-lt btn-sm" onclick="reverseJournal(${j.id})">Reverse</button>
      `;
    }

    return `<button class="btn btn-ghost btn-sm" onclick="printJournalVoucher(${j.id})">View</button>`;
  }

  journalBody.innerHTML = journals.map(j => `
    <tr>
      <td>
        <span class="badge bg-navy">${esc(j.ref_no || 'JV')}</span>
        ${workflowBadge(j.status)}
      </td>
      <td>${esc(j.journal_date || '')}</td>
      <td>${esc(j.narration || '')}</td>
      <td class="td-g">${fmt(j.total_debit || 0)}</td>
      <td class="td-r">${fmt(j.total_credit || 0)}</td>
      <td>
        <div class="journal-workflow-actions">
          ${workflowActions(j)}
        </div>
      </td>
    </tr>
  `).join('') || `
    <tr>
      <td colspan="6" class="td-m" style="text-align:center;padding:28px">
        No journal voucher found
      </td>
    </tr>
  `;
}

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
  const printTimestamp = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).replace(',', '');
  const safePrintTimestamp = esc(printTimestamp);
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
  @page{size:A4 portrait;margin:0}
  html,body{width:210mm;min-height:297mm}
  body{font-family:Arial,sans-serif;color:#0B1629;background:#fff;padding:12mm 14mm 46mm;position:relative}
  table{width:100%;border-collapse:collapse}
  .print-footer{position:fixed;left:14mm;right:14mm;bottom:8mm;background:#fff;border-top:1px solid #CBD5E1;border-bottom:1px solid #CBD5E1;padding:10px 0 7px}
  .signature-row{display:grid;grid-template-columns:repeat(3,1fr);gap:34px;text-align:center}
  .signature-box{font-size:10.5px}
  .signature-line{height:24px;border-bottom:1.2px solid #0B1629;margin-bottom:5px}
  .footer-meta{display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;margin-top:12px;padding-top:7px;border-top:1px solid #E2E8F0;font-size:9px;color:#475569}
  .footer-left{text-align:left}.footer-center{text-align:center;font-weight:700;color:#0B1629}.footer-right{text-align:right;font-weight:600}
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

  <!-- Fixed Print Footer -->
  <footer class="print-footer">
    <div class="signature-row">
      <div class="signature-box"><div class="signature-line"></div><div>Prepared By</div><small style="color:#647188">${safePreparedBy}</small></div>
      <div class="signature-box"><div class="signature-line"></div><div>Verified By</div></div>
      <div class="signature-box"><div class="signature-line"></div><div>Approved By</div></div>
    </div>
    <div class="footer-meta">
      <div class="footer-left">Print: ${safePrintTimestamp}</div>
      <div class="footer-center">Powered by Aura Stay</div>
      <div class="footer-right">Page 1 of 1</div>
    </div>
  </footer>
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

