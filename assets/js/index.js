// ══════════════════════════════════════════
// RECEIPT
// ══════════════════════════════════════════
var sigState = { drawing:false, dataUrl:null };

function initSignaturePad() {
  const canvas = document.getElementById('sigCanvas');
  if (!canvas || canvas._sigInit) return;
  canvas._sigInit = true;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle='#0F1F3D'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.lineJoin='round';
  function getPos(e) {
    const r = canvas.getBoundingClientRect(), src = e.touches?e.touches[0]:e;
    return { x:(src.clientX-r.left)*(canvas.width/r.width), y:(src.clientY-r.top)*(canvas.height/r.height) };
  }
  function start(e){e.preventDefault();sigState.drawing=true;const p=getPos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);}
  function draw(e){e.preventDefault();if(!sigState.drawing)return;const p=getPos(e);ctx.lineTo(p.x,p.y);ctx.stroke();}
  function stop(){sigState.drawing=false;sigState.dataUrl=canvas.toDataURL();}
  canvas.addEventListener('mousedown',start); canvas.addEventListener('mousemove',draw);
  canvas.addEventListener('mouseup',stop); canvas.addEventListener('mouseleave',stop);
  canvas.addEventListener('touchstart',start,{passive:false}); canvas.addEventListener('touchmove',draw,{passive:false});
  canvas.addEventListener('touchend',stop);
}

function clearSignature() {
  const c=document.getElementById('sigCanvas'); if(!c)return;
  c.getContext('2d').clearRect(0,0,c.width,c.height); sigState.dataUrl=null;
  ['sigImg1Auth','sigImg2Auth'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='';});
}

function applySignature() {
  if (!sigState.dataUrl) return;
  ['sigImg1Auth','sigImg2Auth'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.innerHTML=`<img src="${sigState.dataUrl}" style="height:30px;max-width:90px;object-fit:contain">`;
  });
}

function genReceiptPreview() {
  const draft = getReceiptDraft();
  const frame = document.getElementById('receiptFrame');
  if (!frame) return;
  const url = `money-receipt.html?receipt_no=${encodeURIComponent(draft.rno)}&payer=${encodeURIComponent(draft.name)}&amount=${draft.amount}&mode=${encodeURIComponent(draft.mode)}&head=${encodeURIComponent(draft.head)}&description=${encodeURIComponent(draft.desc)}&lang=${S.lang}`;
  frame.src = url;
}

function printReceipt() {
  const draft = getReceiptDraft();
  const url = `money-receipt.html?receipt_no=${encodeURIComponent(draft.rno)}&payer=${encodeURIComponent(draft.name)}&amount=${draft.amount}&mode=${encodeURIComponent(draft.mode)}&head=${encodeURIComponent(draft.head)}&description=${encodeURIComponent(draft.desc)}&lang=${S.lang}`;
  window.open(url, '_blank');
}

async function printCollectionReceipt(receiptNo) {
  window.open(`money-receipt.html?receipt_no=${encodeURIComponent(receiptNo)}&lang=${S.lang}`, '_blank');
}

// ══════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════
var charts={};
function initDashChart() {
  const ctx=document.getElementById('dashChart'); if(!ctx)return;
  if(charts.d) charts.d.destroy();
  charts.d=new Chart(ctx,{type:'bar',data:{labels:['কালেকশন','ভাউচার','জার্নাল','ব্যালেন্স'],datasets:[{data:[0,0,0,0],backgroundColor:['rgba(212,160,23,.85)','rgba(26,122,74,.85)','rgba(21,88,176,.85)','rgba(192,57,43,.75)'],borderRadius:8,borderSkipped:false}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>'৳'+Number(v).toLocaleString()},grid:{color:'rgba(0,0,0,.04)'}},x:{grid:{display:false}}}}});
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function fmt(n) { return '৳ '+Number(n||0).toLocaleString('en-IN'); }

// ══════════════════════════════════════════
// USER MANAGEMENT
// ══════════════════════════════════════════

// Password visibility toggle
function togglePassVis() {
  const inp = document.getElementById('nuPass');
  const btn = document.getElementById('passToggle');
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}

// Password strength checker
function checkPassStrength(val) {
  const bar   = document.getElementById('passStrengthBar');
  const label = document.getElementById('passStrengthLabel');
  if (!val) { bar.style.width='0%'; label.textContent=''; return; }
  let score = 0;
  if (val.length >= 8)  score++;
  if (val.length >= 12) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const levels = [
    { pct:'20%', color:'#C0392B', text:'খুব দুর্বল' },
    { pct:'40%', color:'#E67E22', text:'দুর্বল' },
    { pct:'60%', color:'#F1C40F', text:'মাঝারি' },
    { pct:'80%', color:'#27AE60', text:'শক্তিশালী' },
    { pct:'100%',color:'#1A7A4A', text:'খুব শক্তিশালী ✅' },
  ];
  const l = levels[Math.min(score, 4)];
  bar.style.width  = l.pct;
  bar.style.background = l.color;
  label.style.color    = l.color;
  label.textContent    = l.text;
}

// Map UI role labels to tenant_members DB role values
function mapUiRoleToDbRole(uiRole) {
  const r = String(uiRole || '').toLowerCase();
  if (r.includes('super')) return 'superuser';
  if (r.includes('admin') || r.includes('manager')) return 'manager';
  return 'user';
}

// Add user via Edge Function
async function addUser() {
  const username = document.getElementById('nuName').value.trim().toLowerCase().replace(/\s+/g, '');
  const role     = document.getElementById('nuRole').value;
  const password = document.getElementById('nuPass').value;
  const errEl    = document.getElementById('userAddErr');
  const okEl     = document.getElementById('userAddOk');
  const btn      = document.getElementById('addUserBtn');

  errEl.classList.add('hidden'); okEl.classList.add('hidden');

  if (!username) { errEl.textContent='ইউজারনেম দিন।'; errEl.classList.remove('hidden'); return; }
  if (password.length < 8) { errEl.textContent='পাসওয়ার্ড কমপক্ষে ৮ অক্ষর হতে হবে।'; errEl.classList.remove('hidden'); return; }

  btn.disabled = true; btn.textContent = '⏳ যোগ হচ্ছে...';

  try {
    // Get current session token
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token || SUPA_ANON;

    const res = await fetch(`${SUPA_URL}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_ANON,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ username, password, role, ...(S.tenantId ? { tenant_id: S.tenantId } : {}) }),
    });

    const data = await res.json();
    btn.disabled = false;
    btn.innerHTML = '＋ <span>ইউজার যোগ করুন</span>';

    if (!data.ok) {
      errEl.textContent = data.message || 'ইউজার যোগ ব্যর্থ।';
      errEl.classList.remove('hidden');
      return;
    }

    // Add new user to the current tenant as a member
    if (data.user?.id && S.tenantId) {
      const dbRole = mapUiRoleToDbRole(role);
      const { error: memberErr } = await sb.from('tenant_members').insert({
        tenant_id: S.tenantId,
        user_id: data.user.id,
        role: dbRole,
        status: 'active',
        is_active: true
      });
      if (memberErr) {
        console.warn('tenant_members insert failed:', memberErr.message);
      }
    }

    okEl.textContent = `✅ "${username}" সফলভাবে যোগ হয়েছে! Email: ${data.user.email}`;
    okEl.classList.remove('hidden');

    // Reset form
    document.getElementById('nuName').value = '';
    document.getElementById('nuPass').value = '';
    document.getElementById('nuRole').value = 'user';
    syncRoleInputOptions();
    document.getElementById('passStrengthBar').style.width = '0%';
    document.getElementById('passStrengthLabel').textContent = '';

    toast(`ইউজার "${username}" যোগ হয়েছে।`, 'success');
    await loadUsers();

  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '＋ <span>ইউজার যোগ করুন</span>';
    errEl.textContent = 'সংযোগ ব্যর্থ: ' + e.message;
    errEl.classList.remove('hidden');
  }
}
// Load user list — tenant-scoped when tenant is resolved, falls back to public.users
async function loadUsers() {
  const tb = document.getElementById('userTable');
  tb.innerHTML = `<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">${esc(t('loading'))}</td></tr>`;

  // When tenant is resolved, show tenant-scoped app users directly. The
  // tenant_members.user_id column points at auth.users, so PostgREST cannot
  // embed public.users from that relationship.
  if (S.tenantId) {
    const [{ data, error }, memberRes] = await Promise.all([
      sb
      .from('users')
      .select('id, username, email, created_at')
      .eq('tenant_id', S.tenantId)
      .order('created_at', { ascending: false }),
      sb.from('tenant_members').select('user_id, role, status, is_active, created_at').eq('tenant_id', S.tenantId)
    ]);

    if (error || !data?.length) {
      tb.innerHTML = `<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">${esc(t('noUser'))}</td></tr>`;
      return;
    }

    const memberByUserId = (memberRes.data || []).reduce((acc, row) => {
      acc[row.user_id] = row;
      return acc;
    }, {});
    tb.innerHTML = data.map(u => {
      const uname     = u.username || u.email?.split('@')[0] || '—';
      const member    = memberByUserId[u.id] || {};
      const roleValue = normalizeRole(member.role || (uname.toLowerCase() === 'superuser' ? 'owner' : 'user'));
      const roleLabel = roleText(roleValue);
      const badgeCls  = roleBadge(roleValue);
      const date      = u.created_at ? u.created_at.slice(0,10) : '—';
      const roleControl = canManageUsers()
        ? `<select class="form-control" style="min-width:130px" onchange="updateUserRole('${esc(u.id)}', this.value)" ${roleValue === 'superuser' && uname.toLowerCase() === 'superuser' ? 'disabled' : ''}>
            ${['superuser','manager','user'].map(role => `<option value="${role}" ${role===roleValue?'selected':''}>${esc(roleText(role))}</option>`).join('')}
          </select>`
        : `<span class="badge ${badgeCls}">${esc(roleLabel)}</span>`;
      return `<tr>
        <td><strong>${esc(uname)}</strong></td>
        <td class="td-m">${esc(u.email || '—')}</td>
        <td>${roleControl}</td>
        <td class="td-m">${esc(date)}</td>
        <td><span class="badge bg-green">${esc(t('active'))}</span></td>
        <td><span class="td-m">${esc(canManageUsers() ? t('roleBasedAccess') : t('readOnly'))}</span></td>
      </tr>`;
    }).join('');
    return;
  }

  // Pre-migration fallback: load from public.users
  const { data, error } = await sb
    .from('users')
    .select('id, username, email, created_at')
    .order('created_at', { ascending: false });

  if (error || !data?.length) {
    tb.innerHTML = `<tr><td colspan="6" class="td-m" style="text-align:center;padding:20px">${esc(t('noUser'))}</td></tr>`;
    return;
  }

  const roleMap = { 'superuser': 'Super User' };
  tb.innerHTML = data.map(u => {
    const uname = u.username || u.email?.split('@')[0] || '—';
    const role  = roleMap[uname.toLowerCase()] || 'ইউজার';
    const badgeCls = role === 'Super User' ? 'bg-gold' : role === 'ম্যানেজার' ? 'bg-navy' : 'bg-green';
    const date  = u.created_at ? u.created_at.slice(0,10) : '—';
    return `<tr>
      <td><strong>${esc(uname)}</strong></td>
      <td class="td-m">${esc(u.email || '—')}</td>
      <td><span class="badge ${badgeCls}">${esc(role)}</span></td>
      <td class="td-m">${esc(date)}</td>
      <td><span class="badge bg-green">${esc(t('active'))}</span></td>
      <td><span class="td-m">${esc(t('tenantRequired'))}</span></td>
    </tr>`;
  }).join('');
}

async function updateUserRole(userId, role) {
  if (!canManageUsers()) { toast(t('roleUpdateDenied'), 'error'); return; }
  if (!S.tenantId) { toast(t('tenantNotResolved'), 'error'); return; }
  const normalized = normalizeRole(role);
  const { error } = await sb
    .from('tenant_members')
    .upsert({ tenant_id: S.tenantId, user_id: userId, role: normalized, status: 'active', is_active: true }, { onConflict:'tenant_id,user_id' });
  if (error) { toast('Role update failed: ' + error.message, 'error'); await loadUsers(); return; }
  toast(t('roleUpdated'), 'success');
  await loadUsers();
}

// ══════════════════════════════════════════
// AUTH STATE CHANGE — auto-restore session
// ══════════════════════════════════════════
sb.auth.onAuthStateChange(async (event, session) => {
  if (event==='SIGNED_IN' && session) {
    S.user=session.user; S.session=session; S.tenantId=null; S.tenantSlug=getRouteTenantSlug(); S.tenantResolved=false; S.welcomeShown=false; S.activeMemberRole=null;
    // Already handled by login()
  }
});

// ══════════════════════════════════════════
// DOM READY
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  setLang(localStorage.getItem('aura_lang') || 'en');

  (async () => {
    document.getElementById('colRno').value = await genRno();
    genReceiptPreview();
  })();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch((e) => console.debug('[SW] Unregister failed:', e));
  }

  // Check existing session
  sb.auth.getSession().then(async ({ data:{ session } }) => {
    if (session) {
      S.user = session.user; S.session = session; S.tenantSlug = getRouteTenantSlug(); S.welcomeShown = false;
      document.getElementById('loginModal').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      document.getElementById('mobBottomNav').classList.remove('hidden');
      // Username display only — tenant and role are resolved inside initApp via getTenantId
      const { data: pub } = await sb.from('users').select('username').eq('email', session.user.email).limit(1).maybeSingle();
      document.getElementById('sbUname').textContent = pub?.username || session.user.email?.split('@')[0] || 'user';
      _resetIdleTimer();
      await initApp();
      showWelcomePopover(pub?.username || session.user.email?.split('@')[0] || 'user');
    }
  });
});
