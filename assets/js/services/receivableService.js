window.receivableService = window.receivableService || {
  async tenantId(){ return getTenantId(); },
  async customers(){ const tenantId=await getTenantId(); return sb.from('ar_customers').select('*').eq('tenant_id',tenantId).order('name'); },
  async invoices(limit=200){ const tenantId=await getTenantId(); return sb.from('ar_invoices').select('*,ar_customers(customer_code,name)').eq('tenant_id',tenantId).order('invoice_date',{ascending:false}).limit(limit); },
  async receipts(limit=200){ const tenantId=await getTenantId(); return sb.from('ar_receipt_register').select('*').eq('tenant_id',tenantId).order('receipt_date',{ascending:false}).limit(limit); },
  async aging(){ const tenantId=await getTenantId(); return sb.from('ar_aging_summary').select('*').eq('tenant_id',tenantId).order('total_outstanding',{ascending:false}); },
  async statement(customerId){ const tenantId=await getTenantId(); return sb.from('ar_customer_statement').select('*').eq('tenant_id',tenantId).eq('customer_id',customerId).order('transaction_date'); },
  async nextCustomerCode(){ const tenantId=await getTenantId(); const {data,error}=await sb.rpc('next_ar_customer_code',{p_tenant_id:tenantId}); if(error)throw error; return data; },
  async nextInvoiceNo(type='invoice'){ const tenantId=await getTenantId(); const {data,error}=await sb.rpc('next_ar_invoice_number',{p_tenant_id:tenantId,p_invoice_type:type}); if(error)throw error; return data; },
  async createCustomer(payload){ const tenantId=await getTenantId(); return sb.from('ar_customers').insert({...payload,tenant_id:tenantId}).select().single(); },
  async createInvoice(header,line){
    const tenantId=await getTenantId();
    const {data:invoice,error}=await sb.from('ar_invoices').insert({...header,tenant_id:tenantId}).select().single();
    if(error)return {data:null,error};
    const {error:lineError}=await sb.from('ar_invoice_lines').insert({...line,tenant_id:tenantId,invoice_id:invoice.id,line_no:1});
    if(lineError){await sb.from('ar_invoices').delete().eq('id',invoice.id);return {data:null,error:lineError};}
    return {data:invoice,error:null};
  },
  async changeStatus(invoiceId,action,remarks=''){ return sb.rpc('ar_change_invoice_status',{p_invoice_id:invoiceId,p_action:action,p_remarks:remarks||null}); },
  async receivePayment({customerId,amount,paymentMode='cash',referenceNo='',invoiceId=null,receiptDate=null,remarks=''}){
    return sb.rpc('ar_create_receipt_and_allocate',{p_customer_id:customerId,p_amount:Number(amount),p_payment_mode:paymentMode,p_reference_no:referenceNo||null,p_invoice_id:invoiceId||null,p_receipt_date:receiptDate||new Date().toISOString().slice(0,10),p_remarks:remarks||null});
  }
};
