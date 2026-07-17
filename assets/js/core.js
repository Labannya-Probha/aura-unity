// Aura Unity Enterprise v2 — application bootstrap only.
async function initApp() {
  const today = new Date().toISOString().slice(0, 10);
  ['colDate', 'vchDate', 'jDate', 'dayDate'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });

  const journalRef = document.getElementById('jRef');
  const receiptRef = document.getElementById('colRno');
  if (journalRef) journalRef.value = await makeVoucherRef('জার্নাল');
  if (receiptRef) receiptRef.value = await genRno();

  await refreshVoucherRef();
  await getTenantId();
  syncSidebarRole();
  await loadVoucherSummary();
  await loadCompany();
  await loadCOA();
  renderDayControlState();
  await loadDashboard();
  initDashChart();
}
