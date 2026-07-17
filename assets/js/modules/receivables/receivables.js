(function(){
  'use strict';
  const state={customers:[],invoices:[]};
  const el=id=>document.getElementById(id);
  const money=v=>`৳ ${Number(v||0).toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const safe=v=>typeof esc==='function'?esc(v):String(v??'');
  const notify=(m,t='success')=>typeof toast==='function'?toast(m,t):alert(m);

  function ensureUI(){
    if(el('receivables')) return;
    const content=document.querySelector('.content');
    if(!content) return;
    const section=document.createElement('div'); section.id='receivables'; section.className='module';
    section.innerHTML=`
      <div class="ar-kpis">
        <div class="stat-card sc-gold"><div class="stat-label">Total Receivable</div><div id="arKpiOutstanding" class="stat-value">৳ 0.00</div><div class="stat-note">Posted invoices</div></div>
        <div class="stat-card sc-info"><div class="stat-label">Overdue</div><div id="arKpiOverdue" class="stat-value">৳ 0.00</div><div class="stat-note">Past due date</div></div>
        <div class="stat-card sc-em"><div class="stat-label">Active Customers</div><div id="arKpiCustomers" class="stat-value">0</div><div class="stat-note">Member/customer master</div></div>
        <div class="stat-card sc-navy"><div class="stat-label">Draft Invoices</div><div id="arKpiDraft" class="stat-value">0</div><div class="stat-note">Pending workflow</div></div>
      </div>
      <div class="ar-grid">
        <div class="card"><div class="card-header"><div><div class="card-title">Customer / Member Master</div><div class="card-sub">Create tenant-specific receivable accounts</div></div><button class="btn btn-gold btn-sm" onclick="ReceivablesV1.newCustomer()">+ New</button></div>
          <div class="card-body np"><div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Phone</th><th>Opening</th><th>Status</th></tr></thead><tbody id="arCustomerBody"></tbody></table></div></div></div>
        <div class="card"><div class="card-header"><div><div class="card-title">Invoice / Demand Entry</div><div class="card-sub">Phase 4A foundation</div></div><span class="badge bg-purple">AR</span></div>
          <div class="card-body"><div class="form-row-2">
            <div class="form-group"><label class="form-label">Customer</label><select id="arInvoiceCustomer" class="form-control"></select></div>
            <div class="form-group"><label class="form-label">Type</label><select id="arInvoiceType" class="form-control"><option value="invoice">Invoice</option><option value="demand">Demand</option><option value="subscription">Subscription</option><option value="opening">Opening</option></select></div>
            <div class="form-group"><label class="form-label">Invoice Date</label><input id="arInvoiceDate" type="date" class="form-control"></div>
            <div class="form-group"><label class="form-label">Due Date</label><input id="arDueDate" type="date" class="form-control"></div>
          </div>
          <div class="form-group"><label class="form-label">Description</label><input id="arDescription" class="form-control" placeholder="Monthly subscription / service charge"></div>
          <div class="form-row-2"><div class="form-group"><label class="form-label">Quantity</label><input id="arQty" type="number" min="0" step="0.01" value="1" class="form-control" oninput="ReceivablesV1.recalc()"></div><div class="form-group"><label class="form-label">Rate</label><input id="arRate" type="number" min="0" step="0.01" value="0" class="form-control" oninput="ReceivablesV1.recalc()"></div></div>
          <div class="ar-total"><span>Total</span><strong id="arTotal">৳ 0.00</strong></div>
          <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn btn-gold" onclick="ReceivablesV1.saveInvoice()">Save Draft Invoice</button></div></div></div>
      </div>
      <div class="card"><div class="card-header"><div><div class="card-title">Outstanding Invoice Ledger</div><div class="card-sub">Draft, posted and settled receivables</div></div><button class="btn btn-ghost btn-sm" onclick="ReceivablesV1.load()">Refresh</button></div>
        <div class="card-body np"><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Due</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody id="arInvoiceBody"></tbody></table></div></div></div>`;
    content.appendChild(section);
    const today=new Date().toISOString().slice(0,10); el('arInvoiceDate').value=today; const d=new Date(); d.setDate(d.getDate()+30); el('arDueDate').value=d.toISOString().slice(0,10);
  }
  function ensureNav(){
    if(document.querySelector('.nav-item[data-module="receivables"]')) return;
    const reports=document.querySelector('.nav-item[data-module="reports"]');
    if(!reports) return;
    const nav=document.createElement('div'); nav.className='nav-item'; nav.dataset.module='receivables'; nav.innerHTML='<span class="nav-icon">◎</span><span data-bn="প্রাপ্য হিসাব" data-en="Receivables">Receivables</span>';
    reports.parentNode.insertBefore(nav,reports);
    nav.addEventListener('click',()=>{openModule('receivables');closeMobSidebar();});
  }
  async function load(){
    ensureUI(); ensureNav();
    if(!window.receivableService) return;
    const [cRes,iRes]=await Promise.all([receivableService.customers(),receivableService.invoices()]);
    if(cRes.error){notify(cRes.error.message,'error');return;} if(iRes.error){notify(iRes.error.message,'error');return;}
    state.customers=cRes.data||[]; state.invoices=iRes.data||[]; render();
  }
  function render(){
    el('arCustomerBody').innerHTML=state.customers.length?state.customers.map(c=>`<tr><td><strong>${safe(c.customer_code)}</strong></td><td>${safe(c.name)}</td><td>${safe(c.customer_type)}</td><td>${safe(c.phone||'—')}</td><td>${money(c.opening_balance)}</td><td><span class="badge ${c.status==='active'?'bg-green':'bg-danger'}">${safe(c.status)}</span></td></tr>`).join(''):'<tr><td colspan="6" style="text-align:center;padding:24px">No customers found.</td></tr>';
    el('arInvoiceCustomer').innerHTML='<option value="">Select customer</option>'+state.customers.filter(c=>c.status==='active').map(c=>`<option value="${c.id}">${safe(c.customer_code)} — ${safe(c.name)}</option>`).join('');
    el('arInvoiceBody').innerHTML=state.invoices.length?state.invoices.map(i=>`<tr><td><strong>${safe(i.invoice_no)}</strong></td><td>${safe(i.invoice_date)}</td><td>${safe(i.ar_customers?.name||'—')}</td><td>${safe(i.due_date)}</td><td>${money(i.total_amount)}</td><td>${money(i.paid_amount)}</td><td><strong>${money(i.balance_amount)}</strong></td><td><span class="badge ${i.status==='paid'?'bg-green':i.status==='draft'?'bg-gold':'bg-navy'}">${safe(i.status)}</span></td></tr>`).join(''):'<tr><td colspan="8" style="text-align:center;padding:24px">No invoices found.</td></tr>';
    const posted=state.invoices.filter(i=>['posted','partially_paid','paid'].includes(i.status));
    const outstanding=posted.reduce((s,i)=>s+Number(i.balance_amount||0),0), overdue=posted.filter(i=>i.balance_amount>0&&i.due_date<new Date().toISOString().slice(0,10)).reduce((s,i)=>s+Number(i.balance_amount||0),0);
    el('arKpiOutstanding').textContent=money(outstanding); el('arKpiOverdue').textContent=money(overdue); el('arKpiCustomers').textContent=state.customers.filter(c=>c.status==='active').length; el('arKpiDraft').textContent=state.invoices.filter(i=>i.status==='draft').length;
  }
  async function newCustomer(){
    const name=prompt('Customer / member name:'); if(!name) return; const phone=prompt('Phone (optional):','')||''; const type=prompt('Type: member, customer, donor, sponsor','member')||'member';
    try{const code=await receivableService.nextCustomerCode();const {error}=await receivableService.createCustomer({customer_code:code,name:name.trim(),phone:phone.trim(),customer_type:type.trim().toLowerCase(),status:'active'});if(error)throw error;notify('Customer created.');await load();}catch(e){notify(e.message||String(e),'error');}
  }
  function recalc(){const total=Number(el('arQty')?.value||0)*Number(el('arRate')?.value||0);if(el('arTotal'))el('arTotal').textContent=money(total);return total;}
  async function saveInvoice(){
    const customerId=el('arInvoiceCustomer').value, description=el('arDescription').value.trim(), total=recalc(); if(!customerId||!description||total<=0){notify('Customer, description and positive amount are required.','error');return;}
    try{const type=el('arInvoiceType').value,invoiceNo=await receivableService.nextInvoiceNo(type);const header={customer_id:customerId,invoice_no:invoiceNo,invoice_date:el('arInvoiceDate').value,due_date:el('arDueDate').value,invoice_type:type,description,subtotal:total,total_amount:total,status:'draft'};const line={description,quantity:Number(el('arQty').value||1),unit_rate:Number(el('arRate').value||0)};const {error}=await receivableService.createInvoice(header,line);if(error)throw error;notify(`Draft invoice ${invoiceNo} created.`);el('arDescription').value='';el('arRate').value='0';recalc();await load();}catch(e){notify(e.message||String(e),'error');}
  }
  document.addEventListener('DOMContentLoaded',()=>{ensureUI();ensureNav();if(window.TT){TT.en.receivables='Receivables';TT.bn.receivables='প্রাপ্য হিসাব';}});
  window.ReceivablesV1={load,newCustomer,recalc,saveInvoice};
  window.AuraUnity?.register?.('receivables',window.ReceivablesV1);
})();
