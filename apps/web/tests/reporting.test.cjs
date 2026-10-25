const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '../../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const sql = read('supabase/migrations/20261024010000_correct_reporting_returns.sql');
const old = read('supabase/migrations/20260916021811_harden_reporting_rbac.sql');
const section = (s,a,b) => s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));

const ts = require('typescript');
const vm = require('node:vm');
const presentationModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('apps/web/lib/reporting-presentation.ts'), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: presentationModule, exports: presentationModule.exports });
const { formatGrossMargin } = presentationModule.exports;

test('positive revenue retains existing margin percentage, including losses and zero profit', () => {
 assert.equal(formatGrossMargin(33.333, 100), '33.3%');
 assert.equal(formatGrossMargin(-12.5, 100), '-12.5%');
 assert.equal(formatGrossMargin(0, 100), '0.0%');
});
test('zero revenue displays N/A regardless of computed percentage', () => {
 for (const margin of [0, 100, -100]) assert.equal(formatGrossMargin(margin, 0), 'N/A');
});
test('negative revenue suppresses misleading live UAT margin percentages', () => {
 for (const [margin, revenue] of [[99.6,-91792],[87.5,-2100],[97.3,-4692],[100,-85000]]) {
  assert.equal(formatGrossMargin(margin, revenue), 'N/A');
 }
 assert.equal(formatGrossMargin(null, 100), 'N/A');
 assert.equal(formatGrossMargin(undefined, 100), 'N/A');
});
test('every Dashboard and Reports margin uses its own revenue denominator', () => {
 for (const [page, expected] of [['dashboard',3],['reports',4]]) {
  const source=read(`apps/web/app/(app)/${page}/page.tsx`);
  const calls=[...source.matchAll(/formatGrossMargin\(([^,]+),\s*([^\)]+)\)/g)];
  assert.equal(calls.length,expected);
  for (const [,margin,revenue] of calls) {
   const owner=margin.trim().replace(/\.gross_margin$/,'');
   assert.equal(revenue.trim(),`${owner}.${owner==='product'?'revenue':'net_sales'}`);
  }
  assert.doesNotMatch(source,/formatPercent\(/);
  assert.match(source,/canViewFinance \? \(/);
  assert.match(source,/Boolean\(report\?\.access.can_view_finance\)/);
 }
});

test('authentication, scope checks, UK boundaries and redaction are retained verbatim', () => {
 for(const [a,b] of [['  -- AUTHENTICATION','  -- SALES SUMMARY'],['  return jsonb_build_object(','end;\n$$;']]) assert.equal(section(sql,a,b),section(old,a,b));
 assert.match(sql,/security definer\nset search_path = public/);
 assert.match(sql,/revoke all on function public.get_business_report\(uuid,date,date,uuid\) from public/);
 assert.match(sql,/grant execute on function public.get_business_report\(uuid,date,date,uuid\) to authenticated/);
 assert.doesNotMatch(sql,/\b(?:insert into|update public|delete from|sum\(distinct)\b/i);
});
test('all four cost projections depend on restock, independently of refund method', () => {
 assert.equal((sql.match(/case when (?:ri\.)?restock then/g)||[]).length,4);
 assert.match(sql,/s.status in \('COMPLETED', 'REFUNDED'\)/);
});
test('daily and branch refunds aggregate one header with a scalar cost subquery', () => {
 for(const name of ['daily_returns','branch_returns']) {
 const b=section(sql,`  ${name} as (`,'    group by');
 assert.match(b,/sum\(case when r.refund_method = 'NO_REFUND' then 0 else r.refund_amount end\)/);
 assert.match(b,/cross join lateral/); assert.match(b,/where ri.return_id=r.id/);
 }
});
test('product allocation uses actual refund with penny remainder; return-only rows are retained', () => {
 assert.match(sql,/when r.refund_method='NO_REFUND' then 0 else r.refund_amount/);
 assert.match(sql,/actual_refund -\s*other_shares/);
 assert.match(sql,/full join product_returns/); assert.match(sql,/full join branch_returns/);
 assert.doesNotMatch(sql,/limit 10/);
});
test('current inventory and payable calculations are unchanged', () => {
 assert.equal(section(sql,'  -- CURRENT INVENTORY POSITION','  -- DAILY SALES TREND'),section(old,'  -- CURRENT INVENTORY POSITION','  -- DAILY SALES TREND'));
});
test('chart keeps signed positions and scales absolute magnitudes without changing report data', () => {
 const ui=read('apps/web/app/(app)/reports/page.tsx');
 assert.match(ui,/Math.abs\(Number\(point.net_sales\)\)/);
 assert.match(ui,/Math.abs\(profitValue\)/);
 assert.match(ui,/top: Number\(point.net_sales\) < 0 \? "50%"/);
 assert.match(ui,/top: profitValue < 0 \? "50%"/);
 assert.match(ui,/Values below the centre line are negative/);
});

// Real PostgreSQL test, opt-in only against an EMPTY disposable local database.
// Helpers model permission decisions; deployed RBAC still requires role UAT.
const database=process.env.ALPHAPOS_REPORT_TEST_DATABASE_URL;
test('PostgreSQL reporting scenarios, reconciliation, scope and redaction', {skip:!database}, () => {
 const url=new URL(database);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 assert.match(url.pathname,/^\/alphapos_report_test_[a-z0-9_]+$/);
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:url.pathname.slice(1),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGCONNECT_TIMEOUT:'5'};
 function run(input) {
 const r=spawnSync(process.env.ALPHAPOS_PSQL||'psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{input,env,encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0,'Disposable PostgreSQL fixture failed (credentials and server diagnostics suppressed)'); return r.stdout.trim();
 }
 assert.equal(run("select count(*) from pg_tables where schemaname in ('public','auth')"),'0');
 const o='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222', w='33333333-3333-4333-8333-333333333333', p='44444444-4444-4444-8444-444444444444';
 const fixture=`begin;
 create schema auth;
 create function auth.uid() returns uuid language sql as $$select '${o}'::uuid$$;
 do $$begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end$$;
 create function public.has_permission(text,uuid,uuid) returns boolean language sql as $$select $2='${o}'::uuid and (current_setting('test.branch',true)='all' or $3::text=current_setting('test.branch',true)) and ($1='reports.view' or current_setting('test.finance',true)='yes')$$;
 create table branches(id uuid,organization_id uuid,name text);
 create table products(id uuid,name text,sku text);
 create table sales(id uuid,organization_id uuid,branch_id uuid,status text,total_amount numeric,discount_amount numeric,vat_amount numeric,completed_at timestamptz);
 create table sale_items(id uuid,sale_id uuid,product_id uuid,quantity integer,unit_cost numeric,line_total numeric);
 create table returns(id uuid,organization_id uuid,branch_id uuid,status text,refund_method text,refund_amount numeric,completed_at timestamptz,created_at timestamptz);
 create table return_items(id uuid,return_id uuid,sale_item_id uuid,product_id uuid,quantity integer,line_refund_amount numeric,restock boolean);
 create table inventory(organization_id uuid,branch_id uuid,quantity_on_hand numeric,average_cost numeric);
 create table supplier_invoices(organization_id uuid,branch_id uuid,total_amount numeric,amount_paid numeric,amount_due numeric generated always as(total_amount-amount_paid) stored,status text,due_date date);
 insert into branches values('${b}','${o}','Main'),('${w}','${o}','West');
 insert into products values('${p}','Phone','P');
 insert into sales values('${o}','${o}','${w}','REFUNDED',300,0,0,'2026-07-01 12:00Z');
 insert into sale_items values('${o}','${o}','${p}',3,60,300);
 insert into returns values('${o}','${o}','${w}','COMPLETED','CASH',100,'2026-07-02 12:00Z',null),('${b}','${o}','${w}','COMPLETED','CASH',100,'2026-07-02 12:00Z',null);
 insert into return_items values('${o}','${o}','${o}','${p}',1,50,true),('${b}','${o}','${o}','${p}',1,50,false),('${w}','${b}','${o}','${p}',1,100,false);
 insert into supplier_invoices values('${o}','${w}',100,40,default,'PARTIALLY_PAID','2026-01-01');
 set test.branch='all'; set test.finance='yes';
 ${sql}
 create function pg_temp.check_report() returns void language plpgsql as $$declare r jsonb; d jsonb; begin
 r:=get_business_report('${o}','2026-07-02','2026-07-02',null);
 if (r#>>'{summary,refunds}')::numeric<>200 or (r#>>'{summary,returned_cogs}')::numeric<>60 then raise exception 'refund/restock calculation'; end if;
 if (r#>>'{summary,net_sales}')::numeric<>-200 or (r#>>'{summary,gross_profit}')::numeric<>-140 then raise exception 'return-only summary'; end if;
 if (r#>>'{sales_trend,0,refunds}')::numeric<>200 or (r#>>'{branch_performance,0,net_sales}')::numeric<>-200 or (r#>>'{top_products,0,revenue}')::numeric<>-200 then raise exception 'breakdown reconciliation'; end if;
 if (r#>>'{top_products,0,cogs}')::numeric<>-60 or (r#>>'{branch_performance,0,cogs}')::numeric<>-60 then raise exception 'cost reconciliation'; end if;
 if (r#>>'{business_position,supplier_outstanding}')::numeric<>60 then raise exception 'partial payment'; end if;
 r:=get_business_report('${o}','2026-07-01','2026-07-02',null);
 if (r#>>'{summary,gross_sales}')::numeric<>300 then raise exception 'REFUNDED historical gross'; end if;
 update returns set refund_method='NO_REFUND',refund_amount=0;
 r:=get_business_report('${o}','2026-07-02','2026-07-02',null);
 if (r#>>'{summary,refunds}')::numeric<>0 or (r#>>'{top_products,0,revenue}')::numeric<>0 or (r#>>'{summary,returned_cogs}')::numeric<>60 then raise exception 'NO_REFUND mixed restock'; end if;
 update return_items set restock=false;
 r:=get_business_report('${o}','2026-07-02','2026-07-02',null);
 if (r#>>'{summary,gross_profit}')::numeric<>0 then raise exception 'NO_REFUND no restock'; end if;
 update supplier_invoices set amount_paid=100,status='PAID';
 r:=get_business_report('${o}','2026-07-02','2026-07-02',null);
 if (r#>>'{business_position,supplier_outstanding}')::numeric<>0 then raise exception 'full payment'; end if;
 perform set_config('test.finance','no',true);
 r:=get_business_report('${o}','2026-07-02','2026-07-02',null);
 if r#>>'{summary,gross_profit}' is not null or (r->'top_products'->0) ? 'cogs' or r#>>'{business_position,supplier_outstanding}' is not null then raise exception 'redaction'; end if;
 perform set_config('test.branch','${b}',true);
 begin perform get_business_report('${o}','2026-07-02','2026-07-02','${w}'); raise exception 'allowed wrong branch'; exception when raise_exception then if sqlerrm='allowed wrong branch' then raise; end if; end;
 begin perform get_business_report('${o}','2026-07-02','2026-07-02',null); raise exception 'allowed consolidated'; exception when raise_exception then if sqlerrm='allowed consolidated' then raise; end if; end;
 begin perform get_business_report('${w}','2026-07-02','2026-07-02','${b}'); raise exception 'allowed wrong org'; exception when raise_exception then if sqlerrm='allowed wrong org' then raise; end if; end;
 perform set_config('test.branch','all',true);
 update sales set completed_at='2026-07-01 23:00Z';
 r:=get_business_report('${o}','2026-07-02','2026-07-02',null);
 if (r#>>'{summary,gross_sales}')::numeric<>300 then raise exception 'BST midnight'; end if;
 update sales set completed_at='2026-07-01 22:59:59Z';
 r:=get_business_report('${o}','2026-07-02','2026-07-02',null);
 if (r#>>'{summary,gross_sales}')::numeric<>0 then raise exception 'BST previous day'; end if;
 end$$;
 select pg_temp.check_report(); rollback;`;
 run(fixture);
});
