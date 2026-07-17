window.reportService = window.reportService || {
  async source(range) { return fetchStatementSource(range); },
  async currentAssets(range, openingBalances) {
    return summarizeCurrentAssets(range, openingBalances);
  }
};
