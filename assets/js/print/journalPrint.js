// Journal print facade. Existing printJournalVoucher implementation is provided
// by the journals module; this facade gives future modules a stable API.
window.AuraUnity?.register('journalPrint', {
  print(journalId) {
    if (typeof window.printJournalVoucher !== 'function') {
      throw new Error('Journal print module is not available.');
    }
    return window.printJournalVoucher(journalId);
  }
});
