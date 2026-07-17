// Aura Unity — Journal Module v2
// Modular workflow UI layered over the existing Accounting Core RPC functions.
(function () {
  'use strict';

  const STATUS_META = {
    draft:     { label: 'DRAFT',     badge: 'bg-gold' },
    submitted: { label: 'SUBMITTED', badge: 'bg-info' },
    approved:  { label: 'APPROVED',  badge: 'bg-navy' },
    rejected:  { label: 'REJECTED',  badge: 'bg-danger' },
    posted:    { label: 'POSTED',    badge: 'bg-green' },
    reversed:  { label: 'REVERSED',  badge: 'bg-danger' },
    cancelled: { label: 'CANCELLED', badge: 'bg-danger' }
  };

  function statusBadge(status) {
    const meta = STATUS_META[status] || { label: String(status || 'UNKNOWN').toUpperCase(), badge: 'bg-navy' };
    return `<span class="badge ${meta.badge}" style="font-size:9px">${meta.label}</span>`;
  }

  function currentRole() {
    return String(S.activeMemberRole || '').toLowerCase();
  }

  function canApprove() {
    return ['owner', 'superuser', 'manager'].includes(currentRole());
  }

  function actionButtons(j, reconciledSet) {
    const status = String(j.status || 'posted').toLowerCase();
    if (status === 'draft' || status === 'rejected') {
      return `
        <button class="btn btn-ghost btn-sm" onclick="editJournal(${j.id})">Edit</button>
        <button class="btn btn-primary btn-sm" onclick="submitJournal(${j.id})">Submit</button>
        <button class="btn btn-ghost btn-sm" onclick="openJournalHistory(${j.id})">History</button>
        ${canDeleteData() ? `<button class="btn btn-danger-lt btn-sm" onclick="deleteJournal(${j.id})">${esc(t('delete'))}</button>` : ''}`;
    }
    if (status === 'submitted') {
      return `${canApprove() ? `
        <button class="btn btn-success btn-sm" onclick="approveJournal(${j.id})">Approve</button>
        <button class="btn btn-danger-lt btn-sm" onclick="rejectJournal(${j.id})">Reject</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="printJournalVoucher(${j.id})">View</button>
        <button class="btn btn-ghost btn-sm" onclick="openJournalHistory(${j.id})">History</button>`;
    }
    if (status === 'approved') {
      return `${canApprove() ? `<button class="btn btn-gold btn-sm" onclick="postJournal(${j.id})">Post</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="printJournalVoucher(${j.id})">View</button>
        <button class="btn btn-ghost btn-sm" onclick="openJournalHistory(${j.id})">History</button>`;
    }
    if (status === 'posted') {
      const isReconciled = reconciledSet.has(String(j.id));
      return `
        <button class="btn btn-primary btn-sm" onclick="printJournalVoucher(${j.id})">Print</button>
        <button class="btn btn-sm" style="background:${isReconciled?'var(--em-lt)':'var(--info-lt)'};border:1px solid ${isReconciled?'var(--em)':'var(--info)'};color:${isReconciled?'var(--em)':'var(--info)'}" onclick="toggleReconcile(${j.id})">${isReconciled ? '✓ Reconciled' : '⇌ Reconcile'}</button>
        ${canApprove() ? `<button class="btn btn-danger-lt btn-sm" onclick="reverseJournal(${j.id})">Reverse</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="openJournalHistory(${j.id})">History</button>`;
    }
    return `
      <button class="btn btn-ghost btn-sm" onclick="printJournalVoucher(${j.id})">View</button>
      <button class="btn btn-ghost btn-sm" onclick="openJournalHistory(${j.id})">History</button>`;
  }

  function ensureWorkflowSummary() {
    const table = document.getElementById('journalSummaryBody')?.closest('table');
    if (!table || document.getElementById('journalWorkflowSummary')) return;
    const el = document.createElement('div');
    el.id = 'journalWorkflowSummary';
    el.className = 'journal-v2-summary';
    el.innerHTML = `
      <div><span id="jv2Draft">0</span><small>Draft</small></div>
      <div><span id="jv2Submitted">0</span><small>Pending approval</small></div>
      <div><span id="jv2Approved">0</span><small>Ready to post</small></div>
      <div><span id="jv2Posted">0</span><small>Posted</small></div>`;
    table.parentElement.insertBefore(el, table);
  }

  function updateSummary(journals) {
    ensureWorkflowSummary();
    const counts = journals.reduce((a, j) => {
      const key = String(j.status || 'posted').toLowerCase();
      a[key] = (a[key] || 0) + 1;
      return a;
    }, {});
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value || 0; };
    set('jv2Draft', (counts.draft || 0) + (counts.rejected || 0));
    set('jv2Submitted', counts.submitted || 0);
    set('jv2Approved', counts.approved || 0);
    set('jv2Posted', counts.posted || 0);
  }

  window.loadVoucherSummary = async function loadVoucherSummaryV2() {
    const journalBody = document.getElementById('journalSummaryBody');
    if (!journalBody) return;
    journalBody.innerHTML = '<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">Loading...</td></tr>';

    const jRes = await readTenantRows('journals', (from) =>
      from.select('id,journal_date,ref_no,narration,total_debit,total_credit,status,submitted_at,approved_at,posted_at')
        .order('journal_date', { ascending:false })
        .order('id', { ascending:false })
        .limit(100)
    );

    if (jRes.error) {
      journalBody.innerHTML = `<tr><td colspan="6" class="td-r" style="text-align:center;padding:20px">${esc(jRes.error.message)}</td></tr>`;
      return;
    }

    const reconciledSet = getReconciledJournals();
    const showReconciledOnly = document.getElementById('showReconciledOnly')?.checked;
    let journals = jRes.data || [];
    updateSummary(journals);
    if (showReconciledOnly) journals = journals.filter(j => reconciledSet.has(String(j.id)));

    journalBody.innerHTML = journals.map(j => `
      <tr>
        <td><span class="badge bg-navy">${esc(j.ref_no || 'JV')}</span> ${statusBadge(j.status)}</td>
        <td>${esc(j.journal_date || '')}</td>
        <td>${esc(j.narration || '')}</td>
        <td class="td-g">${fmt(j.total_debit || 0)}</td>
        <td class="td-r">${fmt(j.total_credit || 0)}</td>
        <td><div class="journal-workflow-actions">${actionButtons(j, reconciledSet)}</div></td>
      </tr>`).join('') || '<tr><td colspan="6" class="td-m" style="text-align:center;padding:28px">No journal voucher found</td></tr>';
  };

  function ensureHistoryModal() {
    if (document.getElementById('journalHistoryModal')) return;
    const modal = document.createElement('div');
    modal.id = 'journalHistoryModal';
    modal.className = 'modal-overlay hidden';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:760px">
        <div class="modal-header">
          <div class="modal-title">Journal Workflow History</div>
          <button class="modal-close" onclick="closeModal('journalHistoryModal')">×</button>
        </div>
        <div class="modal-body"><div id="journalHistoryContent" class="td-m">Loading...</div></div>
      </div>`;
    document.body.appendChild(modal);
  }

  window.openJournalHistory = async function (journalId) {
    ensureHistoryModal();
    const content = document.getElementById('journalHistoryContent');
    content.textContent = 'Loading...';
    openModal('journalHistoryModal');
    const { data, error } = await sb.from('journal_workflow_history')
      .select('from_status,to_status,action,note,performed_at,performed_by')
      .eq('journal_id', Number(journalId))
      .order('performed_at', { ascending:true });
    if (error) { content.textContent = error.message; return; }
    if (!data?.length) { content.innerHTML = '<div class="alert alert-info">No workflow history recorded yet.</div>'; return; }
    content.innerHTML = `<div class="journal-history-list">${data.map(x => `
      <div class="journal-history-item">
        <div><strong>${esc(String(x.action || '').toUpperCase())}</strong> · ${esc(x.from_status || '—')} → ${esc(x.to_status || '—')}</div>
        <small>${esc(new Date(x.performed_at).toLocaleString())}</small>
        ${x.note ? `<p>${esc(x.note)}</p>` : ''}
      </div>`).join('')}</div>`;
  };

  document.addEventListener('DOMContentLoaded', ensureHistoryModal);
})();
