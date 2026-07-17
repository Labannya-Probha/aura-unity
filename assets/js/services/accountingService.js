window.accountingService = window.accountingService || {
  async tenantId() { return getTenantId(); },
  async read(table, builder) { return readTenantRows(table, builder); },
  isPosted(row) { return isPostedJournalRow(row); }
};
