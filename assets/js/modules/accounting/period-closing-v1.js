/* Aura Unity Phase 3 — Period Closing & Controls v1 */
(function(){
  'use strict';
  const state={years:[],periods:[],selectedYear:null,selectedPeriod:null,checklist:[]};
  const el=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=d=>d?new Date(`${String(d).slice(0,10)}T00:00:00`).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
  const tenant=()=>window.S?.tenantId||null;
  const toast=(msg,type='success')=>typeof showToast==='function'?showToast(msg,type):alert(msg);
  async function scoped(table,select='*'){
    let q=sb.from(table).select(select);
    if(tenant())q=q.eq('tenant_id',tenant());
    return q;
  }
  async function load(){
    if(!tenant()){toast('Tenant is not resolved. Please sign in again.','error');return;}
    el('pcPeriodsBody').innerHTML='<tr><td colspan="5" style="text-align:center;padding:28px">Loading periods...</td></tr>';
    const {data,error}=await scoped('fiscal_years').order('start_date',{ascending:false});
    if(error){renderError(error);return;}
    state.years=data||[];
    renderYears();
    if(state.years.length){await selectYear(state.selectedYear?.id||state.years[0].id);} else renderEmptyYear();
  }
  function renderError(error){
    console.error(error);el('pcPeriodsBody').innerHTML=`<tr><td colspan="5" style="text-align:center;padding:28px;color:#b42318">${esc(error.message||'Unable to load period controls')}</td></tr>`;
  }
  function renderYears(){
    const s=el('pcFiscalYear');
    s.innerHTML=state.years.map(y=>`<option value="${esc(y.id)}">${esc(y.name||`${fmt(y.start_date)} – ${fmt(y.end_date)}`)}</option>`).join('');
  }
  function renderEmptyYear(){
    el('pcFiscalYear').innerHTML='<option>No fiscal year</option>';
    el('pcPeriodsBody').innerHTML='<tr><td colspan="5" style="text-align:center;padding:28px">No fiscal year found. Run the Phase 3 migration first.</td></tr>';
    updateKpis();
  }
  async function selectYear(id){
    state.selectedYear=state.years.find(y=>y.id===id)||state.years[0]||null;
    if(!state.selectedYear)return;
    el('pcFiscalYear').value=state.selectedYear.id;
    let q=sb.from('accounting_periods').select('*').eq('fiscal_year_id',state.selectedYear.id).order('start_date');
    if(tenant())q=q.eq('tenant_id',tenant());
    const {data,error}=await q;
    if(error){renderError(error);return;}
    state.periods=data||[];
    state.selectedPeriod=state.periods.find(p=>p.id===state.selectedPeriod?.id)||state.periods.find(p=>containsToday(p))||state.periods[0]||null;
    renderPeriods();updateKpis();
    if(state.selectedPeriod)await selectPeriod(state.selectedPeriod.id); else clearPeriodPanels();
  }
  function containsToday(p){const t=new Date().toISOString().slice(0,10);return p.start_date<=t&&p.end_date>=t;}
  function statusOf(p){return String(p.status||p.close_status||'open').toLowerCase();}
  function statusLabel(s){return ({open:'Open',soft_closed:'Soft Closed',hard_closed:'Hard Closed'})[s]||s.replaceAll('_',' ');}
  function renderPeriods(){
    const body=el('pcPeriodsBody');
    if(!state.periods.length){body.innerHTML='<tr><td colspan="5" style="text-align:center;padding:28px">No accounting periods found.</td></tr>';return;}
    body.innerHTML=state.periods.map((p,i)=>{const st=statusOf(p);const active=state.selectedPeriod?.id===p.id;return `<tr onclick="PeriodClosingV1.selectPeriod('${p.id}')" style="cursor:pointer;${active?'background:#f4f7fb':''}">
      <td><div class="pc-period-name">${esc(p.name||new Date(`${p.start_date}T00:00:00`).toLocaleString('en',{month:'long',year:'numeric'}))}</div><div class="pc-period-no">Period ${String(i+1).padStart(2,'0')}</div></td>
      <td>${fmt(p.start_date)} – ${fmt(p.end_date)}</td><td><span class="pc-status ${st}">${statusLabel(st)}</span></td>
      <td>${esc(p.closed_by_name||p.closed_by||'—')}<div class="pc-period-no">${p.closed_at?new Date(p.closed_at).toLocaleString('en-GB'):'—'}</div></td>
      <td><div class="pc-actions">${actionButtons(p)}</div></td></tr>`}).join('');
  }
  function actionButtons(p){const st=statusOf(p);const id=p.id; if(st==='open')return `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();PeriodClosingV1.changeStatus('${id}','soft_closed')">Soft Close</button><button class="btn btn-primary btn-sm" onclick="event.stopPropagation();PeriodClosingV1.changeStatus('${id}','hard_closed')">Hard Close</button>`; if(st==='soft_closed')return `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();PeriodClosingV1.changeStatus('${id}','open')">Reopen</button><button class="btn btn-primary btn-sm" onclick="event.stopPropagation();PeriodClosingV1.changeStatus('${id}','hard_closed')">Hard Close</button>`; return `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();PeriodClosingV1.requestReopen('${id}')">Request Reopen</button>`;}
  async function selectPeriod(id){state.selectedPeriod=state.periods.find(p=>p.id===id)||null;renderPeriods();updateKpis();await Promise.all([loadChecklist(),loadHistory(),validateSelected(false)]);}
  function updateKpis(){const y=state.selectedYear,p=state.selectedPeriod;el('pcKpiYear').textContent=y?.name||'—';el('pcKpiYearStatus').textContent=y?`${fmt(y.start_date)} – ${fmt(y.end_date)}`:'Not loaded';el('pcKpiPeriod').textContent=p?.name||'—';el('pcKpiPeriodStatus').textContent=p?statusLabel(statusOf(p)):'Not loaded';el('pcKpiOpen').textContent=state.periods.filter(x=>statusOf(x)==='open').length;const done=state.checklist.filter(x=>x.is_completed).length;const pct=state.checklist.length?Math.round(done/state.checklist.length*100):0;el('pcKpiChecklist').textContent=`${pct}%`;}
  async function loadChecklist(){
    if(!state.selectedPeriod)return;
    let q=sb.from('period_close_checklists').select('*').eq('period_id',state.selectedPeriod.id).order('sort_order');if(tenant())q=q.eq('tenant_id',tenant());
    const {data,error}=await q;if(error){el('pcChecklist').innerHTML=`<div class="pc-empty">${esc(error.message)}</div>`;return;}state.checklist=data||[];renderChecklist();updateKpis();
  }
  function renderChecklist(){const box=el('pcChecklist'),done=state.checklist.filter(x=>x.is_completed).length,pct=state.checklist.length?Math.round(done/state.checklist.length*100):0;el('pcChecklistBadge').className=`pc-badge ${pct===100?'ok':pct?'warn':'neutral'}`;el('pcChecklistBadge').textContent=`${done}/${state.checklist.length} completed`;if(!state.checklist.length){box.innerHTML='<div class="pc-empty">No checklist items found.</div>';return;}box.innerHTML=state.checklist.map(x=>`<label class="pc-check-item"><input type="checkbox" ${x.is_completed?'checked':''} onchange="PeriodClosingV1.toggleChecklist('${x.id}',this.checked)"><div><div class="pc-check-title">${esc(x.task_name)}</div><div class="pc-check-note">${esc(x.description||'')}</div></div><span class="pc-check-state">${x.is_completed?'DONE':'PENDING'}</span></label>`).join('');}
  async function toggleChecklist(id,checked){const payload={is_completed:checked,completed_at:checked?new Date().toISOString():null};const {error}=await sb.from('period_close_checklists').update(payload).eq('id',id);if(error){toast(error.message,'error');await loadChecklist();return;}await loadChecklist();}
  async function validateSelected(show=true){if(!state.selectedPeriod)return;const {data,error}=await sb.rpc('validate_accounting_period_close',{p_period_id:state.selectedPeriod.id});if(error){el('pcValidation').innerHTML=`<div class="pc-empty" style="color:#b42318">${esc(error.message)}</div>`;return null;}const rows=Array.isArray(data)?data:(data?.checks||[]);el('pcValidation').innerHTML=(rows.length?rows:[{check_name:'Period validation',result:'PASS',details:'No blocking issues found'}]).map(r=>{const result=String(r.result||r.status||'PASS').toUpperCase();const cls=result==='PASS'?'ok':result==='WARN'?'warn':'bad';return `<div class="pc-validation-row"><div><strong>${esc(r.check_name||r.name)}</strong><div class="pc-check-note">${esc(r.details||r.message||'')}</div></div><span class="${cls}">${esc(result)}</span></div>`}).join('');if(show)toast('Period validation completed.');return rows;}
  async function loadHistory(){let q=sb.from('period_close_history').select('*').eq('period_id',state.selectedPeriod.id).order('created_at',{ascending:false}).limit(20);if(tenant())q=q.eq('tenant_id',tenant());const {data,error}=await q;if(error){el('pcHistory').innerHTML=`<div class="pc-empty">${esc(error.message)}</div>`;return;}el('pcHistory').innerHTML=(data||[]).length?(data||[]).map(x=>`<div class="pc-history-item"><strong>${esc(statusLabel(x.from_status||'—'))} → ${esc(statusLabel(x.to_status||'—'))}</strong><small>${esc(x.action||'Status changed')} · ${new Date(x.created_at).toLocaleString('en-GB')}</small><small>${esc(x.reason||'No reason supplied')}</small></div>`).join(''):'<div class="pc-empty">No closing history yet.</div>';}
  async function changeStatus(id,toStatus){const p=state.periods.find(x=>x.id===id);if(!p)return;const reason=toStatus==='open'?prompt('Reason for reopening this period:'):prompt(`Reason for ${statusLabel(toStatus).toLowerCase()}:`,'Month-end controls completed');if(reason===null)return;if(toStatus==='hard_closed'){const checks=await validateSelected(false);const failed=(checks||[]).some(x=>['FAIL','BLOCKED'].includes(String(x.result||x.status).toUpperCase()));if(failed){toast('Hard close blocked by validation errors.','error');return;}const incomplete=state.checklist.some(x=>!x.is_completed);if(incomplete&&!confirm('Checklist is incomplete. Continue with hard close?'))return;}
    const {error}=await sb.rpc('change_accounting_period_status',{p_period_id:id,p_to_status:toStatus,p_reason:reason||null});if(error){toast(error.message,'error');return;}toast(`Period changed to ${statusLabel(toStatus)}.`);await selectYear(state.selectedYear.id);}
  async function requestReopen(id){const reason=prompt('Enter the reason for reopening this hard-closed period:');if(!reason)return;const {error}=await sb.rpc('request_accounting_period_reopen',{p_period_id:id,p_reason:reason});if(error){toast(error.message,'error');return;}toast('Reopen request submitted for approval.');await loadHistory();}
  function clearPeriodPanels(){el('pcChecklist').innerHTML='<div class="pc-empty">No period selected.</div>';el('pcValidation').innerHTML='<div class="pc-empty">No period selected.</div>';el('pcHistory').innerHTML='<div class="pc-empty">No period selected.</div>';}
  window.PeriodClosingV1={load,refresh:load,selectYear,selectPeriod,toggleChecklist,validateSelected,changeStatus,requestReopen};
})();
