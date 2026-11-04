// Offline API tests use real route code with mocked Auth/RPC boundaries.
// SQL contract checks are static; the companion database suite executes SQL locally.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const read = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
const source = read('../app/api/staff/resend-invite/route.ts');
const sql = read('../../../supabase/migrations/20261030010000_staff_invitation_resend.sql');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const org = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const reservation = '33333333-3333-4333-8333-333333333333';
const body = { organizationId: org, userId: user };
const identity = { id: user, email: 'staff@example.test', invited_at: '2020-01-01T00:00:00Z', email_confirmed_at: null, last_sign_in_at: null };

function harness(options = {}, shared = {}) {
  const calls = [];
  const actor = {
    auth: { getUser: async () => ({ data: { user: options.invalidSession ? null : { id: 'actor' } }, error: null }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'reserve_staff_invitation_resend') {
        if (options.reserveError) return { error: { message: options.reserveError } };
        if (shared.reserved) return { error: { message: 'RESEND_COOLDOWN' } };
        shared.reserved = true;
        return { data: options.badReservation ? {} : { reservation_id: reservation }, error: null };
      }
      assert.equal(name, 'dispatch_staff_invitation_resend');
      assert.equal(args.p_reservation, reservation);
      return options.dispatchError ? { error: { message: options.dispatchError } }
        : { data: { email: options.changedEmail ?? identity.email }, error: null };
    },
  };
  const admin = {
    from: () => assert.fail('No service-role employee table writes'),
    rpc: async (name, args) => {
      assert.equal(name, 'finish_staff_invitation_resend');
      calls.push({ name, args });
      if (options.finishThrows) throw new Error('private SQL diagnostics');
      return { data: true, error: null };
    },
    auth: { admin: {
      getUserById: async id => {
        assert.equal(id, user); calls.push({ name: 'lookup' });
        return { data: { user: { ...identity, ...options.identity } }, error: null };
      },
      inviteUserByEmail: async (email, args) => {
        calls.push({ name: 'invite', email, args });
        if (options.timeout) return new Promise(() => {});
        if (options.throws) throw new Error('secret token=do-not-leak');
        return { data: options.badResponse ? { user: { id: org, email } } : { user: { ...identity, token: 'do-not-leak' } },
          error: options.deliveryError ?? null };
      },
    } },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, URL,
    process: { env: { NEXT_PUBLIC_APP_URL: options.noUrl ? undefined : 'https://alphapos.example.test/' } },
    setTimeout: (fn) => setTimeout(fn, 5), clearTimeout,
    require: name => {
      if (name === 'next/server') return { NextResponse: { json: (data, init) => ({ data, status: init.status }) } };
      if (name === 'zod') return require('zod');
      if (name === '@/lib/supabase/admin') return { supabaseAdmin: admin, createStaffActorClient: () => actor };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return { calls, run: (input = body, token = 'Bearer caller') => module.exports.POST({
    headers: { get: () => token }, json: async () => input,
  }) };
}

test('expired/unused invitation resends through the same identity without provisioning or access writes', async () => {
  const h = harness(); const result = await h.run();
  assert.equal(result.status, 200);
  assert.deepEqual(h.calls.map(c => c.name), ['reserve_staff_invitation_resend','lookup','dispatch_staff_invitation_resend','invite','finish_staff_invitation_resend']);
  assert.equal(h.calls[3].email, identity.email);
  assert.equal(h.calls[3].args.redirectTo, 'https://alphapos.example.test/accept-invite');
  assert.deepEqual(Object.keys(h.calls[3].args), ['redirectTo']);
  assert.equal(h.calls[4].args.p_outcome, 'sent');
  assert.doesNotMatch(JSON.stringify(result), /do-not-leak|reservation_id|access_token|refresh_token/);
});

for (const [name, error, status] of [
  ['global inactive profile', 'RESEND_INACTIVE', 409], ['inactive organisation membership','RESEND_INACTIVE',409],
  ['wrong organisation','RESEND_INVALID_TARGET',404], ['cashier','RESEND_FORBIDDEN',403],
  ['inventory officer','RESEND_FORBIDDEN',403], ['missing users.manage','RESEND_FORBIDDEN',403],
  ['missing roles.manage','RESEND_FORBIDDEN',403], ['already accepted','RESEND_NOT_PENDING',409],
  ['cooldown','RESEND_COOLDOWN',429],
]) test(`${name} database denial prevents privileged Auth calls`, async () => {
  const h = harness({ reserveError: error });
  assert.equal((await h.run()).status, status);
  assert.deepEqual(h.calls.map(c => c.name), ['reserve_staff_invitation_resend']);
});

test('missing or invalid authentication cannot reserve or deliver', async () => {
  const missing = harness();
  assert.equal((await missing.run(body, null)).status, 401);
  assert.equal(missing.calls.length, 0);
  const h = harness({ invalidSession: true }); assert.equal((await h.run()).status, 401); assert.equal(h.calls.length, 0);
});

test('arbitrary recipient, redirect, roles, branches and actor identity are rejected', async () => {
  for (const extra of [{ email: 'attacker@example.test' }, { redirectTo: 'https://attacker.test' }, { roleId: org }, { branchId: org }, { actorId: org }]) {
    const h = harness(); assert.equal((await h.run({ ...body, ...extra })).status, 400); assert.equal(h.calls.length, 0);
  }
});

test('missing deployment URL fails closed without using localhost', async () => {
  const h = harness({ noUrl: true }); assert.equal((await h.run()).status, 503); assert.equal(h.calls.length, 0);
});

test('accepted or partially onboarded Auth identity directs to login/password recovery', async () => {
  for (const fields of [{ email_confirmed_at: '2026-10-30' }, { last_sign_in_at: '2026-10-30' }, { invited_at: null }]) {
    const h = harness({ identity: fields }); const result = await h.run();
    assert.equal(result.status, 409); assert.match(result.data.error, /password recovery/);
    assert.ok(!h.calls.some(c => c.name === 'invite'));
  }
});

test('deactivation or revoked permissions between reserve and dispatch stops delivery', async () => {
  for (const dispatchError of ['RESEND_INACTIVE','RESEND_FORBIDDEN','RESEND_NOT_PENDING']) {
    const h = harness({ dispatchError }); await h.run(); assert.ok(!h.calls.some(c => c.name === 'invite'));
  }
});

test('simultaneous API requests share persistent reservation result; only the winner delivers', async () => {
  // Models PostgreSQL's serialized reserve result; live two-session locking still needs UAT.
  const shared = {}; const a = harness({}, shared); const b = harness({}, shared);
  const results = await Promise.all([a.run(), b.run()]);
  assert.deepEqual(results.map(r => r.status).sort(), [200,429]);
  assert.equal([...a.calls,...b.calls].filter(c => c.name === 'invite').length, 1);
});

test('explicit delivery rejection retains cooldown and does not expose provider errors', async () => {
  const h = harness({ deliveryError: { status: 429, message: 'secret provider message' } });
  const result = await h.run(); assert.equal(result.status, 502);
  assert.equal(h.calls.at(-1).args.p_outcome, 'failed'); assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test('Auth acceptance race is reported as no longer pending', async () => {
  const h = harness({ deliveryError: { status: 422, code: 'email_exists' } });
  assert.equal((await h.run()).data.code, 'RESEND_NOT_PENDING');
});

for (const options of [{ timeout: true }, { throws: true }, { badResponse: true }, { deliveryError: { status: 500, message: 'secret' } }]) {
  test(`ambiguous delivery retains conservative reservation: ${Object.keys(options)[0]}`, async () => {
    const h = harness(options); const result = await h.run();
    assert.ok(result.status >= 500); assert.equal(h.calls.at(-1).args.p_outcome, 'unknown');
    assert.doesNotMatch(JSON.stringify(result), /secret|do-not-leak/);
  });
}

test('bookkeeping outage never retries Auth or reports access rollback', async () => {
  const h = harness({ finishThrows: true }); const result = await h.run();
  assert.equal(result.status, 200); assert.equal(h.calls.filter(c => c.name === 'invite').length, 1);
});

test('unexpected reservation or changed server-side email never sends to an unchecked identity', async () => {
  for (const opts of [{ badReservation: true }, { changedEmail: 'different@example.test' }, { identity: { id: org } }]) {
    const h = harness(opts); assert.ok((await h.run()).status >= 400); assert.ok(!h.calls.some(c => c.name === 'invite'));
  }
});

test('SQL uses strict pending criteria, both org permissions, fresh locked checks and global target reservation', () => {
  assert.match(sql, /a\.invited_at is not null and a\.email_confirmed_at is null and a\.last_sign_in_at is null/);
  assert.match(sql, /has_permission\('users.manage',p_org,null\)/);
  assert.match(sql, /has_permission\('roles.manage',p_org,null\)/);
  assert.match(sql, /if not v_global or not v_member/);
  assert.match(sql, /u\.organization_id=p_org/);
  assert.match(sql, /user_id uuid primary key/);
  assert.match(sql, /order by p.id for update/);
  assert.match(sql, /transaction_isolation.*read committed/);
  assert.match(sql, /state='reserved'[\s\S]*interval '60 seconds'/);
  assert.match(sql, /requested_by=auth.uid\(\)/);
  assert.match(sql, /s.retry_after > v_now/);
  assert.match(sql, /interval '15 minutes'/);
});

test('no identity/access writes, initial provisioning or historical migration edits are needed', () => {
  assert.doesNotMatch(sql, /(?:insert into|update|delete from)\s+(?:public\.)?(profiles|user_organizations|user_branches|user_roles|auth\.users)\b/i);
  assert.doesNotMatch(source + sql, /finalize_staff_invitation|generateLink|deleteUser|updateUserById/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public.staff_invitation_resends from public, anon, authenticated, service_role/);
  assert.match(sql, /auth.role\(\) is distinct from 'service_role'/);
  assert.match(sql, /reservation_id=p_reservation and state='sending'/);
  assert.equal((sql.match(/security definer set search_path = ''/g) || []).length, 6);
});

test('reservation replacement rechecks current cooldown under the conflict lock and rejects zero affected rows', () => {
  const start = sql.indexOf('create function public.reserve_staff_invitation_resend(');
  const reserve = sql.slice(start, sql.indexOf('$$;', start));
  assert.match(reserve, /insert into public.staff_invitation_resends as current_reservation/);
  assert.match(reserve, /on conflict\(user_id\) do update[\s\S]*where current_reservation.retry_after <= clock_timestamp\(\);\s*if not found then raise exception 'RESEND_COOLDOWN'; end if;/);
  assert.ok(reserve.indexOf("if not found then raise exception 'RESEND_COOLDOWN'") < reserve.indexOf("return jsonb_build_object"));
});

test('Staff exposes pending-only action, never labels pending as expired, retains activation controls', () => {
  const page = read('../app/(app)/staff/page.tsx');
  assert.match(page, /invitation.pending && invitation.eligible/);
  assert.match(page, /options\?\.can_manage_staff && options.can_manage_roles/);
  assert.match(page, /resending !== null \|\| coolingDown/);
  assert.match(page, /Invitation pending/); assert.doesNotMatch(page, /Invitation expired/);
  assert.match(page, /setStaffActiveStatus/); assert.match(page, /password recovery/);
});
