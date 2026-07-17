// ══════════════════════════════════════════
// REPORTS ENGINE
// ══════════════════════════════════════════
var currentReportName  = '';
var currentReportTitle = '';

const RPT_TITLES = {
  collection:'মাসিক কালেকশন রিপোর্ট',
  daybook:'ডে বুক (General Ledger)',
  trial:'ট্রায়াল ব্যালেন্স',
  pl:'Income & Expenditure Statement',
  bs:'Statement of Financial Position',
  cashbank:'ক্যাশ ও ব্যাংক বুক',
  receiptpayment:'Receipt & Payment Statement',
};

function getReportDateRange() {
  return {
    from: document.getElementById('rptFromDate')?.value || '',
    to: document.getElementById('rptToDate')?.value || ''
  };
}

function getReportRangeLabel() {
  const { from, to } = getReportDateRange();
  if (!from && !to) return '';
  if (from && to) return `${from} → ${to}`;
  if (from) return `From: ${from}`;
  return `To: ${to}`;
}

function isWithinDateRange(value, range) {
  if (!range.from && !range.to) return true;
  if (!value) return false;
  const d = String(value).slice(0, 10);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

function withDateRange(query, column) {
  const range = getReportDateRange();
  let q = query;
  if (range.from) q = q.gte(column, range.from);
  if (range.to) q = q.lte(column, range.to);
  return q;
}

function applyReportDateRange() {
  const { from, to } = getReportDateRange();
  if (from && to && from > to) { toast('From Date, To Date থেকে বড় হতে পারবে না।', 'warning'); return; }
  if (!currentReportName) { toast('আগে একটি রিপোর্ট নির্বাচন করুন।', 'info'); return; }
  loadReport(currentReportName);
}

function clearReportDateRange() {
  const fromEl = document.getElementById('rptFromDate');
  const toEl = document.getElementById('rptToDate');
  if (fromEl) fromEl.value = '';
  if (toEl) toEl.value = '';
  if (currentReportName) loadReport(currentReportName);
}

function setActiveRptBtn(name) {
  document.querySelectorAll('.rpt-btn').forEach(b=>{ b.classList.remove('btn-primary'); b.classList.add('btn-ghost'); });
  const map={collection:0,daybook:1,trial:2,pl:3,bs:4,cashbank:5,receiptpayment:6};
  if (map[name]!==undefined) {
    const btns=document.querySelectorAll('.rpt-btn');
    btns[map[name]].classList.remove('btn-ghost');
    btns[map[name]].classList.add('btn-primary');
  }
}

async function loadReport(name) {
  const { from, to } = getReportDateRange();
  if (from && to && from > to) { toast('From Date, To Date থেকে বড় হতে পারবে না।', 'warning'); return; }
  currentReportName  = name;
  currentReportTitle = RPT_TITLES[name]||name;
  const resultEl  = document.getElementById('reportResult');
  const card      = document.getElementById('reportCard');
  const titleEl   = document.getElementById('rptTitle');
  const subEl     = document.getElementById('rptSubtitle');
  resultEl.innerHTML='<div style="text-align:center;padding:40px;color:var(--muted)">⏳ লোড হচ্ছে...</div>';
  card.classList.remove('hidden');
  titleEl.textContent = currentReportTitle;
  const rangeLabel = getReportRangeLabel();
  subEl.textContent   = (S.company?.name||"Challengers of 90's") + ' | ' + new Date().toLocaleDateString('bn-BD') + (rangeLabel ? ` | ${rangeLabel}` : '');
  setActiveRptBtn(name);
  let html='';
  if      (name==='collection') html=await buildCollectionReport();
  else if (name==='daybook')    html=await buildDaybookReport();
  else if (name==='trial')      html=await buildTrialReport();
  else if (name==='pl')         html=await buildPLReport();
  else if (name==='bs')         html=await buildBSReport();
  else if (name==='cashbank')   html=await buildCashBankReport();
  else if (name==='receiptpayment') html=await buildReceiptPaymentReport();
  resultEl.innerHTML = html||'<div class="alert alert-warning">কোনো ডেটা নেই।</div>';
  card.scrollIntoView({behavior:'smooth',block:'start'});
}

function rptTable(headers, rows, totals) {
  let th=headers.map((h,i)=>`<th style="background:#0F1F3D;color:#fff;padding:9px 14px;text-align:${i===0?'left':'right'};font-size:11px;font-weight:700;white-space:nowrap">${esc(h)}</th>`).join('');
  let tbody=rows.map((r,ri)=>{
    const bg=r._section?'#E8F0FE':(ri%2===0?'#fff':'#FAFAF8');
    const fw=r._bold?'700':'400';
    const cells=r.cells.map((c,ci)=>{
      const align=ci===0?'left':'right';
      const color=c.color||'#0B1629';
      const val=c && typeof c === 'object' && c.val!==undefined ? c.val : c;
      const safeVal=val && typeof val === 'object' && Object.prototype.hasOwnProperty.call(val, 'html')
        ? String(val.html ?? '')
        : esc(val);
      const indent=(ci===0&&r._indent)?`padding-left:${14+r._indent*18}px`:'';
      return `<td style="padding:9px 14px;${indent};border-bottom:1px solid #E2E8F4;text-align:${align};font-weight:${fw};color:${color};font-size:13px">${safeVal}</td>`;
    }).join('');
    return `<tr style="background:${bg}">${cells}</tr>`;
  }).join('');
  let tfoot='';
  if(totals){
    const tc=totals.map((c,i)=>`<td style="padding:10px 14px;text-align:${i===0?'left':'right'};font-weight:800;color:#fff;font-size:13px">${esc(c||'')}</td>`).join('');
    tfoot=`<tr style="background:#0F1F3D">${tc}</tr>`;
  }
  return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>${th}</tr></thead><tbody>${tbody}${tfoot}</tbody></table></div>`;
}

function rptFmt(n) { return '৳ '+Number(n||0).toLocaleString('en-IN'); }
function rptDash() { return rptTrusted('<span style="color:#BCC5D4">—</span>'); }
function rptHdr(label,sub='') {
  return `<div style="background:linear-gradient(135deg,#0F1F3D,#1A3260);color:#fff;padding:14px 16px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:0">${esc(label)}<div style="font-weight:400;color:#C7D3E6;font-size:11px;letter-spacing:0;text-transform:none;margin-top:4px">${esc(sub || getReportRangeLabel() || 'Professional ERP Format')}</div></div>`;
}
function rptMeta(note='') {
  return `<div class="report-meta"><span><strong>Period:</strong> ${esc(getReportRangeLabel() || 'All available dates')}</span><span><strong>Prepared By:</strong> ${esc(getCurrentUserName())}</span><span><strong>Generated:</strong> ${esc(new Date().toLocaleString('en-GB'))}</span>${note?`<span>${esc(note)}</span>`:''}</div>`;
}
function wrapReportShell(title, subtitle, content, note='') {
  return `<div class="report-shell">${rptHdr(title, subtitle)}<div style="padding:16px">${content}</div>${rptMeta(note)}</div>`;
}

async function buildCollectionReport() {
  const {data,error}=await readTenantRows('collections', (from) => withDateRange(
    from.select('receipt_no,collection_date,payer_name,amount,description').order('collection_date',{ascending:false}),
    'collection_date'
  ));
  const monthly={};
  let grand=0;
  (data||[]).forEach(r=>{ const m=(r.collection_date||'').slice(0,7) || 'Undated'; if(!monthly[m])monthly[m]=[]; monthly[m].push(r); grand+=Number(r.amount||0); });
  let rows=[];
  Object.keys(monthly).sort().reverse().forEach(m=>{
    const mT=monthly[m].reduce((s,r)=>s+Number(r.amount||0),0);
    rows.push({cells:[{val:m,color:'#0F1F3D'},{val:''},{val:''},{val:rptFmt(mT),color:'#1A7A4A'},{val:''}],_section:true,_bold:true});
    monthly[m].forEach(r=>rows.push({cells:[{val:r.collection_date||rptDash()},{val:rptTrusted(`<span style="background:#FDF8EC;border:1px solid rgba(212,160,23,.3);padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#7A5500">${esc(r.receipt_no||'—')}</span>`)},{val:r.payer_name||'—'},{val:rptFmt(r.amount),color:'#1A7A4A'},{val:r.description||'—'}],_indent:1}));
  });
  if (!rows.length) rows.push({cells:[{val:rptDash()},{val:'—'},{val:'No collection yet',color:'#647188'},{val:rptFmt(0),color:'#1A7A4A'},{val:'Professional empty report format'}]});
  return wrapReportShell('মাসিক কালেকশন','Monthly Collection Summary',
    rptTable(['তারিখ','রিসিট নং','দাতার নাম','পরিমাণ (BDT)','বিবরণ'],rows,['মোট',`${(data||[]).length} টি`,'',rptFmt(grand),''])
  );
}

async function buildDaybookReport() {
  const [colRes,vchRes,jRes]=await Promise.all([
    readTenantRows('collections', (from) => withDateRange(from.select('collection_date,description,amount,receipt_no').order('collection_date'), 'collection_date')),
    readTenantRows('vouchers', (from) => withDateRange(from.select('vch_date,description,amount,vch_type,account_code').order('vch_date'), 'vch_date')),
    readTenantRows('journals', (from) => withDateRange(from.select('journal_date,narration,ref_no,total_debit,total_credit,status').order('journal_date'), 'journal_date')),
  ]);
  const all=[];
  (colRes.data||[]).forEach(r=>all.push({date:r.collection_date,desc:'Collection: '+(r.description||r.receipt_no||''),dr:Number(r.amount||0),cr:0,acc:'Cash in Hand',ref:r.receipt_no}));
  (vchRes.data||[]).forEach(r=>{ const ip=String(r.vch_type||'').includes('পেমেন্ট')||String(r.vch_type||'').toLowerCase().includes('payment'); all.push({date:r.vch_date,desc:(r.vch_type||'')+': '+(r.description||''),dr:ip?0:Number(r.amount||0),cr:ip?Number(r.amount||0):0,acc:r.account_code||'',ref:''}); });
  (jRes.data||[]).filter(r => (r.status||'posted')==='posted').forEach(r=>all.push({date:r.journal_date,desc:r.narration||'Journal Voucher',dr:Number(r.total_debit||0),cr:Number(r.total_credit||0),acc:'Journal Voucher',ref:r.ref_no}));
  all.sort((a,b)=>new Date(a.date)-new Date(b.date));
  let tDr=0,tCr=0;
  const rows=(all.length?all:[{date:'',ref:'',desc:'No transaction posted yet',acc:'—',dr:0,cr:0}]).map(r=>{ tDr+=r.dr; tCr+=r.cr; return {cells:[{val:r.date||rptDash()},{val:r.ref||'',color:'#647188'},{val:r.desc||''},{val:r.acc||'',color:'#647188'},{val:r.dr?rptFmt(r.dr):rptDash(),color:r.dr?'#1A7A4A':'#BCC5D4'},{val:r.cr?rptFmt(r.cr):rptDash(),color:r.cr?'#C0392B':'#BCC5D4'}]}; });
  return wrapReportShell('ডে বুক','General Ledger — All Transactions',
    rptTable(['তারিখ','রেফ','বিবরণ','অ্যাকাউন্ট','ডেবিট (BDT)','ক্রেডিট (BDT)'],rows,['','','মোট','',rptFmt(tDr),rptFmt(tCr)])
  );
}

async function buildTrialReport() {
  const range = getReportDateRange();
  const {data: rawData}=await readJournalItemsWithContext((from) => from.select('journal_id,account_code,debit,credit'));
  const data = (rawData || []).filter(isPostedJournalRow);
  const accs={};
  data.filter(r=>isWithinDateRange(r.journals?.journal_date, range)).forEach(r=>{ if(!accs[r.account_code])accs[r.account_code]={name:r.coa?.account_name||r.account_code,group:r.coa?.account_group||'',dr:0,cr:0}; accs[r.account_code].dr+=Number(r.debit||0); accs[r.account_code].cr+=Number(r.credit||0); });
  let tDr=0,tCr=0;
  const rows=Object.keys(accs).map(code=>{ const a=accs[code]; const dr=a.dr>a.cr?a.dr-a.cr:0,cr=a.cr>a.dr?a.cr-a.dr:0; tDr+=dr; tCr+=cr; return {cells:[{val:code,color:'#647188'},{val:a.name},{val:a.group,color:'#647188'},{val:dr?rptFmt(dr):rptDash(),color:dr?'#1A7A4A':'#BCC5D4'},{val:cr?rptFmt(cr):rptDash(),color:cr?'#C0392B':'#BCC5D4'}]}; });
  if(!rows.length) rows.push({cells:[{val:'—',color:'#647188'},{val:'Opening / no activity'},{val:'Asset',color:'#647188'},{val:rptFmt(0),color:'#1A7A4A'},{val:rptFmt(0),color:'#C0392B'}]});
  const bal=Math.abs(tDr-tCr)<1;
  const check=`<div class="report-highlight"><span style="font-weight:700;color:${bal?'#135A36':'#C0392B'}">${bal?'✓ Trial Balance agrees — Debit = Credit':'✗ Trial Balance does NOT agree — please review'}</span><strong>${rptFmt(Math.abs(tDr-tCr))}</strong></div>`;
  return wrapReportShell('ট্রায়াল ব্যালেন্স','As at '+new Date().toLocaleDateString('en-GB'),
    rptTable(['কোড','অ্যাকাউন্ট','গ্রুপ','ডেবিট (BDT)','ক্রেডিট (BDT)'],rows,['','মোট','',rptFmt(tDr),rptFmt(tCr)])+check
  );
}

async function buildPLReport() {
  const range = getReportDateRange();
  const {data: rawData}=await readJournalItemsWithContext((from) => from.select('journal_id,account_code,debit,credit'));
  const data = (rawData || []).filter(isPostedJournalRow);
  const inc={},exp={};
  data.filter(r=>isWithinDateRange(r.journals?.journal_date, range)).forEach(r=>{ const g=r.coa?.account_group||''; const net=Number(r.debit||0)-Number(r.credit||0); if(g==='Income')inc[r.coa?.account_name||r.account_code]=(inc[r.coa?.account_name||r.account_code]||0)+(-net); if(g==='Expense')exp[r.coa?.account_name||r.account_code]=(exp[r.coa?.account_name||r.account_code]||0)+net; });
  const tI=Object.values(inc).reduce((s,v)=>s+v,0), tE=Object.values(exp).reduce((s,v)=>s+v,0), sur=tI-tE;
  const rows=[];
  rows.push({cells:[{val:'আয় (INCOME)',color:'#0F1F3D'},{val:''}],_section:true,_bold:true});
  Object.keys(inc).forEach(k=>rows.push({cells:[{val:k},{val:rptFmt(inc[k]),color:'#1A7A4A'}],_indent:1}));
  if(!Object.keys(inc).length) rows.push({cells:[{val:'Subscription / Donation',color:'#BCC5D4'},{val:rptFmt(0),color:'#1A7A4A'}],_indent:1});
  rows.push({cells:[{val:'মোট আয়',color:'#1A7A4A'},{val:rptFmt(tI),color:'#1A7A4A'}],_bold:true});
  rows.push({cells:[{val:''},{val:''}]});
  rows.push({cells:[{val:'ব্যয় (EXPENDITURE)',color:'#0F1F3D'},{val:''}],_section:true,_bold:true});
  Object.keys(exp).forEach(k=>rows.push({cells:[{val:k},{val:rptFmt(exp[k]),color:'#C0392B'}],_indent:1}));
  if(!Object.keys(exp).length) rows.push({cells:[{val:'Administrative expenses',color:'#BCC5D4'},{val:rptFmt(0),color:'#C0392B'}],_indent:1});
  rows.push({cells:[{val:'মোট ব্যয়',color:'#C0392B'},{val:rptFmt(tE),color:'#C0392B'}],_bold:true});
  rows.push({cells:[{val:''},{val:''}]});
  rows.push({cells:[{val:sur>=0?'নিট উদ্বৃত্ত (NET SURPLUS)':'নিট ঘাটতি (NET DEFICIT)',color:sur>=0?'#1A7A4A':'#C0392B'},{val:rptFmt(Math.abs(sur)),color:sur>=0?'#1A7A4A':'#C0392B'}],_bold:true});
  return wrapReportShell('Income & Expenditure','For the selected period', rptTable(['বিবরণ','পরিমাণ (BDT)'],rows,null));
}

async function buildBSReport() {
  const range = getReportDateRange();
  const {data: rawData}=await readJournalItemsWithContext((from) => from.select('journal_id,account_code,debit,credit'));
  const data = (rawData || []).filter(isPostedJournalRow);
  const grps={Asset:{},Liability:{},Equity:{},Income:{},Expense:{}};
  data.filter(r=>isWithinDateRange(r.journals?.journal_date, range)).forEach(r=>{ const g=r.coa?.account_group||'Other'; const net=Number(r.debit||0)-Number(r.credit||0); if(grps[g])grps[g][r.coa?.account_name||r.account_code]=(grps[g][r.coa?.account_name||r.account_code]||0)+net; });
  const sg=g=>Object.values(grps[g]||{}).reduce((s,v)=>s+v,0);
  const tA=sg('Asset'),tL=sg('Liability'),tE=sg('Equity'),sur=sg('Income')-sg('Expense');
  const rows=[];
  rows.push({cells:[{val:'সম্পদ (ASSETS)',color:'#0F1F3D'},{val:''}],_section:true,_bold:true});
  Object.keys(grps.Asset).forEach(k=>rows.push({cells:[{val:k},{val:rptFmt(grps.Asset[k]),color:'#1A7A4A'}],_indent:1}));
  if(!Object.keys(grps.Asset).length) rows.push({cells:[{val:'Cash and equivalents',color:'#BCC5D4'},{val:rptFmt(0),color:'#1A7A4A'}],_indent:1});
  rows.push({cells:[{val:'মোট সম্পদ',color:'#1558B0'},{val:rptFmt(tA),color:'#1558B0'}],_bold:true});
  rows.push({cells:[{val:''},{val:''}]});
  rows.push({cells:[{val:'দায় (LIABILITIES)',color:'#0F1F3D'},{val:''}],_section:true,_bold:true});
  Object.keys(grps.Liability).forEach(k=>rows.push({cells:[{val:k},{val:rptFmt(grps.Liability[k]),color:'#C0392B'}],_indent:1}));
  if(!Object.keys(grps.Liability).length) rows.push({cells:[{val:'Accounts payable',color:'#BCC5D4'},{val:rptFmt(0),color:'#C0392B'}],_indent:1});
  rows.push({cells:[{val:'মোট দায়',color:'#C0392B'},{val:rptFmt(tL),color:'#C0392B'}],_bold:true});
  rows.push({cells:[{val:''},{val:''}]});
  rows.push({cells:[{val:'তহবিল (FUND/EQUITY)',color:'#0F1F3D'},{val:''}],_section:true,_bold:true});
  Object.keys(grps.Equity).forEach(k=>rows.push({cells:[{val:k},{val:rptFmt(grps.Equity[k]),color:'#1A7A4A'}],_indent:1}));
  rows.push({cells:[{val:'চলতি বছরের উদ্বৃত্ত',color:'#1A7A4A'},{val:rptFmt(sur),color:'#1A7A4A'}],_indent:1});
  rows.push({cells:[{val:'মোট তহবিল',color:'#1A7A4A'},{val:rptFmt(tE+sur),color:'#1A7A4A'}],_bold:true});
  const bal=Math.abs(tA-(tL+tE+sur))<1;
  const check=`<div class="report-highlight"><span style="font-weight:700;color:${bal?'#135A36':'#C0392B'}">${bal?'✓ Balance Sheet balances':'✗ Does NOT balance — please review'}</span><strong>${rptFmt(Math.abs(tA-(tL+tE+sur)))}</strong></div>`;
  return wrapReportShell('Statement of Financial Position','As at selected period end', rptTable(['বিবরণ','পরিমাণ (BDT)'],rows,null)+check);
}

async function buildCashBankReport() {
  const range = getReportDateRange();
  const reportFrom = range.from || getSessionDates()[0] || new Date().toISOString().slice(0,10);
  const source = await fetchStatementSource({ from: reportFrom, to: range.to || reportFrom });
  const openingBalances = deriveOpeningBalances(reportFrom);
  const all=[];
  source.collections.forEach(r=>all.push({date:r.collection_date,ref:r.receipt_no||'',desc:(getReceiptMeta(r.receipt_no).head || 'Collection') + ': ' + (r.description||''),acc:'Cash in Hand',dr:Number(r.amount||0),cr:0}));
  source.vouchers.forEach(r=>{ const payment=String(r.vch_type||'').includes('পেমেন্ট')||String(r.vch_type||'').toLowerCase().includes('payment'); all.push({date:r.vch_date,ref:getReceiptMeta(`voucher-${r.id || ''}`).voucher_no || '',desc:r.description||r.vch_type||'Voucher',acc:source.coaMap[r.account_code]?.account_name||r.account_code||'',dr:payment?0:Number(r.amount||0),cr:payment?Number(r.amount||0):0}); });
  source.journals.forEach(r=>{ const j=r.journals||{}; all.push({date:j.journal_date,ref:j.ref_no||'',desc:j.narration||'',acc:r.coa?.account_name||r.account_code||'',dr:Number(r.debit||0),cr:Number(r.credit||0)}); });
  all.sort((a,b)=>new Date(a.date||'1970-01-01')-new Date(b.date||'1970-01-01'));
  let runBal=Object.values(openingBalances).reduce((s,v)=>s+Number(v||0),0);
  const rows=[{cells:[{val:reportFrom,color:'#647188'},{val:'OPEN',color:'#647188'},{val:'Opening Balance'},{val:'Cash / Bank / Current Assets',color:'#647188'},{val:rptDash(),color:'#BCC5D4'},{val:rptDash(),color:'#BCC5D4'},{val:rptFmt(runBal),color:'#1558B0'}],_section:true,_bold:true}];
  all.forEach(r=>{ runBal+=Number(r.dr||0)-Number(r.cr||0); rows.push({cells:[{val:r.date||''},{val:r.ref||'',color:'#647188'},{val:r.desc||''},{val:r.acc||'',color:'#647188'},{val:r.dr?rptFmt(r.dr):rptDash(),color:r.dr?'#1A7A4A':'#BCC5D4'},{val:r.cr?rptFmt(r.cr):rptDash(),color:r.cr?'#C0392B':'#BCC5D4'},{val:rptFmt(runBal),color:runBal>=0?'#1558B0':'#C0392B'}]}); });
  const closing=`<div class="report-highlight"><span style="font-weight:700;color:#1558B0">Closing Balance</span><strong style="color:${runBal>=0?'#1A7A4A':'#C0392B'}">${rptFmt(runBal)}</strong></div>`;
  return wrapReportShell('ক্যাশ ও ব্যাংক বুক','Opening to closing movement summary', rptTable(['তারিখ','রেফ','বিবরণ','অ্যাকাউন্ট','প্রাপ্তি (BDT)','প্রদান (BDT)','ব্যালেন্স'],rows,null)+closing);
}

async function buildReceiptPaymentReport() {
  const range = getReportDateRange();
  const reportFrom = range.from || getSessionDates()[0] || new Date().toISOString().slice(0,10);
  const reportTo = range.to || new Date().toISOString().slice(0,10);
  const openingBalances = deriveOpeningBalances(reportFrom);
  const summary = await summarizeCurrentAssets({ from: reportFrom, to: reportTo }, openingBalances);
  const assetRows = (summary.assetRows.length ? summary.assetRows : [{name:'Cash in Hand',opening:0,receipts:0,payments:0,net:0,closing:0}]).map(item => ({
    cells:[
      {val:item.name},{val:rptFmt(item.opening),color:'#1558B0'},{val:rptFmt(item.receipts),color:'#1A7A4A'},{val:rptFmt(item.payments),color:'#C0392B'},{val:rptFmt(item.net),color:item.net>=0?'#1A7A4A':'#C0392B'},{val:rptFmt(item.closing),color:'#0F1F3D'}
    ]
  }));
  const headRows = (summary.headRows.length ? summary.headRows : [{head:'No transaction head posted yet',receipts:0,payments:0,net:0}]).map(row => ({
    cells:[
      {val:row.head,color:row.head.includes('No transaction')?'#647188':'#0B1629'},{val:rptFmt(row.receipts),color:'#1A7A4A'},{val:rptFmt(row.payments),color:'#C0392B'},{val:rptFmt(row.net),color:row.net>=0?'#1A7A4A':'#C0392B'}
    ]
  }));
  const totalClosing = summary.assetRows.reduce((s,row)=>s+Number(row.closing||0),0);
  const assetTable = rptTable(['Current Asset Head','Opening','Receipts','Payments','Net Movement','Closing'], assetRows, null);
  const headTable = rptTable(['Transaction Head','Receipts','Payments','Net'], headRows, null);
  const closing = `<div class="report-highlight"><span style="font-weight:700;color:#1558B0">Total Closing Balance (Cash/Bank/Current Assets)</span><strong>${rptFmt(totalClosing)}</strong></div>`;
  return wrapReportShell('Receipt & Payment Statement','Head wise summary including opening and closing balances', assetTable + '<div class="report-section-gap"></div>' + headTable + closing);
}

function printReport() {
  const org=S.company?.name||"Challengers of 90's";
  const title=currentReportTitle||'রিপোর্ট';
  const today=new Date().toLocaleDateString('bn-BD');
  const body=document.getElementById('reportResult').innerHTML;
  const win=window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
    <style>body{font-family:Arial,sans-serif;padding:15mm;color:#0B1629;font-size:12px}
    h1{color:#0F1F3D;font-size:18px;margin:0}h2{color:#647188;font-size:13px;font-weight:normal;margin:4px 0 16px}
    table{width:100%;border-collapse:collapse}th{background:#0F1F3D;color:#fff;padding:8px 12px;font-size:11px;text-align:left}
    td{padding:8px 12px;border-bottom:1px solid #E2E8F4;font-size:12px}
    .footer{margin-top:24px;padding-top:10px;border-top:1px solid #E2E8F4;font-size:10px;color:#647188;display:flex;justify-content:space-between;gap:16px}     .footer strong{color:#0B1629}
    @media print{body{padding:10mm}}</style>
  </head><body>
  <h1>${org}</h1><h2>${title} &nbsp;|&nbsp; ${today}</h2>
  ${body}
  <div class="footer"><span>&copy; 2026 Aura Stay</span><strong>Powered by Aura Stay</strong></div>
  <script>window.onload=()=>window.print();<\/script></body></html>`);
  win.document.close();
}

function exportPDF() {
  toast('প্রিন্ট ডায়ালগ থেকে "Save as PDF" নির্বাচন করুন।','info');
  setTimeout(printReport, 400);
}

function exportExcel() {
  const title=currentReportTitle||'report';
  const body=document.getElementById('reportResult');
  const tables=body.querySelectorAll('table');
  if(!tables.length){ toast('রিপোর্ট আগে লোড করুন।','warning'); return; }
  if (!requireXLSX()) return;
  const org=S.company?.name||"Challengers of 90's";
  const today=new Date().toISOString().slice(0,10);
  const wb = XLSX.utils.book_new();
  const rows = [[org], [title], [`Date: ${today}`], []];
  tables.forEach((tbl, index)=>{
    const ths=[...tbl.querySelectorAll('thead th')].map(th=>th.textContent.trim());
    if(ths.length) rows.push(ths);
    tbl.querySelectorAll('tbody tr').forEach(tr=>{
      const tds=[...tr.querySelectorAll('td')].map(td=>td.textContent.trim());
      if(tds.length) rows.push(tds);
    });
    if (index < tables.length - 1) rows.push([]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${title.replace(/[^\w]+/g,'_')}_${today}.xlsx`);
  toast(t('xlsxDownloaded'), 'success');
}

