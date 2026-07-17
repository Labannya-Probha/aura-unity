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

