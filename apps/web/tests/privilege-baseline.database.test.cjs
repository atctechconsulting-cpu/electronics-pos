const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const enabled=process.env.ALPHAPOS_LOCAL_BASELINE_TEST==='1';
const dir=path.resolve(__dirname,'../../../supabase/migrations');
const container='supabase_db_electronics-pos';
function docker(args,input){try{return execFileSync('docker',['exec','-i',container,...args],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024});}catch(e){throw new Error(String(e.stderr));}}
function sql(db,text,role='postgres'){return docker(['psql','-U',role,'-d',db,'-At','-v','ON_ERROR_STOP=1'],text);}
test('fresh public-schema replay and representative hosted ACL upgrade converge',{skip:!enabled},()=>{
 const auth=docker(['pg_dump','-U','supabase_admin','-d','postgres','--schema=auth','--section=pre-data','--no-owner','--no-privileges']);
 const files=fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
 assert.equal(files.at(-1),'20261101030000_v1_privilege_baseline.sql');
 const snapshots=[];
 for(const scenario of ['fresh','legacy']){
  const db='alphapos_baseline_'+scenario+'_'+Date.now();
  docker(['createdb','-U','supabase_admin','--owner=postgres','--template=template0',db]);
  // Bootstrap managed Auth schema only; all application migrations use postgres.
  sql(db,auth,'supabase_admin');
  sql(db,'alter table auth.users add primary key(id); grant usage on schema auth to postgres,authenticated,anon,service_role; grant references,select,trigger on auth.users to postgres;','supabase_admin');
  assert.equal(sql(db,"select current_user,rolsuper,pg_has_role(current_user,'supabase_admin','MEMBER') from pg_roles where rolname=current_user;").trim(),'postgres|f|f');
  sql(db,'alter default privileges for role supabase_admin in schema public grant all on tables to anon,authenticated,service_role; alter default privileges for role supabase_admin in schema public grant all on sequences to anon,authenticated,service_role;','supabase_admin');
  const adminDefaults=sql(db,"select defaclobjtype,defaclacl from pg_default_acl where defaclrole='supabase_admin'::regrole order by 1;");
  for(const file of files){
   if(file===files.at(-1)&&scenario==='legacy')sql(db,'grant all on all tables in schema public to anon,authenticated,service_role; grant select(cost_price),update(cost_price) on public.products to authenticated; grant select(is_active),update(is_active) on public.profiles to authenticated;');
   try{sql(db,fs.readFileSync(path.join(dir,file),'utf8'));}catch(e){throw new Error(scenario+' '+file+': '+e.message);}
  }
  assert.equal(sql(db,"select defaclobjtype,defaclacl from pg_default_acl where defaclrole='supabase_admin'::regrole order by 1;"),adminDefaults,'Platform administrator defaults remain unchanged');
  assert.equal(sql(db,"begin; create table public.baseline_future_probe(id integer); create sequence public.baseline_future_sequence; select has_table_privilege('authenticated','public.baseline_future_probe','SELECT'),has_sequence_privilege('authenticated','public.baseline_future_sequence','USAGE'); rollback;").includes('f|f'),true,'postgres future objects are restricted');
  const snapshot=sql(db,"select t.relname,a.attname,r.role,has_column_privilege(r.role,t.oid,a.attnum,'SELECT'),has_column_privilege(r.role,t.oid,a.attnum,'INSERT'),has_column_privilege(r.role,t.oid,a.attnum,'UPDATE') from pg_class t join pg_namespace n on n.oid=t.relnamespace join pg_attribute a on a.attrelid=t.oid cross join (values('anon'),('authenticated'),('service_role'))r(role) where n.nspname='public' and t.relkind='r' and a.attnum>0 and not a.attisdropped order by 1,2,3;");
  snapshots.push(snapshot);
  assert.equal(sql(db,"select has_table_privilege('authenticated','public.organizations','SELECT'),has_column_privilege('authenticated','public.products','cost_price','SELECT'),has_any_column_privilege('authenticated','public.warranty_claims','SELECT'),has_table_privilege('authenticated','public.sales','INSERT');").trim(),'t|f|f|f');
  console.log(scenario+' replay passed: '+files.length+' migrations; disposable database '+db);
 }
 assert.equal(snapshots[0],snapshots[1],'Fresh and legacy effective column ACLs converge');
 // Global grants are additive: prove the limitation without changing any defaults persistently.
 const db='alphapos_defaults_'+Date.now();
 docker(['createdb','-U','supabase_admin','--owner=postgres','--template=template0',db]);
 assert.ok(sql(db,"begin; alter default privileges for role postgres grant select on tables to authenticated; alter default privileges for role postgres in schema public revoke all on tables from authenticated; create table public.default_scope_probe(id integer); select has_table_privilege('authenticated','public.default_scope_probe','SELECT'); rollback;").split(/\r?\n/).includes('t'),'Schema revoke cannot cancel global default grant');
});
