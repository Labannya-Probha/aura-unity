-- ============================================================
-- AURA UNITY — CREATE SANDBOX TENANT
-- Creates a separate test tenant using existing Auth users:
--   superuser@app.local => superuser/approver
--   shahin@app.local    => user/maker
--
-- Existing production data is not modified.
-- Run in Supabase SQL Editor as database owner.
-- ============================================================

do $$
declare
  v_source_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_tenant_id uuid;
  v_superuser_id uuid;
  v_user_id uuid;
  v_fiscal_year_id uuid;
  v_month date;
begin
  select id into v_superuser_id
  from auth.users
  where lower(email) = 'superuser@app.local'
  limit 1;

  select id into v_user_id
  from auth.users
  where lower(email) = 'shahin@app.local'
  limit 1;

  if v_superuser_id is null then
    raise exception 'Auth user superuser@app.local was not found';
  end if;

  if v_user_id is null then
    raise exception 'Auth user shahin@app.local was not found';
  end if;

  select id into v_tenant_id
  from public.tenants
  where slug = 'aura-unity-sandbox'
  limit 1;

  if v_tenant_id is null then
    insert into public.tenants(name, slug, created_by)
    values(
      'Aura Unity Sandbox',
      'aura-unity-sandbox',
      v_superuser_id
    )
    returning id into v_tenant_id;
  end if;

  -- Tenant memberships
  insert into public.tenant_members(
    tenant_id, user_id, role, status, is_active
  )
  values
    (v_tenant_id, v_superuser_id, 'superuser', 'active', true),
    (v_tenant_id, v_user_id, 'user', 'active', true)
  on conflict (tenant_id, user_id)
  do update set
    role = excluded.role,
    status = 'active',
    is_active = true;

  -- Company branding/settings
  insert into public.company_info(
    tenant_id, setting_key, setting_value, updated_at
  )
  values
    (v_tenant_id, 'name', 'Aura Unity Sandbox', now()),
    (v_tenant_id, 'sub', 'Accounting Workflow Test Environment', now()),
    (v_tenant_id, 'address', 'Test Environment — No Production Data', now()),
    (v_tenant_id, 'phone', '', now()),
    (v_tenant_id, 'logo', '', now())
  on conflict (tenant_id, setting_key)
  do update set
    setting_value = excluded.setting_value,
    updated_at = now();

  -- Copy COA structure only. Opening balances are reset to zero.
  insert into public.coa(
    account_code,
    account_name,
    account_group,
    account_type,
    opening_balance,
    tenant_id,
    parent_account_code,
    normal_balance,
    account_subtype,
    is_control_account,
    allow_direct_posting,
    financial_statement,
    cash_flow_group,
    sort_order,
    is_active,
    created_by,
    updated_by
  )
  select
    c.account_code,
    c.account_name,
    c.account_group,
    c.account_type,
    0,
    v_tenant_id,
    c.parent_account_code,
    c.normal_balance,
    c.account_subtype,
    c.is_control_account,
    c.allow_direct_posting,
    c.financial_statement,
    c.cash_flow_group,
    c.sort_order,
    c.is_active,
    v_superuser_id,
    v_superuser_id
  from public.coa c
  where c.tenant_id = v_source_tenant
    and not exists (
      select 1
      from public.coa x
      where x.tenant_id = v_tenant_id
        and x.account_code = c.account_code
    );

  -- Accounting settings: maker-checker approval enabled.
  insert into public.accounting_settings(
    tenant_id,
    base_currency,
    debit_credit_tolerance,
    require_journal_approval,
    enforce_posted_immutability,
    allow_soft_closed_adjustments,
    created_by,
    updated_by
  )
  values(
    v_tenant_id,
    'BDT',
    0.005,
    true,
    false,
    false,
    v_superuser_id,
    v_superuser_id
  )
  on conflict (tenant_id)
  do update set
    base_currency = 'BDT',
    require_journal_approval = true,
    enforce_posted_immutability = false,
    updated_at = now(),
    updated_by = v_superuser_id;

  -- July 2026 to June 2027 fiscal year
  select id into v_fiscal_year_id
  from public.fiscal_years
  where tenant_id = v_tenant_id
    and start_date = date '2026-07-01'
    and end_date = date '2027-06-30'
  limit 1;

  if v_fiscal_year_id is null then
    insert into public.fiscal_years(
      tenant_id, name, start_date, end_date, status, created_by
    )
    values(
      v_tenant_id,
      'FY 2026-2027',
      date '2026-07-01',
      date '2027-06-30',
      'open',
      v_superuser_id
    )
    returning id into v_fiscal_year_id;
  end if;

  -- Create 12 monthly open periods
  v_month := date '2026-07-01';
  while v_month <= date '2027-06-01' loop
    insert into public.accounting_periods(
      tenant_id,
      fiscal_year_id,
      period_name,
      start_date,
      end_date,
      status,
      created_by
    )
    select
      v_tenant_id,
      v_fiscal_year_id,
      to_char(v_month, 'YYYY-MM'),
      v_month,
      (v_month + interval '1 month - 1 day')::date,
      'open',
      v_superuser_id
    where not exists (
      select 1
      from public.accounting_periods p
      where p.tenant_id = v_tenant_id
        and p.start_date = v_month
    );

    v_month := (v_month + interval '1 month')::date;
  end loop;

  raise notice 'Sandbox tenant created: %', v_tenant_id;
end $$;

-- Verification
select id, name, slug, created_at
from public.tenants
where slug = 'aura-unity-sandbox';

select
  tm.tenant_id,
  u.email,
  tm.role,
  tm.status,
  tm.is_active
from public.tenant_members tm
join auth.users u on u.id = tm.user_id
join public.tenants t on t.id = tm.tenant_id
where t.slug = 'aura-unity-sandbox'
order by tm.role;

select count(*) as sandbox_coa_rows
from public.coa c
join public.tenants t on t.id = c.tenant_id
where t.slug = 'aura-unity-sandbox';

select
  fy.name,
  fy.start_date,
  fy.end_date,
  fy.status,
  count(ap.id) as period_count
from public.fiscal_years fy
left join public.accounting_periods ap on ap.fiscal_year_id = fy.id
join public.tenants t on t.id = fy.tenant_id
where t.slug = 'aura-unity-sandbox'
group by fy.id, fy.name, fy.start_date, fy.end_date, fy.status;
