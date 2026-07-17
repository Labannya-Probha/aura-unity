// ══════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════
async function loadDashboard() {
  const [{ count: colCount }, { count: vchCount }, { count: jCount }, colData] = await Promise.all([
    readTenantRows('collections', (from) => from.select('*', { count:'exact', head:true })),
    readTenantRows('vouchers', (from) => from.select('*', { count:'exact', head:true })),
    readTenantRows('journals', (from) => from.select('*', { count:'exact', head:true })),
    readTenantRows('collections', (from) => from.select('amount'))
  ]);
  const totalCol = (colData.data || []).reduce((s,r) => s + Number(r.amount||0), 0);
  document.getElementById('statCollection').textContent = fmt(totalCol);
  document.getElementById('statVoucher').textContent    = vchCount || 0;
  document.getElementById('statJournal').textContent    = jCount   || 0;
  document.getElementById('statCash').textContent       = fmt(totalCol);
}

