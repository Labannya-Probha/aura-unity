window.receivableService = window.receivableService || {
  async tenantId() { return getTenantId(); },
  async customers() {
    const tenantId = await getTenantId();
    return sb.from('ar_customers').select('*').eq('tenant_id', tenantId).order('name');
  },
  async invoices(limit = 100) {
    const tenantId = await getTenantId();
    return sb.from('ar_invoices').select('*,ar_customers(customer_code,name)').eq('tenant_id', tenantId).order('invoice_date',{ascending:false}).limit(limit);
  },
  async nextCustomerCode() {
    const tenantId = await getTenantId();
    const {data,error}=await sb.rpc('next_ar_customer_code',{p_tenant_id:tenantId});
    if(error) throw error; return data;
  },
  async nextInvoiceNo(type='invoice') {
    const tenantId = await getTenantId();
    const {data,error}=await sb.rpc('next_ar_invoice_number',{p_tenant_id:tenantId,p_invoice_type:type});
    if(error) throw error; return data;
  },
  async createCustomer(payload) {
    const tenantId = await getTenantId();
    return sb.from('ar_customers').insert({...payload,tenant_id:tenantId}).select().single();
  },
  async createInvoice(header,line) {
    const tenantId = await getTenantId();
    const {data:invoice,error}=await sb.from('ar_invoices').insert({...header,tenant_id:tenantId}).select().single();
    if(error) return {data:null,error};
    const linePayload={...line,tenant_id:tenantId,invoice_id:invoice.id,line_no:1};
    const {error:lineError}=await sb.from('ar_invoice_lines').insert(linePayload);
    if(lineError){await sb.from('ar_invoices').delete().eq('id',invoice.id);return {data:null,error:lineError};}
    return {data:invoice,error:null};
  }
};
