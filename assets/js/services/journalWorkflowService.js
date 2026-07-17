window.journalWorkflowService = window.journalWorkflowService || {
  submit: (...args) => window.submitJournalEntry?.(...args),
  approve: (...args) => window.approveJournalEntry?.(...args),
  reject: (...args) => window.rejectJournalEntry?.(...args),
  post: (...args) => window.postJournalEntry?.(...args),
  reverse: (...args) => window.reverseJournalEntry?.(...args)
};
