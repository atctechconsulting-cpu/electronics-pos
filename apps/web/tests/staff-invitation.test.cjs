// Run with: node --test tests/staff-invitation.test.cjs
// Uses the installed TypeScript compiler; all Auth/database calls are mocked.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const body = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  roleId: '22222222-2222-4222-8222-222222222222',
  branchId: null,
  email: 'staff@example.test',
  fullName: 'Staff Member',
  phone: null,
  jobTitle: null,
};
const userId = '33333333-3333-4333-8333-333333333333';
const source = readFileSync(path.join(__dirname, '../app/api/staff/invite/route.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(options = {}) {
  const calls = [];
  const actor = {
    auth: { getUser: async () => {
      calls.push('authenticate');
      return { data: { user: options.invalidSession ? null : { id: 'verified-actor' } }, error: null };
    } },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'authorize_staff_invitation') return { error: options.preflightError ?? null };
      assert.equal(name, 'finalize_staff_invitation');
      if (options.finalizationThrows) throw new Error('sensitive transport details');
      return { error: options.finalizationError ?? null };
    },
  };
  const admin = { auth: { admin: {
    listUsers: async () => {
      calls.push('lookup');
      return { data: { users: options.newUser ? [] : [{ id: userId, email: body.email }] }, error: null };
    },
    inviteUserByEmail: async () => {
      calls.push('invite');
      return options.invitationError
        ? { data: {}, error: { message: 'secret internal Auth failure' } }
        : { data: { user: { id: userId } }, error: null };
    },
    deleteUser: () => assert.fail('Must not delete an identity after ambiguous provisioning'),
  } }, from: () => assert.fail('No service-role table writes or reads in provisioning') };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, process: { env: {} },
    require: (name) => {
      if (name === 'next/server') return { NextResponse: { json: (data, init) => ({ data, status: init.status }) } };
      if (name === 'zod') return require('zod');
      if (name === '@/lib/supabase/admin') return {
        supabaseAdmin: admin,
        createStaffActorClient: (token) => { assert.equal(token, 'caller-token'); return actor; },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return {
    calls,
    run: (input = body, authorization = 'Bearer caller-token') => module.exports.POST({
      headers: { get: () => authorization },
      json: async () => { if (options.malformedJson) throw new Error('invalid JSON'); return input; },
    }),
  };
}

test('missing/invalid session cannot reach privileged operations', async () => {
  const missing = harness();
  assert.equal((await missing.run(body, null)).status, 401);
  assert.equal(missing.calls.length, 0);
  const invalid = harness({ invalidSession: true });
  assert.equal((await invalid.run()).status, 401);
  assert.deepEqual(invalid.calls, ['authenticate']);
});

test('inactive or unauthorized actor denial stops before Auth lookup/invite', async () => {
  const h = harness({ preflightError: { code: '42501', message: 'INVITE_FORBIDDEN' } });
  assert.equal((await h.run()).status, 403);
  assert.equal(h.calls.length, 2);
});

test('reject malformed input and browser actor identity before authorization', async () => {
  for (const input of [{ ...body, organizationId: 'bad' }, { ...body, email: 'bad' },
    { ...body, fullName: '' }, { ...body, roleId: 'bad' }, { ...body, branchId: 'bad' },
    { ...body, phone: 'x'.repeat(41) }, { ...body, jobTitle: 'x'.repeat(121) },
    { ...body, actor_user_id: userId }]) {
    const h = harness();
    assert.equal((await h.run(input)).status, 400);
    assert.deepEqual(h.calls, ['authenticate']);
  }
  assert.equal((await harness({ malformedJson: true }).run()).status, 400);
});

test('existing user finalizes using caller JWT after preflight and lookup', async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.status, 200);
  assert.equal(result.data.existingUser, true);
  assert.equal(result.data.invitationSent, false);
  assert.deepEqual(h.calls.map(c => typeof c === 'string' ? c : c.name),
    ['authenticate', 'authorize_staff_invitation', 'lookup', 'finalize_staff_invitation']);
  assert.equal(h.calls[3].args.target_user_id, userId);
  assert.equal(h.calls[3].args.target_email, body.email);
  assert.equal(Object.hasOwn(h.calls[3].args, 'actor_user_id'), false);
});

test('new user invitation still requires caller-context finalization', async () => {
  const h = harness({ newUser: true });
  const result = await h.run();
  assert.equal(result.status, 201);
  assert.equal(result.data.invitationSent, true);
  assert.deepEqual(h.calls.map(c => typeof c === 'string' ? c : c.name),
    ['authenticate', 'authorize_staff_invitation', 'lookup', 'invite', 'finalize_staff_invitation']);
});

test('revocation after preflight fails finalization without destructive cleanup', async () => {
  const h = harness({ newUser: true, finalizationError: { code: '42501', message: 'INVITE_FORBIDDEN' } });
  const result = await h.run();
  assert.equal(result.status, 403);
  assert.equal(result.data.success, false);
  assert.match(result.data.error, /email may already/);
});

test('membership, target and scope failures preserve useful safe error codes', async () => {
  for (const [message, status] of [
    ['INVITE_ALREADY_MEMBER', 409], ['INVITE_INACTIVE_MEMBER', 409],
    ['INVITE_INACTIVE_TARGET', 409], ['INVITE_INVALID_SCOPE', 400],
    ['INVITE_INVALID_TARGET', 400],
  ]) {
    const result = await harness({ finalizationError: { message } }).run();
    assert.equal(result.status, status);
    assert.equal(result.data.code, message);
  }
});

test('unexpected SQL/Auth/transport errors never leak raw details or claim rollback', async () => {
  for (const options of [
    { finalizationError: { message: 'secret SQL detail', code: 'XX000' } },
    { newUser: true, finalizationThrows: true },
    { newUser: true, invitationError: true },
  ]) {
    const result = await harness(options).run();
    assert.ok(result.status >= 500);
    assert.doesNotMatch(JSON.stringify(result.data), /secret|sensitive|No staff access was created/);
  }
});

test('installed SDK isolates concurrent caller JWTs from the service-role client', async () => {
  const { createClient } = require('@supabase/supabase-js');
  const requests = [];
  const adminSource = readFileSync(path.join(__dirname, '../lib/supabase/admin.ts'), 'utf8');
  const adminCompiled = ts.transpileModule(adminSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(adminCompiled, {
    module, exports: module.exports,
    process: { env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'dummy-service-key',
    } },
    require: (name) => {
      if (name === 'server-only') return {};
      assert.equal(name, '@supabase/supabase-js');
      return { createClient: (url, key, options) => createClient(url, key, {
        ...options,
        global: { ...options.global, fetch: async (url, init) => {
          requests.push({ url: String(url), headers: new Headers(init.headers) });
          return new Response(JSON.stringify(String(url).includes('/admin/users')
            ? { users: [] } : { success: true }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          });
        } },
      }) };
    },
  });
  const a = module.exports.createStaffActorClient('caller-a');
  const b = module.exports.createStaffActorClient('caller-b');
  await Promise.all([
    a.rpc('authorize_staff_invitation', {}),
    b.rpc('finalize_staff_invitation', {}),
    module.exports.supabaseAdmin.auth.admin.listUsers(),
  ]);
  assert.equal(requests.length, 3);
  for (const [path, bearer, key] of [
    ['authorize_staff_invitation', 'caller-a', 'dummy-anon-key'],
    ['finalize_staff_invitation', 'caller-b', 'dummy-anon-key'],
    ['/admin/users', 'dummy-service-key', 'dummy-service-key'],
  ]) {
    const request = requests.find(item => item.url.includes(path));
    assert.equal(request.headers.get('Authorization'), `Bearer ${bearer}`);
    assert.equal(request.headers.get('apikey'), key);
  }
});
