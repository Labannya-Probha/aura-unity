/* Aura Unity Financial Statements v1
 * Posted-journal-only, tenant-aware financial reporting layer.
 */
(function () {
  'use strict';

  const money = (n) => `৳ ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const num = (n) => Number(n || 0);
  const range = () => ({
    from: document.getElementById('rptFromDate')?.value || '',
    to: document.getElementById('rptToDate')?.value || new Date().toISOString().slice(0, 10),
  });
  const escText = (v) => typeof esc === 'function' ? esc(v) : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dash = () => typeof rptDash === 'function' ? rptDash() : '—';

  function posted(row) {
    return (row?.journals?.status || '').toLowerCase() === 'posted';
  }

  function normalizeGroup(row) {
    const raw = String(row?.coa?.account_group || row?.coa?.group || '').toLowerCase();
    if (raw.includes('asset')) return 'Asset';
    if (raw.includes('liabil')) return 'Liability';
    if (raw.includes('equity') || raw.includes('fund') || raw.includes('capital')) return 'Equity';
    if (raw.includes('income') || raw.includes('revenue')) return 'Income';
    if (raw.includes('expense') || raw.includes('expenditure') || raw.includes('cost')) return 'Expense';
    return 'Other';
  }

  function accountName(row) {
    return row?.coa?.account_name || row?.account_name || row?.account_code || 'Unmapped Account';
  }

  function accountCode(row) { return row?.account_code || row?.coa?.account_code || ''; }

  function subtype(row) {
    return String(row?.coa?.statement_subgroup || row?.coa?.account_type || row?.coa?.sub_type || '').trim();
  }

  function inPeriod(date, from, to) {
    if (!date) return false;
    const d = String(date).slice(0, 10);
    return (!from || d >= from) && (!to || d <= to);
  }

  function before(date, target) {
    if (!date || !target) return false;
    return String(date).slice(0, 10) < target;
  }

  async function getRows() {
    const result = await readJournalItemsWithContext((from) => from.select(
      'journal_id,account_code,debit,credit,description,journals!inner(journal_date,status,ref_no,narration),coa(account_code,account_name,account_group,account_type,statement_subgroup,cash_flow_category,normal_balance)'
    ));
    if (result?.error) throw result.error;
    return (result?.data || []).filter(posted);
  }

  function summarize(rows, predicate) {
    const map = new Map();
    rows.filter(predicate).forEach(row => {
      const code = accountCode(row);
      if (!map.has(code)) map.set(code, { code, name: accountName(row), group: normalizeGroup(row), subtype: subtype(row), debit: 0, credit: 0 });
      const item = map.get(code);
      item.debit += num(row.debit);
      item.credit += num(row.credit);
    });
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  function accountBalance(item) {
    if (['Liability', 'Equity', 'Income'].includes(item.group)) return item.credit - item.debit;
    return item.debit - item.credit;
  }

  function sectionRow(label) {
    return { cells: [{ val: label, color: '#0F1F3D' }, { val: '' }, { val: '' }], _section: true, _bold: true };
  }

  function statementShell(title, subtitle, content, validationHtml = '') {
    const tenant = window.S?.company?.name || 'Aura Unity';
    const generated = new Date().toLocaleString('en-GB');
    return `<div class="fs-v1-report">
      <div class="fs-v1-head">
        <div><div class="fs-v1-company">${escText(tenant)}</div><h2>${escText(title)}</h2><p>${escText(subtitle)}</p></div>
        <div class="fs-v1-status">POSTED ENTRIES ONLY</div>
      </div>
      <div class="fs-v1-body">${content}${validationHtml}</div>
      <div class="fs-v1-meta"><span>Generated: ${escText(generated)}</span><span>Prepared by: ${escText(typeof getCurrentUserName === 'function' ? getCurrentUserName() : 'System User')}</span></div>
    </div>`;
  }

  async function buildTrialBalanceV1() {
    const { from, to } = range();
    const rows = await getRows();
    const opening = summarize(rows, r => from && before(r.journals?.journal_date, from));
    const current = summarize(rows, r => inPeriod(r.journals?.journal_date, from, to));
    const codes = [...new Set([...opening, ...current].map(x => x.code))].sort();
    const om = Object.fromEntries(opening.map(x => [x.code, x]));
    const cm = Object.fromEntries(current.map(x => [x.code, x]));
    let totalOpenDr = 0, totalOpenCr = 0, totalDr = 0, totalCr = 0, totalCloseDr = 0, totalCloseCr = 0;
    const tableRows = codes.map(code => {
      const base = cm[code] || om[code];
      const openNet = om[code] ? accountBalance(om[code]) : 0;
      const openDr = openNet > 0 ? openNet : 0, openCr = openNet < 0 ? Math.abs(openNet) : 0;
      const dr = cm[code]?.debit || 0, cr = cm[code]?.credit || 0;
      const closingNet = openDr - openCr + dr - cr;
      const closeDr = closingNet > 0 ? closingNet : 0, closeCr = closingNet < 0 ? Math.abs(closingNet) : 0;
      totalOpenDr += openDr; totalOpenCr += openCr; totalDr += dr; totalCr += cr; totalCloseDr += closeDr; totalCloseCr += closeCr;
      return { cells: [
        { val: code, color: '#647188' }, { val: base.name }, { val: base.group, color: '#647188' },
        { val: openDr ? money(openDr) : dash() }, { val: openCr ? money(openCr) : dash() },
        { val: dr ? money(dr) : dash(), color: dr ? '#1A7A4A' : '#BCC5D4' }, { val: cr ? money(cr) : dash(), color: cr ? '#C0392B' : '#BCC5D4' },
        { val: closeDr ? money(closeDr) : dash() }, { val: closeCr ? money(closeCr) : dash() }
      ]};
    });
    if (!tableRows.length) tableRows.push({ cells: [{val:'—'},{val:'No posted journal activity'},{val:'—'},{val:dash()},{val:dash()},{val:dash()},{val:dash()},{val:money(0)},{val:money(0)}] });
    const diff = Math.abs(totalCloseDr - totalCloseCr);
    const validation = `<div class="fs-v1-validation ${diff < 0.01 ? 'ok' : 'bad'}"><span>${diff < 0.01 ? '✓ Trial Balance agrees' : '✗ Trial Balance difference detected'}</span><strong>${money(diff)}</strong></div>`;
    return statementShell('Trial Balance', `${from || 'Beginning'} to ${to}`, rptTable(
      ['Code','Account','Group','Opening Dr','Opening Cr','Period Dr','Period Cr','Closing Dr','Closing Cr'], tableRows,
      ['','TOTAL','',money(totalOpenDr),money(totalOpenCr),money(totalDr),money(totalCr),money(totalCloseDr),money(totalCloseCr)]
    ), validation);
  }

  function classifyIncomeExpense(item) {
    const text = `${item.subtype} ${item.name}`.toLowerCase();
    if (item.group === 'Income') {
      if (/other|interest|gain|misc/.test(text)) return 'Other Income';
      return 'Operating Revenue';
    }
    if (/cost of|direct cost|cogs|purchase/.test(text)) return 'Cost of Revenue';
    if (/finance|interest|bank charge/.test(text)) return 'Finance Cost';
    if (/tax/.test(text)) return 'Tax Expense';
    if (/depreciation|amortization/.test(text)) return 'Depreciation & Amortization';
    return 'Operating Expenses';
  }

  async function buildIncomeStatementV1() {
    const { from, to } = range();
    const rows = await getRows();
    const accounts = summarize(rows, r => inPeriod(r.journals?.journal_date, from, to) && ['Income','Expense'].includes(normalizeGroup(r)));
    const sections = {};
    accounts.forEach(a => {
      const key = classifyIncomeExpense(a);
      (sections[key] ||= []).push({ ...a, amount: accountBalance(a) });
    });
    const total = key => (sections[key] || []).reduce((s, x) => s + x.amount, 0);
    const revenue = total('Operating Revenue');
    const cost = total('Cost of Revenue');
    const gross = revenue - cost;
    const otherIncome = total('Other Income');
    const opex = total('Operating Expenses');
    const da = total('Depreciation & Amortization');
    const finance = total('Finance Cost');
    const tax = total('Tax Expense');
    const netProfit = gross + otherIncome - opex - da - finance - tax;
    const out = [];
    const addSection = (label, key, sign = 1) => {
      out.push(sectionRow(label));
      const list = sections[key] || [];
      if (!list.length) out.push({ cells: [{val:'No mapped accounts',color:'#94A3B8'},{val:''},{val:money(0),color:'#94A3B8'}], _indent:1 });
      list.forEach(x => out.push({ cells: [{val:x.code,color:'#647188'},{val:x.name},{val:money(Math.abs(x.amount)),color:sign > 0 ? '#1A7A4A' : '#C0392B'}], _indent:1 }));
    };
    addSection('OPERATING REVENUE', 'Operating Revenue', 1);
    out.push({cells:[{val:''},{val:'Total Operating Revenue',color:'#1A7A4A'},{val:money(revenue),color:'#1A7A4A'}],_bold:true});
    addSection('COST OF REVENUE', 'Cost of Revenue', -1);
    out.push({cells:[{val:''},{val:'GROSS PROFIT',color:'#1558B0'},{val:money(gross),color:gross>=0?'#1558B0':'#C0392B'}],_bold:true});
    addSection('OTHER INCOME', 'Other Income', 1);
    addSection('OPERATING EXPENSES', 'Operating Expenses', -1);
    addSection('DEPRECIATION & AMORTIZATION', 'Depreciation & Amortization', -1);
    addSection('FINANCE COST', 'Finance Cost', -1);
    addSection('TAX EXPENSE', 'Tax Expense', -1);
    out.push({cells:[{val:''},{val:netProfit>=0?'NET SURPLUS / PROFIT':'NET DEFICIT / LOSS',color:netProfit>=0?'#135A36':'#C0392B'},{val:money(Math.abs(netProfit)),color:netProfit>=0?'#135A36':'#C0392B'}],_bold:true});
    return statementShell('Income Statement', `For the period ${from || 'Beginning'} to ${to}`, rptTable(['Code','Particulars','Amount (BDT)'], out, null));
  }

  function bsSection(item) {
    const text = `${item.subtype} ${item.name}`.toLowerCase();
    if (item.group === 'Asset') return /cash|bank|receivable|inventory|advance|current/.test(text) ? 'Current Assets' : 'Non-current Assets';
    if (item.group === 'Liability') return /payable|accrual|short|current|tax/.test(text) ? 'Current Liabilities' : 'Non-current Liabilities';
    return 'Equity / Fund';
  }

  async function buildBalanceSheetV1() {
    const { to } = range();
    const rows = await getRows();
    const accounts = summarize(rows, r => String(r.journals?.journal_date || '').slice(0,10) <= to);
    const groups = {'Current Assets':[],'Non-current Assets':[],'Current Liabilities':[],'Non-current Liabilities':[],'Equity / Fund':[]};
    let retained = 0;
    accounts.forEach(a => {
      const balance = accountBalance(a);
      if (['Income','Expense'].includes(a.group)) { retained += a.group === 'Income' ? balance : -balance; return; }
      if (['Asset','Liability','Equity'].includes(a.group)) groups[bsSection(a)].push({...a,amount:balance});
    });
    groups['Equity / Fund'].push({code:'',name:'Current Period Surplus / (Deficit)',amount:retained});
    const sum = k => groups[k].reduce((s,x)=>s+x.amount,0);
    const currentAssets=sum('Current Assets'), nonCurrentAssets=sum('Non-current Assets'), totalAssets=currentAssets+nonCurrentAssets;
    const currentLiab=sum('Current Liabilities'), nonCurrentLiab=sum('Non-current Liabilities'), equity=sum('Equity / Fund');
    const totalLE=currentLiab+nonCurrentLiab+equity;
    const out=[];
    Object.entries(groups).forEach(([label,list])=>{
      out.push(sectionRow(label.toUpperCase()));
      if(!list.length) out.push({cells:[{val:''},{val:'No mapped accounts',color:'#94A3B8'},{val:money(0),color:'#94A3B8'}],_indent:1});
      list.forEach(x=>out.push({cells:[{val:x.code,color:'#647188'},{val:x.name},{val:money(x.amount),color:x.amount>=0?'#0B1629':'#C0392B'}],_indent:1}));
      out.push({cells:[{val:''},{val:`Total ${label}`,color:'#1558B0'},{val:money(sum(label)),color:'#1558B0'}],_bold:true});
    });
    const diff=Math.abs(totalAssets-totalLE);
    const validation=`<div class="fs-v1-validation ${diff<0.01?'ok':'bad'}"><span>${diff<0.01?'✓ Assets equal Liabilities and Equity':'✗ Statement of Financial Position does not balance'}</span><strong>${money(diff)}</strong></div>`;
    const kpis=`<div class="fs-v1-kpis"><div><span>Total Assets</span><strong>${money(totalAssets)}</strong></div><div><span>Total Liabilities</span><strong>${money(currentLiab+nonCurrentLiab)}</strong></div><div><span>Total Equity/Fund</span><strong>${money(equity)}</strong></div></div>`;
    return statementShell('Statement of Financial Position', `As at ${to}`, kpis+rptTable(['Code','Particulars','Amount (BDT)'],out,null),validation);
  }

  function cashCategory(row, item) {
    const explicit = String(row?.coa?.cash_flow_category || '').toLowerCase();
    if (explicit.includes('invest')) return 'Investing Activities';
    if (explicit.includes('financ')) return 'Financing Activities';
    if (explicit.includes('operat')) return 'Operating Activities';
    const text = `${item.name} ${item.subtype}`.toLowerCase();
    if (/fixed asset|property|plant|equipment|investment|asset disposal/.test(text)) return 'Investing Activities';
    if (/loan|borrow|capital|equity|fund contribution|dividend/.test(text)) return 'Financing Activities';
    return 'Operating Activities';
  }

  async function buildCashFlowV1() {
    const { from, to } = range();
    const rows = await getRows();
    const periodRows=rows.filter(r=>inPeriod(r.journals?.journal_date,from,to));
    const cashRows=periodRows.filter(r=>/cash|bank/.test(`${accountName(r)} ${subtype(r)}`.toLowerCase()));
    const byJournal=new Map();
    periodRows.forEach(r=>{ if(!byJournal.has(r.journal_id))byJournal.set(r.journal_id,[]); byJournal.get(r.journal_id).push(r); });
    const sections={'Operating Activities':new Map(),'Investing Activities':new Map(),'Financing Activities':new Map()};
    cashRows.forEach(cash=>{
      const cashMovement=num(cash.debit)-num(cash.credit);
      const counterparts=(byJournal.get(cash.journal_id)||[]).filter(x=>x!==cash && !/cash|bank/.test(`${accountName(x)} ${subtype(x)}`.toLowerCase()));
      if(!counterparts.length)return;
      const per=cashMovement/counterparts.length;
      counterparts.forEach(cp=>{
        const item={name:accountName(cp),subtype:subtype(cp)};
        const cat=cashCategory(cp,item);
        sections[cat].set(item.name,(sections[cat].get(item.name)||0)+per);
      });
    });
    const out=[]; let net=0;
    Object.entries(sections).forEach(([label,map])=>{
      out.push(sectionRow(label.toUpperCase()));
      if(!map.size)out.push({cells:[{val:''},{val:'No classified cash movements',color:'#94A3B8'},{val:money(0),color:'#94A3B8'}],_indent:1});
      let subtotal=0;
      [...map.entries()].sort().forEach(([name,amount])=>{subtotal+=amount;out.push({cells:[{val:''},{val:name},{val:money(amount),color:amount>=0?'#1A7A4A':'#C0392B'}],_indent:1});});
      net+=subtotal;
      out.push({cells:[{val:''},{val:`Net cash from ${label}`,color:'#1558B0'},{val:money(subtotal),color:subtotal>=0?'#1558B0':'#C0392B'}],_bold:true});
    });
    const openingCash=rows.filter(r=>from && before(r.journals?.journal_date,from) && /cash|bank/.test(`${accountName(r)} ${subtype(r)}`.toLowerCase())).reduce((s,r)=>s+num(r.debit)-num(r.credit),0);
    const closing=openingCash+net;
    out.push({cells:[{val:''},{val:'Opening cash and cash equivalents'},{val:money(openingCash)}],_bold:true});
    out.push({cells:[{val:''},{val:'Net increase / (decrease) in cash'},{val:money(net),color:net>=0?'#1A7A4A':'#C0392B'}],_bold:true});
    out.push({cells:[{val:''},{val:'Closing cash and cash equivalents',color:'#0F1F3D'},{val:money(closing),color:'#0F1F3D'}],_bold:true});
    return statementShell('Statement of Cash Flows', `For the period ${from || 'Beginning'} to ${to}`, rptTable(['Code','Particulars','Amount (BDT)'],out,null));
  }

  const originalLoadReport = window.loadReport;
  window.loadReport = async function(name) {
    if (!['trial_v1','income_v1','balance_v1','cashflow_v1'].includes(name)) return originalLoadReport(name);
    const {from,to}=range();
    if(from&&to&&from>to){toast('From Date cannot be after To Date.','warning');return;}
    currentReportName=name;
    currentReportTitle={trial_v1:'Trial Balance',income_v1:'Income Statement',balance_v1:'Statement of Financial Position',cashflow_v1:'Statement of Cash Flows'}[name];
    const card=document.getElementById('reportCard'),result=document.getElementById('reportResult');
    card?.classList.remove('hidden');
    if(document.getElementById('rptTitle'))document.getElementById('rptTitle').textContent=currentReportTitle;
    if(document.getElementById('rptSubtitle'))document.getElementById('rptSubtitle').textContent=`${window.S?.company?.name||'Aura Unity'} | ${from||'Beginning'} to ${to}`;
    result.innerHTML='<div style="text-align:center;padding:44px">Loading financial statement…</div>';
    try{
      if(name==='trial_v1')result.innerHTML=await buildTrialBalanceV1();
      if(name==='income_v1')result.innerHTML=await buildIncomeStatementV1();
      if(name==='balance_v1')result.innerHTML=await buildBalanceSheetV1();
      if(name==='cashflow_v1')result.innerHTML=await buildCashFlowV1();
      card?.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){console.error(error);result.innerHTML=`<div class="alert alert-danger"><strong>Report could not be generated.</strong><br>${escText(error.message||error)}</div>`;}
  };

  window.buildTrialBalanceV1=buildTrialBalanceV1;
  window.buildIncomeStatementV1=buildIncomeStatementV1;
  window.buildBalanceSheetV1=buildBalanceSheetV1;
  window.buildCashFlowV1=buildCashFlowV1;
})();
