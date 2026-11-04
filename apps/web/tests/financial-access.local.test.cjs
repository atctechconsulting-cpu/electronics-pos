// Opt-in real LOCAL Auth/JWT/PostgREST tests. Never reads hosted env files.
// Requires the financial migration already installed. Own UUID fixtures only.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID,randomBytes}=require('node:crypto');
const enabled=process.env.ALPHAPOS_LOCAL_FINANCE_TEST==='1';
const api='http://127.0.0.1:54331';
function sql(s){return execFileSync('docker',['exec','-i','supabase_db_electronics-pos','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
test('local Auth/JWT financial boundary and operational workflows',{skip:!enabled},async t=>{
 const status=JSON.parse(execFileSync('cmd.exe',['/d','/s','/c','supabase status -o json'],{cwd:require('node:path').resolve(__dirname,'../../..'),encoding:'utf8',stdio:['pipe','pipe','pipe']}));
 assert.equal(status.API_URL,api,'Only the fixed local API may be used');
 const admin=status.SERVICE_ROLE_KEY, anon=status.ANON_KEY;
 assert.ok(admin&&anon,'Local gateway credentials available');
 const org=randomUUID(),other=randomUUID(),branch=randomUUID(),west=randomUUID(),otherBranch=randomUUID(),product=randomUUID(),inv=randomUUID(),sale=randomUUID(),item=randomUUID(),movement=randomUUID(),supplier=randomUUID(),otherProduct=randomUUID();
 const users=[];const tokens={};
 async function req(path,token,body,method){const r=await fetch(api+path,{method:method??(body?'POST':'GET'),headers:{apikey:anon,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null)};}
 const rpc=(name,token,args)=>req('/rest/v1/rpc/'+name,token,args);
 const cost=(role,kind,ids=[product],b=branch,o=org)=>rpc('get_cost_projection',tokens[role],{p_organization_id:o,p_branch_id:b,p_kind:kind,p_ids:ids});
 try {
 for(const role of ['cashier','inventory_officer','branch_manager','accountant','super_admin']){
  const email='finance-'+randomUUID()+'@example.test',password=randomBytes(24).toString('hex');
  const created=await req('/auth/v1/admin/users',admin,{email,password,email_confirm:true});
  assert.equal(created.status,200,'Local test Auth user created');const id=created.data.id;users.push(id);
  const signed=await req('/auth/v1/token?grant_type=password',anon,{email,password});
  assert.equal(signed.status,200,'Local password sign-in succeeds');tokens[role]=signed.data.access_token;
 }
 sql('begin;'+
  "insert into organizations(id,name,slug) values ('"+org+"','LOCAL finance test','finance-"+org+"'),('"+other+"','LOCAL other test','finance-"+other+"');"+
  "insert into branches(id,organization_id,name,code) values ('"+branch+"','"+org+"','Main','MAIN'),('"+west+"','"+org+"','West','WEST'),('"+otherBranch+"','"+other+"','Other','MAIN');"+
  users.map((id,n)=>"insert into user_organizations(user_id,organization_id,is_active) values ('"+id+"','"+org+"',true);insert into user_branches(user_id,branch_id) values ('"+id+"','"+branch+"');insert into user_roles(user_id,organization_id,branch_id,role_id) select '"+id+"','"+org+"',"+(n===4?'null':"'"+branch+"'")+",id from roles where name='"+['cashier','inventory_officer','branch_manager','accountant','super_admin'][n]+"';").join('')+
  "insert into products(id,organization_id,name,sku,cost_price,retail_price) values ('"+product+"','"+org+"','LOCAL finance product','TEST',40,100);"+
  "insert into products(id,organization_id,name,sku,cost_price,retail_price) values ('"+otherProduct+"','"+other+"','LOCAL other product','OTHER',99,200);"+
  "insert into inventory(id,organization_id,branch_id,product_id,quantity_on_hand,average_cost) values ('"+inv+"','"+org+"','"+branch+"','"+product+"',10,40);"+
  "insert into stock_movements(id,organization_id,branch_id,product_id,movement_type,quantity,unit_cost) values ('"+movement+"','"+org+"','"+branch+"','"+product+"','RECEIPT',10,40);"+
  "insert into sales(id,organization_id,branch_id,cashier_id,receipt_number,total_amount,subtotal,completed_at) values ('"+sale+"','"+org+"','"+branch+"','"+users[0]+"','LOCAL-FINANCE',100,100,now());"+
  "insert into sale_items(id,sale_id,organization_id,branch_id,product_id,quantity,unit_price,unit_cost,line_total) values ('"+item+"','"+sale+"','"+org+"','"+branch+"','"+product+"',1,100,40,100);"+
  "insert into suppliers(id,organization_id,name,supplier_code) values ('"+supplier+"','"+org+"','LOCAL supplier','LOCAL');commit;");
 await t.test('cashier and inventory officer cannot select, filter or order by raw costs',async()=>{
  for(const role of ['cashier','inventory_officer'])for(const [table,col] of [['products','cost_price'],['inventory','average_cost'],['stock_movements','unit_cost'],['sale_items','unit_cost']]){
   for(const query of ['select=*','select='+col,'select=id&'+col+'=gte.0','select=id&order='+col]){
    const r=await req('/rest/v1/'+table+'?'+query,tokens[role]);assert.equal(r.status,403,role+' '+table+' '+query);
   }
  }
 });
 await t.test('operational projections retain selling prices, stock and sale lines',async()=>{
  for(const [table,cols,id] of [['products','id,name,retail_price',product],['inventory','id,quantity_on_hand',inv],['stock_movements','id,quantity,movement_type',movement],['sale_items','id,quantity,unit_price,line_total',item]]){
   const r=await req('/rest/v1/'+table+'?select='+cols+'&id=eq.'+id,tokens.cashier);assert.equal(r.status,200);assert.equal(r.data.length,1);
  }
 });
 await t.test('nonfinance users receive no unrestricted costs',async()=>{
  for(const role of ['cashier','inventory_officer','branch_manager'])for(const [kind,id] of [['products',product],['inventory',inv],['stock_movements',movement],['sale_items',item]]){
   const r=await cost(role,kind,[id]);assert.equal(r.status,200);assert.deepEqual(r.data,[]);
  }
 });
 await t.test('purchasing costs require branch purchasing permission',async()=>{
  assert.equal((await cost('cashier','purchase_products')).status,403);
  for(const role of ['inventory_officer','branch_manager','super_admin']){
   const r=await cost(role,'purchase_products');assert.equal(r.status,200);assert.equal(r.data[0].cost,40);
  }
  assert.equal((await cost('inventory_officer','purchase_products',[product],west)).status,403);
 });
 await t.test('finance access respects branch and operational permissions',async()=>{
  assert.equal((await cost('accountant','sale_items',[item])).data[0].cost,40);
  assert.deepEqual((await cost('accountant','sale_items',[item],west)).data,[]);
  assert.deepEqual((await cost('accountant','inventory',[inv])).data,[]);
  assert.deepEqual((await cost('accountant','products',[product],null)).data,[]);
  for(const [kind,id] of [['products',product],['inventory',inv],['stock_movements',movement],['sale_items',item]])assert.equal((await cost('super_admin',kind,[id])).data[0].cost,40);
 });
 await t.test('cross-organisation projection denied and raw operational reads isolated',async()=>{
  assert.equal((await cost('super_admin','products',[product],otherBranch,other)).status,403);
  assert.equal((await cost('super_admin','products',[product],otherBranch,org)).status,403);
  const r=await req('/rest/v1/products?select=id&organization_id=eq.'+other,tokens.super_admin);assert.equal(r.status,200);assert.deepEqual(r.data,[]);
 });
 await t.test('manual receiving preserves calculations without disclosing average cost',async()=>{
  const r=await rpc('receive_stock',tokens.inventory_officer,{p_organization_id:org,p_branch_id:branch,p_product_id:product,p_quantity:2,p_unit_cost:70,p_reference:'LOCAL financial test'});
  assert.equal(r.status,200);assert.equal(r.data.average_cost,null);assert.equal(r.data.quantity_on_hand,12);
  assert.equal((await cost('super_admin','inventory',[inv])).data[0].cost,45);
 });
 await t.test('purchase creation and goods receiving retain authorised costs',async()=>{
  const r=await rpc('create_purchase_order',tokens.inventory_officer,{p_supplier_id:supplier,p_branch_id:branch,p_items:[{product_id:product,quantity:2,cost_price:50}],p_status:'ORDERED'});
  assert.equal(r.status,200,'Create purchase');const po=r.data.purchase_order_id;
  const line=sql("select id from purchase_order_items where purchase_order_id='"+po+"'");
  const received=await rpc('receive_purchase_order_goods',tokens.inventory_officer,{p_purchase_order_id:po,p_items:[{purchase_order_item_id:line,quantity:2}]});assert.equal(received.status,200,'Receive purchase');assert.equal(received.data.received_units,2);
 });
 await t.test('report totals unchanged and finance fields redacted in the database',async()=>{
  const args={p_organization_id:org,p_branch_id:branch,p_start_date:'2026-01-01',p_end_date:'2099-12-31'};
  const a=await rpc('get_business_report',tokens.inventory_officer,args),b=await rpc('get_business_report',tokens.accountant,args);
  assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.data.summary.gross_profit,null);assert.equal(a.data.business_position.inventory_value,null);
  assert.equal(a.data.summary.gross_sales,100);assert.equal(b.data.summary.gross_sales,100);assert.equal(b.data.summary.gross_cogs,40);assert.equal(b.data.summary.gross_profit,60);
 });
 await t.test('workspace embedded relationships and staff RPCs remain accessible',async()=>{
  const r=await req('/rest/v1/user_organizations?select=organization_id,organizations(id,name)&user_id=eq.'+users[4],tokens.super_admin);assert.equal(r.status,200);assert.equal(r.data[0].organizations.id,org);
  const b=await req('/rest/v1/user_branches?select=branch_id,branches(id,name)&user_id=eq.'+users[4],tokens.super_admin);assert.equal(b.status,200);assert.equal(b.data[0].branches.id,branch);
  assert.equal((await rpc('get_organization_staff',tokens.super_admin,{target_organization_id:org})).status,200);
  assert.equal((await rpc('get_staff_invitation_status',tokens.super_admin,{p_org:org})).status,200);
  for(const name of ['query_repairs','query_warranty_claims'])assert.equal((await rpc(name,tokens.super_admin,{p_org:org,p_branch:branch})).status,200);
 });
 await t.test('master-data writes and embedded product lookup work without protected costs',async()=>{
  for(const table of ['categories','brands'])assert.equal((await req('/rest/v1/'+table,tokens.super_admin,{organization_id:org,name:'LOCAL test',slug:'local-test'})).status,201);
  assert.equal((await req('/rest/v1/customers',tokens.cashier,{organization_id:org,customer_code:'LOCAL',customer_type:'RETAIL',first_name:'Local',created_by:users[0]})).status,201);
  assert.equal((await req('/rest/v1/products?id=eq.'+product,tokens.super_admin,{name:'Updated local product'},'PATCH')).status,204);
  const r=await req('/rest/v1/products?select=id,name,categories:category_id(id,name),brands:brand_id(id,name),suppliers:supplier_id(id,name)&id=eq.'+product,tokens.super_admin);assert.equal(r.status,200);assert.equal(r.data.length,1);
 });
 await t.test('purchasing projection protects headers and lines and supports partial/full receiving',async()=>{
  const made=await rpc('create_purchase_order',tokens.inventory_officer,{p_supplier_id:supplier,p_branch_id:branch,p_items:[{product_id:product,quantity:2,cost_price:50}],p_status:'ORDERED'});assert.equal(made.status,200);const po=made.data.purchase_order_id;
  const args={p_organization_id:org,p_branch_id:branch,p_order_ids:[po]};
  const values=await rpc('get_purchasing_projection',tokens.inventory_officer,args);assert.equal(values.status,200);assert.equal(values.data.orders[0].total_amount,100);assert.equal(values.data.items[0].cost_price,50);
  assert.equal((await rpc('get_purchasing_projection',tokens.cashier,args)).status,403);
  assert.equal((await rpc('get_purchasing_projection',tokens.inventory_officer,{...args,p_branch_id:west})).status,403);
  assert.equal((await req('/rest/v1/purchase_order_items?select=cost_price',tokens.inventory_officer)).status,403);
  const line=values.data.items[0].id;
  for(const status of ['PARTIALLY_RECEIVED','RECEIVED']){const r=await rpc('receive_purchase_order_goods',tokens.inventory_officer,{p_purchase_order_id:po,p_items:[{purchase_order_item_id:line,quantity:1}]});assert.equal(r.status,200);assert.equal(r.data.status,status);}
  const invoice=await rpc('create_supplier_invoice',tokens.super_admin,{p_supplier_id:supplier,p_branch_id:branch,p_invoice_number:'LOCAL-BASELINE',p_invoice_date:'2026-11-01',p_purchase_order_id:po,p_subtotal:100,p_total_amount:100});assert.equal(invoice.status,200);
  assert.equal((await req('/rest/v1/supplier_invoices?select=id,total_amount&organization_id=eq.'+org,tokens.super_admin)).status,200);
  const hidden=await req('/rest/v1/supplier_invoices?select=id,total_amount&organization_id=eq.'+org,tokens.cashier);assert.equal(hidden.status,200);assert.deepEqual(hidden.data,[]);
 });
 await t.test('POS checkout receipt and refund remain transactional',async()=>{
  const checkout=await rpc('complete_pos_sale',tokens.cashier,{p_organization_id:org,p_branch_id:branch,p_items:[{product_id:product,quantity:1}],p_payments:[{payment_method:'CASH',amount:100}]});assert.equal(checkout.status,200);
  const sold=checkout.data.sale_id;
  const receipt=await req('/rest/v1/sales?select=id,receipt_number,total_amount,branches(name),profiles:cashier_id(full_name)&id=eq.'+sold,tokens.cashier);assert.equal(receipt.status,200);assert.equal(receipt.data.length,1);
  const lines=await req('/rest/v1/sale_items?select=id,quantity,unit_price,line_total&sale_id=eq.'+sold,tokens.cashier);assert.equal(lines.status,200);
  const refund=await rpc('complete_sale_return',tokens.cashier,{p_sale_id:sold,p_items:[{sale_item_id:lines.data[0].id,quantity:1,restock:true}],p_refund_method:'CASH'});assert.equal(refund.status,200);
 });
 await t.test('anonymous reads and direct transactional/RPC-only table writes denied',async()=>{
  for(const table of ['organizations','products','sales','inventory'])assert.ok((await req('/rest/v1/'+table+'?select=id',anon)).status>=400);
  for(const table of ['sales','sale_items','inventory','stock_movements','purchase_orders','supplier_invoices','warranty_claims','staff_invitation_resends'])assert.ok((await req('/rest/v1/'+table,tokens.super_admin,{})).status>=400);
  for(const table of ['warranty_claims','staff_invitation_resends','repair_jobs'])assert.equal((await req('/rest/v1/'+table+'?select=*',tokens.super_admin)).status,403);
 });
 await t.test('anonymous and inactive users cannot retrieve projections',async()=>{
  const a=await rpc('get_cost_projection',anon,{p_organization_id:org,p_branch_id:branch,p_kind:'products',p_ids:[product]});assert.ok(a.status>=400);
  sql("update user_organizations set is_active=false where organization_id='"+org+"' and user_id='"+users[4]+"'");assert.equal((await cost('super_admin','products')).status,403);
 });
 } finally {
 // Delete only fixtures created by this run, children before guarded parents.
 sql('begin;'+"delete from products where id='"+otherProduct+"' and organization_id='"+other+"';"+['returns','supplier_payments','supplier_invoices','purchase_orders','stock_movements','inventory','sales','products','suppliers','customers'].map(table=>"delete from public."+table+" where organization_id='"+org+"';").join('')+"delete from organizations where id in ('"+org+"','"+other+"');commit;");
 for(const id of users){const r=await req('/auth/v1/admin/users/'+id,admin,undefined,'DELETE');assert.equal(r.status,200,'Remove own test identity');}
 }
});
