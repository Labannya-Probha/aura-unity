(function(){
  'use strict';
  const state={customers:[],invoices:[],receipts:[],aging:[]};
  const el=id=>document.getElementById(id);
  const money=v=>`৳ ${Number(v||0).toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const safe=v=>typeof esc==='function'?esc(v):String(v??'');
  const notify=(m,t='success')=>typeof toast==='function'?toast(m,t):alert(m);
  const today=()=>new Date().toISOString().slice(0,10);

  function ensureUI(){
    if(el('receivables')) return;
    const content=document.querySelector('.content'); if(!content)return;
    const section=document.createElement('div'); section.id='receivables'; section.className='module';
    section.innerHTML=`
      <div class="ar-kpis">
        <div class="stat-card sc-gold"><div class="stat-label">Total Receivable</div><div id="arKpiOutstanding" class="stat-value">৳ 0.00</div><div class="stat-note">Posted outstanding</div></div>
        <div class="stat-card sc-info"><div class="stat-label">Overdue</div><div id="arKpiOverdue" class="stat-value">৳ 0.00</div><div class="stat-note">Past due date</div></div>
        <div class="stat-card sc-em"><div class="stat-label">Unallocated Advance</div><div id="arKpiAdvance" class="stat-value">৳ 0.00</div><div class="stat-note">Customer advance</div></div>
        <div class="stat-card sc-navy"><div class="stat-label">Receipts</div><div id="arKpiReceipts" class="stat-value">0</div><div class="stat-note">Posted receipts</div></div>
      </div>
      <div class="ar-grid">
        <div class="card"><div class="card-header"><div><div class="card-title">Customer / Member Master</div><div class="card-sub">Tenant-specific receivable accounts</div></div><button class="btn btn-gold btn-sm" onclick="ReceivablesV1.newCustomer()">+ New</button></div><div class="card-body np"><div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Phone</th><th>Status</th></tr></thead><tbody id="arCustomerBody"></tbody></table></div></div></div>
        <div class="card"><div class="card-header"><div><div class="card-title">Invoice / Demand Entry</div><div class="card-sub">Maker-checker workflow</div></div><span class="badge bg-purple">Phase 4B</span></div><div class="card-body">
          <div class="form-row-2"><div class="form-group"><label class="form-label">Customer</label><select id="arInvoiceCustomer" class="form-control"></select></div><div class="form-group"><label class="form-label">Type</label><select id="arInvoiceType" class="form-control"><option value="invoice">Invoice</option><option value="demand">Demand</option><option value="subscription">Subscription</option><option value="opening">Opening</option></select></div><div class="form-group"><label class="form-label">Invoice Date</label><input id="arInvoiceDate" type="date" class="form-control"></div><div class="form-group"><label class="form-label">Due Date</label><input id="arDueDate" type="date" class="form-control"></div></div>
          <div class="form-group"><label class="form-label">Description</label><input id="arDescription" class="form-control" placeholder="Monthly subscription / service charge"></div>
          <div class="form-row-2"><div class="form-group"><label class="form-label">Quantity</label><input id="arQty" type="number" min="0" step="0.01" value="1" class="form-control" oninput="ReceivablesV1.recalc()"></div><div class="form-group"><label class="form-label">Rate</label><input id="arRate" type="number" min="0" step="0.01" value="0" class="form-control" oninput="ReceivablesV1.recalc()"></div></div>
          <div class="ar-total"><span>Total</span><strong id="arTotal">৳ 0.00</strong></div><div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn btn-gold" onclick="ReceivablesV1.saveInvoice()">Save Draft Invoice</button></div>
        </div></div>
      </div>
      <div class="card"><div class="card-header"><div><div class="card-title">Invoice Workflow & Outstanding Ledger</div><div class="card-sub">Submit, approve, post and receive payment</div></div><button class="btn btn-ghost btn-sm" onclick="ReceivablesV1.load()">Refresh</button></div><div class="card-body np"><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody id="arInvoiceBody"></tbody></table></div></div></div>
      <div class="ar-grid">
        <div class="card"><div class="card-header"><div><div class="card-title">AR Aging</div><div class="card-sub">Current and overdue buckets</div></div></div><div class="card-body np"><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Current</th><th>1–30</th><th>31–60</th><th>61–90</th><th>90+</th><th>Total</th></tr></thead><tbody id="arAgingBody"></tbody></table></div></div></div>
        <div class="card"><div class="card-header"><div><div class="card-title">Receipt Register</div><div class="card-sub">Print opens browser print preview directly</div></div></div><div class="card-body np"><div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Amount</th><th>Allocated</th><th>Advance</th><th>Action</th></tr></thead><tbody id="arReceiptBody"></tbody></table></div></div></div>
      </div>`;
    content.appendChild(section);
    el('arInvoiceDate').value=today(); const d=new Date(); d.setDate(d.getDate()+30); el('arDueDate').value=d.toISOString().slice(0,10);
  }
  function ensureNav(){
    if(document.querySelector('.nav-item[data-module="receivables"]'))return;
    const reports=document.querySelector('.nav-item[data-module="reports"]'); if(!reports)return;
    const nav=document.createElement('div');nav.className='nav-item';nav.dataset.module='receivables';nav.innerHTML='<span class="nav-icon">◎</span><span data-bn="প্রাপ্য হিসাব" data-en="Receivables">Receivables</span>';
    reports.parentNode.insertBefore(nav,reports);nav.addEventListener('click',()=>{openModule('receivables');closeMobSidebar();load();});
  }
  async function load(){
    ensureUI();ensureNav();if(!window.receivableService)return;
    const [c,i,r,a]=await Promise.all([receivableService.customers(),receivableService.invoices(),receivableService.receipts(),receivableService.aging()]);
    const first=[c,i,r,a].find(x=>x.error);if(first){notify(first.error.message,'error');return;}
    state.customers=c.data||[];state.invoices=i.data||[];state.receipts=r.data||[];state.aging=a.data||[];render();
  }
  function actionButtons(i){
    const b=[];
    if(i.status==='draft')b.push(`<button class="btn btn-ghost btn-sm" onclick="ReceivablesV1.changeStatus('${i.id}','submit')">Submit</button>`);
    if(i.status==='submitted'){b.push(`<button class="btn btn-gold btn-sm" onclick="ReceivablesV1.changeStatus('${i.id}','approve')">Approve</button>`);b.push(`<button class="btn btn-ghost btn-sm" onclick="ReceivablesV1.changeStatus('${i.id}','reject')">Reject</button>`);}
    if(i.status==='approved')b.push(`<button class="btn btn-gold btn-sm" onclick="ReceivablesV1.changeStatus('${i.id}','post')">Post</button>`);
    if(['posted','partially_paid'].includes(i.status)&&Number(i.balance_amount)>0)b.push(`<button class="btn btn-gold btn-sm" onclick="ReceivablesV1.receive('${i.id}','${i.customer_id}',${Number(i.balance_amount)})">Receive</button>`);
    return b.join(' ');
  }
  function render(){
    el('arCustomerBody').innerHTML=state.customers.length?state.customers.map(c=>`<tr><td><strong>${safe(c.customer_code)}</strong></td><td>${safe(c.name)}</td><td>${safe(c.customer_type)}</td><td>${safe(c.phone||'—')}</td><td><span class="badge ${c.status==='active'?'bg-green':'bg-danger'}">${safe(c.status)}</span></td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;padding:24px">No customers found.</td></tr>';
    el('arInvoiceCustomer').innerHTML='<option value="">Select customer</option>'+state.customers.filter(c=>c.status==='active').map(c=>`<option value="${c.id}">${safe(c.customer_code)} — ${safe(c.name)}</option>`).join('');
    el('arInvoiceBody').innerHTML=state.invoices.length?state.invoices.map(i=>`<tr><td><strong>${safe(i.invoice_no)}</strong><div class="small">${safe(i.invoice_date)}</div></td><td>${safe(i.ar_customers?.name||'—')}</td><td>${safe(i.due_date)}</td><td>${money(i.total_amount)}</td><td>${money(i.paid_amount)}</td><td><strong>${money(i.balance_amount)}</strong></td><td><span class="badge ${i.status==='paid'?'bg-green':i.status==='draft'?'bg-gold':i.status==='submitted'?'bg-purple':'bg-navy'}">${safe(i.status)}</span></td><td>${actionButtons(i)||'—'}</td></tr>`).join(''):'<tr><td colspan="8" style="text-align:center;padding:24px">No invoices found.</td></tr>';
    el('arAgingBody').innerHTML=state.aging.length?state.aging.map(a=>`<tr><td>${safe(a.customer_code)} — ${safe(a.name)}</td><td>${money(a.current_due)}</td><td>${money(a.bucket_1_30)}</td><td>${money(a.bucket_31_60)}</td><td>${money(a.bucket_61_90)}</td><td>${money(a.bucket_90_plus)}</td><td><strong>${money(a.total_outstanding)}</strong></td></tr>`).join(''):'<tr><td colspan="7" style="text-align:center;padding:24px">No aging data.</td></tr>';
    el('arReceiptBody').innerHTML=state.receipts.length?state.receipts.map(r=>`<tr><td><strong>${safe(r.receipt_no)}</strong></td><td>${safe(r.receipt_date)}</td><td>${safe(r.customer_name)}</td><td>${money(r.amount)}</td><td>${money(r.allocated_amount)}</td><td>${money(r.unallocated_amount)}</td><td><button class="btn btn-ghost btn-sm" onclick="ReceivablesV1.printReceipt('${safe(r.receipt_no)}')">Print</button></td></tr>`).join(''):'<tr><td colspan="7" style="text-align:center;padding:24px">No receipts found.</td></tr>';
    const posted=state.invoices.filter(i=>['posted','partially_paid','paid'].includes(i.status));
    el('arKpiOutstanding').textContent=money(posted.reduce((s,i)=>s+Number(i.balance_amount||0),0));
    el('arKpiOverdue').textContent=money(posted.filter(i=>Number(i.balance_amount)>0&&i.due_date<today()).reduce((s,i)=>s+Number(i.balance_amount||0),0));
    el('arKpiAdvance').textContent=money(state.receipts.reduce((s,r)=>s+Number(r.unallocated_amount||0),0));
    el('arKpiReceipts').textContent=state.receipts.length;
  }
  async function newCustomer(){const name=prompt('Customer / member name:');if(!name)return;const phone=prompt('Phone (optional):','')||'';const type=prompt('Type: member, customer, donor, sponsor','member')||'member';try{const code=await receivableService.nextCustomerCode();const {error}=await receivableService.createCustomer({customer_code:code,name:name.trim(),phone:phone.trim(),customer_type:type.trim().toLowerCase(),status:'active'});if(error)throw error;notify('Customer created.');await load();}catch(e){notify(e.message||String(e),'error');}}
  function recalc(){const total=Number(el('arQty')?.value||0)*Number(el('arRate')?.value||0);if(el('arTotal'))el('arTotal').textContent=money(total);return total;}
  async function saveInvoice(){const customerId=el('arInvoiceCustomer').value,description=el('arDescription').value.trim(),total=recalc();if(!customerId||!description||total<=0){notify('Customer, description and positive amount are required.','error');return;}try{const type=el('arInvoiceType').value,invoiceNo=await receivableService.nextInvoiceNo(type);const header={customer_id:customerId,invoice_no:invoiceNo,invoice_date:el('arInvoiceDate').value,due_date:el('arDueDate').value,invoice_type:type,description,subtotal:total,total_amount:total,status:'draft'};const line={description,quantity:Number(el('arQty').value||1),unit_rate:Number(el('arRate').value||0)};const {error}=await receivableService.createInvoice(header,line);if(error)throw error;notify(`Draft invoice ${invoiceNo} created.`);el('arDescription').value='';el('arRate').value='0';recalc();await load();}catch(e){notify(e.message||String(e),'error');}}
  async function changeStatus(id,action){try{const remarks=action==='reject'?prompt('Rejection reason:','')||'':'';const {error}=await receivableService.changeStatus(id,action,remarks);if(error)throw error;notify(`Invoice ${action} completed.`);await load();}catch(e){notify(e.message||String(e),'error');}}
  async function receive(invoiceId,customerId,balance){const amount=Number(prompt(`Payment amount (max allocatable ${balance}):`,String(balance)));if(!amount||amount<=0)return;const mode=prompt('Payment mode: cash / bank transfer / mobile banking / cheque','cash')||'cash';const ref=prompt('Reference no. (optional):','')||'';try{const {data,error}=await receivableService.receivePayment({customerId,amount,paymentMode:mode,referenceNo:ref,invoiceId,receiptDate:today()});if(error)throw error;notify(`Receipt ${data.receipt_no} posted.`);await load();printReceipt(data.receipt_no);}catch(e){notify(e.message||String(e),'error');}}
  function printReceipt(receiptNo){window.open(`money-receipt.html?receipt_no=${encodeURIComponent(receiptNo)}&lang=${window.S?.lang||'en'}&autoprint=1`,'_blank','noopener');}
  document.addEventListener('DOMContentLoaded',()=>{ensureUI();ensureNav();if(window.TT){TT.en.receivables='Receivables';TT.bn.receivables='প্রাপ্য হিসাব';}});
  window.ReceivablesV1={load,newCustomer,recalc,saveInvoice,changeStatus,receive,printReceipt};
  window.AuraUnity?.register?.('receivables',window.ReceivablesV1);
})();
