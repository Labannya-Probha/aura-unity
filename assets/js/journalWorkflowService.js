// Aura Unity — Journal Workflow Service
// Requires the global Supabase client `sb` used by the current static app.

(function (global) {
  function assertClient() {
    if (!global.sb) {
      throw new Error('Supabase client `sb` is not available.');
    }
    return global.sb;
  }

  async function callRpc(name, args) {
    const client = assertClient();
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  const journalWorkflowService = {
    async validate(journalId) {
      const client = assertClient();
      const { data, error } = await client.rpc('validate_journal_entry', {
        p_journal_id: Number(journalId)
      });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },

    submit(journalId, note = null) {
      return callRpc('submit_journal_entry', {
        p_journal_id: Number(journalId),
        p_note: note
      });
    },

    approve(journalId, note = null) {
      return callRpc('approve_journal_entry', {
        p_journal_id: Number(journalId),
        p_note: note
      });
    },

    reject(journalId, reason) {
      if (!String(reason || '').trim()) {
        throw new Error('Rejection reason is required.');
      }
      return callRpc('reject_journal_entry', {
        p_journal_id: Number(journalId),
        p_reason: String(reason).trim()
      });
    },

    post(journalId, reason = null) {
      return callRpc('post_journal_entry', {
        p_journal_id: Number(journalId),
        p_reason: reason
      });
    },

    reverse(journalId, reversalDate, reason) {
      if (!reversalDate) throw new Error('Reversal date is required.');
      if (!String(reason || '').trim()) {
        throw new Error('Reversal reason is required.');
      }
      return callRpc('reverse_journal_entry', {
        p_journal_id: Number(journalId),
        p_reversal_date: reversalDate,
        p_reason: String(reason).trim()
      });
    },

    async getQueue({ tenantId, status = null, limit = 100 } = {}) {
      const client = assertClient();
      let query = client
        .from('journal_workflow_queue')
        .select('*')
        .order('journal_date', { ascending: false })
        .limit(limit);

      if (tenantId) query = query.eq('tenant_id', tenantId);
      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async getHistory(journalId) {
      const client = assertClient();
      const { data, error } = await client
        .from('journal_workflow_history')
        .select('*')
        .eq('journal_id', Number(journalId))
        .order('performed_at', { ascending: true });

      if (error) throw error;
      return data || [];
    }
  };

  global.journalWorkflowService = journalWorkflowService;
})(window);
