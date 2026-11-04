const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../../../supabase/migrations', name), 'utf8');
const migration = read('20261101020000_protect_product_history_checks.sql');

test('only the two existing trigger functions acquire definer execution', () => {
  for (const name of ['protect_product_identity', 'prevent_invalid_serial_tracking_change']) {
    assert.ok(migration.includes(`alter function public.${name}() security definer;`));
    assert.ok(migration.includes(`alter function public.${name}() set search_path = '';`));
    assert.ok(migration.includes(`alter function public.${name}() owner to postgres;`));
  }
  assert.equal((migration.match(/security definer;/g) ?? []).length, 2);
  assert.match(migration, /rolsuper or rolbypassrls/);
});
test('forward correction preserves bodies, attachments, policies, grants on data and records', () => {
  assert.doesNotMatch(migration, /create (?:or replace )?function|drop trigger|create trigger|alter table|create policy|grant\s/i);
  assert.doesNotMatch(migration, /\b(insert into|delete from|update public\.)/i);
  assert.match(migration, /begin;/); assert.match(migration, /commit;/);
});
test('trigger entry points have no API role execute grants', () => {
  assert.equal((migration.match(/from public, anon, authenticated, service_role;/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /grant execute/i);
});
test('preserved history functions qualify all persistent table references', () => {
  const identity = read('20260722011514_protect_product_identity.sql');
  const tracking = read('20260720021626_protect_serial_tracking_changes.sql');
  for (const table of ['inventory', 'stock_movements', 'sale_items']) assert.ok(identity.includes(`from public.${table}`));
  assert.match(tracking, /from public\.inventory/);
  assert.match(tracking, /organization_id = new.organization_id/);
  assert.match(identity, /product_id = old.id/);
});
