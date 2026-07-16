// Aura Unity Accounting Core v2 client service.
// Requires the existing global `sb` Supabase client.
(function (global) {
  'use strict';

  function assertClient() {
    if (!global.sb) throw new Error('Supabase client `sb` is not initialized.');
    return global.sb;
  }

  async function validateJournal(journalId) {
    const client = assertClient();
    const { data, error } = await client.rpc('validate_journal_entry', {
      p_journal_id: Number(journalId),
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  }

  async function postJournal(journalId, reason = null) {
    const client = assertClient();
    const { data, error } = await client.rpc('post_journal_entry', {
      p_journal_id: Number(journalId),
      p_reason: reason,
    });
    if (error) throw error;
    return data;
  }

  async function reverseJournal(journalId, reversalDate, reason) {
    if (!reason || !reason.trim()) throw new Error('Reversal reason is required.');
    const client = assertClient();
    const { data, error } = await client.rpc('reverse_journal_entry', {
      p_journal_id: Number(journalId),
      p_reversal_date: reversalDate,
      p_reason: reason.trim(),
    });
    if (error) throw error;
    return data;
  }

  async function getGeneralLedger({ tenantId, from, to, accountCode } = {}) {
    const client = assertClient();
    let query = client.from('general_ledger_v2').select('*').order('journal_date').order('journal_id').order('line_no');
    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (from) query = query.gte('journal_date', from);
    if (to) query = query.lte('journal_date', to);
    if (accountCode) query = query.eq('account_code', accountCode);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  global.accountingService = Object.freeze({
    validateJournal,
    postJournal,
    reverseJournal,
    getGeneralLedger,
  });
})(window);
