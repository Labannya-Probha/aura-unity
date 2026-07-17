// ══════════════════════════════════════════
// COMPANY
// ══════════════════════════════════════════
async function loadCompany() {
  const { data } = await readTenantRows('company_info', (from) => from.select('setting_key,setting_value'));
  if (!data || !data.length) return;
  data.forEach(r => { S.company[r.setting_key] = r.setting_value; });
  applyCompany();
}

function applyCompany() {
  const c = S.company;
  document.getElementById('sbName').textContent = c.name || "Challengers of 90's";
  document.getElementById('sbSub').textContent  = c.sub  || 'ERP System';
  if (c.logo) {
    ['sbLogo','rcpLogo','rcpLogo2','coLogoPreview'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.backgroundImage=`url("${c.logo}")`; el.style.backgroundSize='cover'; el.textContent=''; }
    });
  }
  document.getElementById('coName').value  = c.name    || '';
  document.getElementById('coSub').value   = c.sub     || '';
  document.getElementById('coPhone').value = c.phone   || '';
  document.getElementById('coAddr').value  = c.address || '';
}

async function saveCompany() {
  const c = {
    name:    document.getElementById('coName').value.trim(),
    sub:     document.getElementById('coSub').value.trim(),
    phone:   document.getElementById('coPhone').value.trim(),
    address: document.getElementById('coAddr').value.trim(),
    logo:    S.company.logo || ''
  };
  if (!c.name) { toast('কোম্পানির নাম দিন।','warning'); return; }
  Object.assign(S.company, c);
  await getTenantId();
  if (!requireTenantForWrite()) return;
  const rows = tenantInsertPayload(Object.keys(c).map(k => ({ setting_key:k, setting_value:c[k], updated_at: new Date().toISOString() })));
  const { error } = await writeWithOptionalTenant('company_info', rows, (finalPayload) =>
    sb.from('company_info').upsert(finalPayload, { onConflict: S.tenantId ? 'tenant_id,setting_key' : 'setting_key' })
  );
  if (error) { toast('সেভ ব্যর্থ: '+error.message,'error'); return; }
  applyCompany();
  toast('কোম্পানি তথ্য সেভ হয়েছে।','success');
}

function loadLogo(ev) {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    S.company.logo = e.target.result;
    const p = document.getElementById('coLogoPreview');
    p.style.backgroundImage = `url(${e.target.result})`; p.style.backgroundSize='cover'; p.textContent='';
  };
  r.readAsDataURL(f);
}

// ══════════════════════════════════════════
// COA
// ══════════════════════════════════════════
async function loadCOA() {
  const { data, error } = await readTenantRows('coa', (from) => from.select('*').order('account_code'));
  if (error) { toast('COA লোড ব্যর্থ','error'); return; }
  S.coa = data || [];
  renderCOA(S.coa);
  populateAccSelects();
  renderDayControlState();
}

function renderCOA(rows) {
  const tb = document.getElementById('coaBody');
  if (!rows.length) { tb.innerHTML=`<tr><td colspan="5" class="td-m" style="text-align:center;padding:20px">${S.lang === 'bn' ? 'কোনো অ্যাকাউন্ট নেই' : 'No account found'}</td></tr>`; return; }
  tb.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${esc(r.account_code)}</strong></td>
      <td>${esc(r.account_name)}</td>
      <td>${esc(r.account_group||'')}</td>
      <td><span class="badge bg-gold">${esc(r.account_type||'Ledger')}</span></td>
      <td class="td-g">${fmt(r.opening_balance||0)}</td>
    </tr>`).join('');
}

function requireXLSX() {
  if (typeof XLSX === 'undefined') {
    toast(t('xlsxMissing'), 'error');
    return false;
  }
  return true;
}

function coaRowsForSheet(rows = S.coa) {
  return (rows || []).map(r => ({
    'Account Code': r.account_code || '',
    'Account Name': r.account_name || '',
    'Group': r.account_group || 'Asset',
    'Type': r.account_type || 'Ledger',
    'Opening Balance': Number(r.opening_balance || 0)
  }));
}

function downloadXLSX(filename, sheets) {
  if (!requireXLSX()) return;
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

function downloadCOATemplate() {
  downloadXLSX('coa_opening_balance_template.xlsx', {
    COA: coaRowsForSheet(S.coa.length ? S.coa : [
      { account_code:'1110', account_name:'Cash in Hand', account_group:'Asset', account_type:'Ledger', opening_balance:0 }
    ]).map(r => ({
      'Account Code': r['Account Code'],
      'Account Name': r['Account Name'],
      'Group': r.Group,
      'Type': r.Type,
      'Opening Balance': r['Opening Balance']
    }))
  });
}

function exportCOAXLSX() {
  downloadXLSX(`chart_of_accounts_${new Date().toISOString().slice(0,10)}.xlsx`, { COA: coaRowsForSheet() });
}

function readFirstSheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const wb = XLSX.read(new Uint8Array(event.target.result), { type:'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { defval:'' }));
      } catch (error) { reject(error); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function pick(row, ...keys) {
  const entries = Object.entries(row || {});
  for (const key of keys) {
    const match = entries.find(([k]) => k.trim().toLowerCase() === key.trim().toLowerCase());
    if (match) return match[1];
  }
  return '';
}

async function importCOAOpeningBalances(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !requireXLSX()) return;
  if (!canManageMasterData()) { toast(t('masterDataDenied'), 'error'); return; }
  await getTenantId();
  if (!requireTenantForWrite()) return;
  try {
    const rows = await readFirstSheet(file);
    const payload = rows.map(row => {
      const code = String(pick(row, 'Account Code', 'Code', 'account_code')).trim();
      if (!code) return null;
      return tenantInsertPayload({
        account_code: code,
        account_name: String(pick(row, 'Account Name', 'Name', 'account_name') || code).trim(),
        account_group: String(pick(row, 'Group', 'Account Group', 'account_group') || 'Asset').trim(),
        account_type: String(pick(row, 'Type', 'Account Type', 'account_type') || 'Ledger').trim(),
        opening_balance: Number(pick(row, 'Opening Balance', 'Opening', 'opening_balance') || 0)
      });
    }).filter(Boolean);
    if (!payload.length) { toast(t('validCoaMissing'), 'warning'); return; }
    const { error } = await writeWithOptionalTenant('coa', payload, (finalPayload) =>
      sb.from('coa').upsert(finalPayload, { onConflict: S.tenantId ? 'tenant_id,account_code' : 'account_code' })
    );
    if (error) { toast('COA import failed: ' + error.message, 'error'); return; }
    toast(`${payload.length} ${t('coaImported')}`, 'success');
    await loadCOA();
    await loadDashboard();
  } catch (error) {
    toast('XLSX import failed: ' + error.message, 'error');
  }
}

function populateAccSelects() {
  const opts = S.coa.map(a => `<option value="${a.account_code}">${a.account_code} — ${a.account_name}</option>`).join('');
  const vchAcc = document.getElementById('vchAcc');
  if (vchAcc) vchAcc.innerHTML = opts;
  document.getElementById('ledAcc').innerHTML = '<option value="">-- নির্বাচন করুন --</option>' + opts;
}

function showAccModal() { document.getElementById('accModal').classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

async function saveAccount() {
  const code = document.getElementById('accCode').value.trim();
  const name = document.getElementById('accName').value.trim();
  const grp  = document.getElementById('accGrp').value;
  const typ  = document.getElementById('accTyp').value;
  const op   = Number(document.getElementById('accOp').value) || 0;
  if (!code || !name) { toast('কোড ও নাম দিন।','warning'); return; }
  await getTenantId();
  if (!requireTenantForWrite()) return;
  const payload = tenantInsertPayload({ account_code:code, account_name:name, account_group:grp, account_type:typ, opening_balance:op });
  const { error } = await writeWithOptionalTenant('coa', payload, (finalPayload) =>
    sb.from('coa').upsert(finalPayload, { onConflict: S.tenantId ? 'tenant_id,account_code' : 'account_code' })
  );
  if (error) { toast('সেভ ব্যর্থ: '+error.message,'error'); return; }
  closeModal('accModal');
  toast('অ্যাকাউন্ট সেভ হয়েছে।','success');
  await loadCOA();
}

function loadCOASelect() { populateAccSelects(); }

function isUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
}

function firstUUID(...values) {
  return values.find(isUUID) || null;
}

async function resolveTenantFromMembership(userId) {
  if (!isUUID(userId)) return false;
  try {
    const tenantSlug = S.tenantSlug || getRouteTenantSlug();
    const requestedSlug = tenantSlug ? getTenantSlugCandidates(tenantSlug)[0] : null;
    const { data: rpcRows, error: rpcError } = await sb.rpc('resolve_current_tenant', { requested_slug: requestedSlug });
    const rpcTenant = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (!rpcError && rpcTenant?.tenant_id) {
      S.tenantId = rpcTenant.tenant_id;
      S.tenantSlug = rpcTenant.tenant_slug || tenantSlug || null;
      S.activeMemberRole = rpcTenant.role || 'user';
      S.tenantResolved = true;
      S.tenantResolveError = null;
      return true;
    }
    if (rpcError && rpcError.code !== '42883') {
      console.warn('[tenant] resolve_current_tenant failed:', rpcError.message);
    }

    let query = sb
      .from('tenant_members')
      .select(tenantSlug ? 'tenant_id, role, tenants!inner(slug)' : 'tenant_id, role')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('status', 'active')
      .limit(1);
    if (tenantSlug) query = query.in('tenants.slug', getTenantSlugCandidates(tenantSlug));
    const { data, error } = await query.maybeSingle();
    if (!error && data?.tenant_id) {
      S.tenantId = data.tenant_id;
      S.tenantSlug = data.tenants?.slug || tenantSlug || null;
      S.activeMemberRole = data.role || (() => { console.warn('[tenant] tenant_members role missing for user', userId); return 'user'; })();
      S.tenantResolved = true;
      S.tenantResolveError = null;
      return true;
    }
    if (error) console.warn('[tenant] tenant_members resolve failed:', error.message);
  } catch (error) {
    console.warn('[tenant] resolve failed:', error?.message || error);
  }
  return false;
}

async function getTenantId() {
  if (S.tenantResolved) return S.tenantId;
  S.tenantSlug = S.tenantSlug || getRouteTenantSlug();

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    S.session = session;
    if (!S.user) S.user = session.user;
  }

  const userId = S.user?.id || session?.user?.id;

  // Primary: resolve from tenant_members (proper multi-tenant model)
  if (await resolveTenantFromMembership(userId)) {
    return S.tenantId;
  }

  if (S.tenantSlug && isDefaultTenantSlug(S.tenantSlug)) {
    S.tenantId = '00000000-0000-0000-0000-000000000001';
    S.tenantSlug = 'challangersof90s';
    S.activeMemberRole = S.activeMemberRole || 'owner';
    S.tenantResolved = true;
    S.tenantResolveError = null;
    return S.tenantId;
  }

  if (S.tenantSlug) {
    S.tenantResolved = true;
    S.tenantResolveError = `No active tenant membership found for "${S.tenantSlug}".`;
    return null;
  }

  // Legacy fallback: check user metadata and users table (transition compatibility)
  const metaTenant = firstUUID(
    S.user?.tenant_id,
    S.user?.app_metadata?.tenant_id,
    S.user?.user_metadata?.tenant_id,
    session?.user?.app_metadata?.tenant_id,
    session?.user?.user_metadata?.tenant_id
  );
  if (metaTenant) {
    S.tenantId = metaTenant;
    S.tenantResolved = true;
    S.tenantResolveError = null;
    return S.tenantId;
  }

  const email = S.user?.email || session?.user?.email;
  if (email) {
    const { data: userRow } = await sb.from('users').select('tenant_id').eq('email', email).limit(1).maybeSingle();
    if (isUUID(userRow?.tenant_id)) {
      S.tenantId = userRow.tenant_id;
      S.tenantResolved = true;
      S.tenantResolveError = null;
      return S.tenantId;
    }
  }

  // Do NOT fall back to auth.users.id as tenant_id per multi-tenant requirements
  S.tenantResolved = true;
  S.tenantResolveError = 'No tenant assigned to this user.';
  return S.tenantId; // may be null
}

function hasTenantIdColumnError(error) {
  const msg = String(error?.message || '');
  return error?.code === 'PGRST204' && /\btenant_id\b/i.test(msg);
}

function removeTenantId(payload) {
  if (Array.isArray(payload)) {
    return payload.map(({ tenant_id, ...rest }) => rest);
  }
  if (payload && typeof payload === 'object') {
    const { tenant_id, ...rest } = payload;
    return rest;
  }
  return payload;
}

async function writeWithOptionalTenant(table, payload, executor) {
  const canRetryWithoutTenant =
    S.tenantColumnSupport[table] !== false &&
    (Array.isArray(payload)
      ? payload.some((item) => item && item.tenant_id != null)
      : payload && payload.tenant_id != null);

  let result = await executor(payload);
  if (canRetryWithoutTenant && hasTenantIdColumnError(result?.error)) {
    // Cache per-table fallback so tables without tenant_id do not trigger the same failed write twice.
    S.tenantColumnSupport[table] = false;
    result = await executor(removeTenantId(payload));
  }
  return result;
}

async function readTenantRows(table, buildQuery) {
  const tenantId = await getTenantId();

  if (tenantId && S.tenantColumnSupport[table] !== false) {
    const scoped = await buildQuery(sb.from(table)).eq('tenant_id', tenantId);
    if (!hasTenantIdColumnError(scoped.error)) return scoped;
    S.tenantColumnSupport[table] = false;
  }

  if (S.tenantSlug && !tenantId) {
    if (!S.tenantWarningShown) {
      S.tenantWarningShown = true;
      toast(S.tenantResolveError || 'Tenant context resolve হয়নি।', 'error');
    }
    return { data: [], count: 0, error: { message: S.tenantResolveError || 'Tenant context missing' } };
  }

  return buildQuery(sb.from(table));
}

function tenantInsertPayload(payload) {
  if (!S.tenantId) return payload;
  if (Array.isArray(payload)) return payload.map((item) => ({ ...item, tenant_id: S.tenantId }));
  return { ...payload, tenant_id: S.tenantId };
}

function requireTenantForWrite() {
  if (S.tenantSlug && !S.tenantId) {
    toast(S.tenantResolveError || 'Tenant resolve হয়নি, তাই save করা যাবে না।', 'error');
    return false;
  }
  return true;
}

