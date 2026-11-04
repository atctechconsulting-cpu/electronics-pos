// Opt-in ONLY: empty local PostgreSQL 17 database named alphapos_resend_test_*.
// Uses real migrated permission and resend functions; all fixture changes roll back.
// Never connects to hosted Supabase. No credentials or raw DB diagnostics printed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const database = process.env.ALPHAPOS_RESEND_TEST_DATABASE_URL;
const read = name => fs.readFileSync(path.join(__dirname, '../../../supabase/migrations', name), 'utf8');
const stage2 = read('20260916093243_organization_staff_activation.sql');
function fn(name) {
  const start = stage2.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0);
  return stage2.slice(start, stage2.indexOf('$$;', start) + 3);
}

test('PostgreSQL resend eligibility, scoped RBAC, reservation, dispatch and access preservation', { skip: !database }, () => {
  const url = new URL(database);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
  assert.match(url.pathname, /^\/alphapos_resend_test_[a-zA-Z0-9_]+$/);
  const org = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const actor = '33333333-3333-4333-8333-333333333333';
  const target = '44444444-4444-4444-8444-444444444444';
  const role = '55555555-5555-4555-8555-555555555555';
  const migration = read('20261030010000_staff_invitation_resend.sql').replace(/^begin;$/m, '').replace(/^commit;$/m, '');
  const sql = `begin;
  do $$begin if to_regclass('public.profiles') is not null or to_regnamespace('auth') is not null then
    raise exception 'Disposable database must be empty'; end if; end$$;
  create schema auth;
  do $$begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end$$;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
  create table auth.users(id uuid primary key,email text,invited_at timestamptz,email_confirmed_at timestamptz,last_sign_in_at timestamptz);
  create table public.profiles(id uuid primary key,is_active boolean not null);
  create table public.organizations(id uuid primary key);
  create table public.branches(id uuid primary key,organization_id uuid);
  create table public.user_organizations(user_id uuid,organization_id uuid,is_active boolean,primary key(user_id,organization_id));
  create table public.user_branches(user_id uuid,branch_id uuid);
  create table public.roles(id uuid primary key);
  create table public.permissions(id uuid primary key,key text);
  create table public.role_permissions(role_id uuid,permission_id uuid);
  create table public.user_roles(user_id uuid,role_id uuid,organization_id uuid,branch_id uuid);
  ${fn('is_org_member')}
  ${fn('has_permission')}
  insert into organizations values('${org}'),('${other}');
  insert into profiles values('${actor}',true),('${target}',true);
  insert into auth.users values('${target}','staff@example.test','2020-01-01',null,null);
  insert into user_organizations values('${actor}','${org}',true),('${actor}','${other}',true),('${target}','${org}',true);
  insert into roles values('${role}');
  insert into permissions values('${org}','users.manage'),('${other}','roles.manage');
  insert into role_permissions values('${role}','${org}'),('${role}','${other}');
  insert into user_roles values('${actor}','${role}','${org}',null),('${actor}','${role}','${other}',null);
  select set_config('request.jwt.claim.sub','${actor}',true),set_config('request.jwt.claim.role','authenticated',true);
  ${migration}
  create function pg_temp.expect_denied(statement text,expected text) returns void language plpgsql as $$
  begin
    begin execute statement; exception when others then
      if sqlerrm=expected then return; end if; raise; end;
    raise exception 'Expected denial: %',expected;
  end$$;
  create function pg_temp.verify_resend() returns void language plpgsql as $$
  declare r uuid; next_r uuid; result jsonb; before_access jsonb;
  begin
    perform pg_temp.expect_denied('select reserve_staff_invitation_resend(''${other}'',''${target}'')','RESEND_INVALID_TARGET');
    update profiles set is_active=false where id='${target}';
    perform pg_temp.expect_denied('select reserve_staff_invitation_resend(''${org}'',''${target}'')','RESEND_INACTIVE');
    update profiles set is_active=true where id='${target}';
    update user_organizations set is_active=false where user_id='${target}';
    perform pg_temp.expect_denied('select reserve_staff_invitation_resend(''${org}'',''${target}'')','RESEND_INACTIVE');
    update user_organizations set is_active=true where user_id='${target}';
    update auth.users set email_confirmed_at=now();
    perform pg_temp.expect_denied('select reserve_staff_invitation_resend(''${org}'',''${target}'')','RESEND_NOT_PENDING');
    update auth.users set email_confirmed_at=null,last_sign_in_at=now();
    perform pg_temp.expect_denied('select reserve_staff_invitation_resend(''${org}'',''${target}'')','RESEND_NOT_PENDING');
    update auth.users set last_sign_in_at=null,invited_at=null;
    perform pg_temp.expect_denied('select reserve_staff_invitation_resend(''${org}'',''${target}'')','RESEND_NOT_PENDING');
    update auth.users set invited_at='2020-01-01';
    delete from role_permissions where permission_id='${org}';
    perform pg_temp.expect_denied('select reserve_staff_invitation_resend(''${org}'',''${target}'')','RESEND_FORBIDDEN');
    insert into role_permissions values('${role}','${org}');
    delete from role_permissions where permission_id='${other}';
    perform pg_temp.expect_denied('select reserve_staff_invitation_resend(''${org}'',''${target}'')','RESEND_FORBIDDEN');
    insert into role_permissions values('${role}','${other}');
    insert into branches values('${other}','${org}');
    update user_roles set branch_id='${other}' where organization_id='${org}';
    perform pg_temp.expect_denied('select reserve_staff_invitation_resend(''${org}'',''${target}'')','RESEND_FORBIDDEN');
    update user_roles set branch_id=null;
    insert into user_organizations values('${target}','${other}',true);
    before_access := jsonb_build_array((select jsonb_agg(p order by p.id) from profiles p),(select jsonb_agg(u order by u.user_id,u.organization_id) from user_organizations u),
      (select jsonb_agg(ur order by ur.user_id,ur.organization_id) from user_roles ur),(select jsonb_agg(b order by b.user_id,b.branch_id) from user_branches b),(select jsonb_agg(a order by a.id) from auth.users a));
    r := (reserve_staff_invitation_resend('${org}','${target}')->>'reservation_id')::uuid;
    perform pg_temp.expect_denied('select reserve_staff_invitation_resend(''${org}'',''${target}'')','RESEND_COOLDOWN');
    perform pg_temp.expect_denied('select reserve_staff_invitation_resend(''${other}'',''${target}'')','RESEND_COOLDOWN');
    update user_organizations set is_active=false where user_id='${target}' and organization_id='${org}';
    perform pg_temp.expect_denied(format('select dispatch_staff_invitation_resend(''${org}'',''${target}'',%L)',r),'RESEND_INACTIVE');
    update user_organizations set is_active=true where user_id='${target}' and organization_id='${org}';
    result := dispatch_staff_invitation_resend('${org}','${target}',r);
    if result->>'email'<>'staff@example.test' then raise exception 'Incorrect recipient'; end if;
    perform pg_temp.expect_denied(format('select dispatch_staff_invitation_resend(''${org}'',''${target}'',%L)',r),'RESEND_UNAVAILABLE');
    perform pg_temp.expect_denied(format('select finish_staff_invitation_resend(''${org}'',''${target}'',%L,''sent'')',r),'RESEND_FORBIDDEN');
    perform set_config('request.jwt.claim.role','service_role',true);
    perform finish_staff_invitation_resend('${org}','${target}',r,'unknown');
    if not exists(select 1 from staff_invitation_resends where state='unknown' and retry_after>=now()+interval '14 minutes') then raise exception 'Unknown cooldown lost'; end if;
    perform set_config('request.jwt.claim.role','authenticated',true);
    if before_access is distinct from jsonb_build_array((select jsonb_agg(p order by p.id) from profiles p),(select jsonb_agg(u order by u.user_id,u.organization_id) from user_organizations u),
      (select jsonb_agg(ur order by ur.user_id,ur.organization_id) from user_roles ur),(select jsonb_agg(b order by b.user_id,b.branch_id) from user_branches b),(select jsonb_agg(a order by a.id) from auth.users a)) then raise exception 'Access changed'; end if;
    update staff_invitation_resends set reserved_at=now()-interval '30 minutes',retry_after=now()-interval '1 minute';
    next_r := (reserve_staff_invitation_resend('${other}','${target}')->>'reservation_id')::uuid;
    if next_r=r then raise exception 'Reservation reused'; end if;
    perform set_config('request.jwt.claim.role','service_role',true);
    if finish_staff_invitation_resend('${org}','${target}',r,'sent') then raise exception 'Stale completion accepted'; end if;
    if (select reservation_id from staff_invitation_resends where user_id='${target}')<>next_r then raise exception 'New reservation overwritten'; end if;
  end$$;
  select pg_temp.verify_resend(); rollback;`;
  const result = spawnSync(process.env.ALPHAPOS_PSQL || 'psql', ['-X','-q','-v','ON_ERROR_STOP=1'], {
    input: sql, encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: url.pathname.slice(1),
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '5' },
  });
  assert.equal(result.status, 0, 'Disposable PostgreSQL resend scenarios failed (credentials/diagnostics withheld).');
});
