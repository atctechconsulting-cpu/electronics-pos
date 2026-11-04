// Opt-in real multi-connection PostgreSQL 17 tests, never hosted Supabase.
// Set ALPHAPOS_RESEND_CONCURRENCY_TEST_DATABASE_URL to an EMPTY local database
// named alphapos_resend_concurrency_test_*. Requires psql (or ALPHAPOS_PSQL).
// Fixtures are committed so concurrent connections can see them; this dedicated
// disposable database is left populated for inspection. Use a fresh DB per run.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const database = process.env.ALPHAPOS_RESEND_CONCURRENCY_TEST_DATABASE_URL;
const read = name => fs.readFileSync(path.join(__dirname, '../../../supabase/migrations', name), 'utf8');
const org = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const target = '44444444-4444-4444-8444-444444444444';
const role = '55555555-5555-4555-8555-555555555555';
const oldReservation = '66666666-6666-4666-8666-666666666666';
const claims = `set request.jwt.claim.sub='${actor}'; set request.jwt.claim.role='authenticated';`;
const service = "set request.jwt.claim.role='service_role';";
const reserve = organization => `select public.reserve_staff_invitation_resend('${organization}','${target}');`;
const finish = (id, outcome = 'unknown', organization = org) => `select public.finish_staff_invitation_resend('${organization}','${target}','${id}','${outcome}');`;
const row = `select row_to_json(s) from public.staff_invitation_resends s where user_id='${target}';`;

function session(sql, hold = false) {
  const url = new URL(database);
  const name = `resend_test_${randomUUID().replaceAll('-', '')}`;
  const child = spawn(process.env.ALPHAPOS_PSQL || 'psql', ['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'], {
    windowsHide: true,
    env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: url.pathname.slice(1),
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
      PGCONNECT_TIMEOUT: '5', PGAPPNAME: name },
  });
  let stdout = '', stderr = '';
  let markReady;
  const ready = new Promise(resolve => { markReady = resolve; });
  const timer = setTimeout(() => child.kill(), 20000);
  const done = new Promise(resolve => {
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.includes('holder_ready')) markReady(true); });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', () => { clearTimeout(timer); markReady(false); resolve({ code: -1, stdout, cooldown: false }); });
    child.on('close', code => {
      clearTimeout(timer); markReady(false);
      resolve({ code, stdout: stdout.trim(), cooldown: stderr.includes('RESEND_COOLDOWN') });
    });
  });
  child.stdin.on('error', () => {});
  const settings = "set statement_timeout='15s'; set lock_timeout='12s'; set default_transaction_isolation='read committed';\n";
  if (hold) child.stdin.write(settings + sql + "\nselect 'holder_ready';\n");
  else child.stdin.end(settings + sql);
  return { name, ready, done, release: commit => {
    if (!child.stdin.destroyed) child.stdin.end(commit ? 'commit;\n' : 'rollback;\n');
  } };
}
async function query(sql) {
  const result = await session(sql).done;
  assert.equal(result.code, 0, 'Local fixture query failed (credentials/raw diagnostics withheld).');
  return result.stdout;
}
async function waitForLock(waiter, holder) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const blocked = await query(`select exists(select 1 from pg_catalog.pg_stat_activity w
      join pg_catalog.pg_stat_activity h on h.pid=any(pg_catalog.pg_blocking_pids(w.pid))
      where w.application_name='${waiter.name}' and h.application_name='${holder.name}' and w.wait_event_type='Lock');`);
    if (blocked === 't') return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail('Competing session never reached the expected PostgreSQL lock wait.');
}
function priorFunction(name) {
  const sql = read('20260916093243_organization_staff_activation.sql');
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0);
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
}

test('PostgreSQL: resend conflict-time cooldown and global concurrent reservation', { skip: !database, timeout: 120000 }, async t => {
  const url = new URL(database);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname), 'Local disposable database only');
  assert.match(url.pathname, /^\/alphapos_resend_concurrency_test_[a-z0-9_]+$/);
  const empty = await query("select (not exists(select 1 from pg_catalog.pg_tables where schemaname='public') and to_regnamespace('auth') is null);");
  assert.equal(empty, 't', 'Refusing a non-empty fixture database');
  // Real permission helpers, real new migration, minimal prior schema.
  await query(`begin;
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
    create table public.user_organizations(user_id uuid,organization_id uuid,is_active boolean not null,primary key(user_id,organization_id));
    create table public.roles(id uuid primary key);
    create table public.permissions(id uuid primary key,key text);
    create table public.role_permissions(role_id uuid,permission_id uuid);
    create table public.user_roles(user_id uuid,role_id uuid,organization_id uuid,branch_id uuid);
    ${priorFunction('is_org_member')}
    ${priorFunction('has_permission')}
    insert into organizations values('${org}'),('${other}');
    insert into profiles values('${actor}',true),('${target}',true);
    insert into auth.users values('${target}','staff@example.test','2020-01-01',null,null);
    insert into user_organizations values('${actor}','${org}',true),('${actor}','${other}',true),('${target}','${org}',true),('${target}','${other}',true);
    insert into roles values('${role}');
    insert into permissions values('${org}','users.manage'),('${other}','roles.manage');
    insert into role_permissions values('${role}','${org}'),('${role}','${other}');
    insert into user_roles values('${actor}','${role}','${org}',null),('${actor}','${role}','${other}',null);
    ${read('20261030010000_staff_invitation_resend.sql').replace(/^begin;$/m,'').replace(/^commit;$/m,'')}
    commit;`);

  await t.test('late finish extends cooldown while reserve waits; conditional upsert rejects overwrite', async () => {
    await query(`insert into public.staff_invitation_resends values('${target}','${org}','${actor}','${oldReservation}',
      clock_timestamp()-interval '30 minutes',clock_timestamp()-interval '1 minute','sending');`);
    // Finish changes retry_after but leaves it uncommitted. Reserve's initial
    // SELECT sees expired committed data, then waits at ON CONFLICT on this row.
    const holder = session(`begin;${service}${finish(oldReservation)}`, true);
    let waiter;
    try {
      assert.equal(await holder.ready, true);
      waiter = session(claims + reserve(org));
      await waitForLock(waiter, holder);
      holder.release(true);
      assert.equal((await holder.done).code, 0);
      const denied = await waiter.done;
      assert.notEqual(denied.code, 0);
      assert.equal(denied.cooldown, true, 'Conditional conflict update must return safe cooldown error');
      const saved = JSON.parse(await query(row));
      assert.equal(saved.reservation_id, oldReservation);
      assert.equal(saved.state, 'unknown');
      assert.equal(await query(`select retry_after>clock_timestamp()+interval '14 minutes' from public.staff_invitation_resends;`), 't');
    } finally { holder.release(false); await holder.done; if (waiter) await waiter.done; }
  });

  for (const secondOrg of [org, other]) {
    await t.test(secondOrg === org ? 'same-user simultaneous reservations allow exactly one winner' : 'different organisations share one global reservation', async () => {
      await query('delete from public.staff_invitation_resends;');
      const holder = session(`begin;${claims}${reserve(org)}`, true);
      let waiter;
      try {
        assert.equal(await holder.ready, true);
        waiter = session(claims + reserve(secondOrg));
        await waitForLock(waiter, holder);
        holder.release(true);
        assert.equal((await holder.done).code, 0);
        const denied = await waiter.done;
        assert.notEqual(denied.code, 0); assert.equal(denied.cooldown, true);
        assert.equal(await query('select count(*) from public.staff_invitation_resends;'), '1');
        assert.equal(JSON.parse(await query(row)).organization_id, org);
      } finally { holder.release(false); await holder.done; if (waiter) await waiter.done; }
    });
  }

  await t.test('expired reservation replacement and obsolete completion preserve new reservation', async () => {
    const old = JSON.parse(await query(row));
    await query("update public.staff_invitation_resends set state='sending',reserved_at=clock_timestamp()-interval '30 minutes',retry_after=clock_timestamp()-interval '1 minute';");
    const next = JSON.parse(await query(claims + reserve(other)));
    assert.notEqual(next.reservation_id, old.reservation_id);
    const before = await query(row);
    assert.equal(await query(service + finish(old.reservation_id, 'unknown')), 'f');
    assert.equal(await query(row), before);
  });

  await t.test('normal single-use dispatch and successful completion retain five-minute cooldown', async () => {
    const current = JSON.parse(await query(row));
    const dispatched = JSON.parse(await query(claims + `select public.dispatch_staff_invitation_resend('${other}','${target}','${current.reservation_id}');`));
    assert.equal(dispatched.email, 'staff@example.test');
    assert.equal(await query(service + finish(current.reservation_id, 'sent', other)), 't');
    assert.equal(await query("select state='sent' and retry_after>clock_timestamp()+interval '4 minutes' and retry_after<=clock_timestamp()+interval '5 minutes' from public.staff_invitation_resends;"), 't');
    const denied = await session(claims + reserve(org)).done;
    assert.notEqual(denied.code, 0); assert.equal(denied.cooldown, true);
  });
});
