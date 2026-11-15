const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const path = require('node:path');
const logic = require('../public/logic.js');

test('reactions are one per person and toggle off', () => {
  const rows = [
    { message_id: 1, user_id: 'frog', emoji: '❤️' },
    { message_id: 1, user_id: 'hailey', emoji: '🐸' },
  ];
  assert.deepEqual(logic.groupReactions(rows, 'frog'), [
    { emoji: '❤️', count: 1, mine: true },
    { emoji: '🐸', count: 1, mine: false },
  ]);
  const replaced = logic.nextReactions(rows, 'frog', '🪿');
  assert.equal(replaced.find((row) => row.user_id === 'frog').emoji, '🪿');
  assert.equal(logic.nextReactions(replaced, 'frog', '🪿').some((row) => row.user_id === 'frog'), false);
});

test('reply snippets, search, and edit rights', () => {
  assert.equal(logic.replySnippet(null), 'Earlier message');
  assert.equal(logic.replySnippet({ kind: 'photo', body: 'lily' }), '📷 lily');
  assert.equal(logic.replySnippet({ kind: 'voice', body: '' }), '🎙️ Voice note');
  assert.equal(logic.likePattern('100%_done'), '%100\\%\\_done%');
  assert.equal(logic.likePattern('  '), null);
  assert.equal(logic.canEdit({ kind: 'text', sender: 'frog' }, 'frog'), true);
  assert.equal(logic.canEdit({ kind: 'voice', sender: 'frog' }, 'frog'), false);
  assert.equal(logic.canUnsend({ sender: 'hailey' }, 'frog'), false);
  const byId = new Map([[1, { id: 1, sender: 'hailey', kind: 'text', body: 'live' }]]);
  assert.equal(logic.resolveReply({ reply_to: 1, reply: { body: 'stale' } }, byId).body, 'live');
  assert.deepEqual(logic.localSearch([{ id: 1, body: 'pond' }, { id: 2, body: 'Lily pad' }], 'lily').map((row) => row.id), [2]);
});

test('appearance cycles dusk, dawn, then the device', () => {
  assert.equal(logic.resolveAppearance('dusk', false), 'dark');
  assert.equal(logic.resolveAppearance('dawn', true), 'light');
  assert.equal(logic.resolveAppearance('system', false), 'light');
  assert.equal(logic.cycleAppearance('dusk'), 'dawn');
  assert.equal(logic.cycleAppearance('dawn'), 'system');
  assert.equal(logic.cycleAppearance('system'), 'dusk');
  assert.equal(logic.appearanceLabel('system'), 'Match device');
});

test('env files are gitignored and the privacy page names no private contact', () => {
  const { execFileSync } = require('node:child_process');
  const root = path.join(__dirname, '..', '..');
  for (const name of ['.env', '.env.local', '.env.production', 'ios-app/.env', 'secrets.env']) {
    const out = execFileSync('git', ['check-ignore', name], { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(out, name);
  }
  let exampleIgnored = true;
  try {
    execFileSync('git', ['check-ignore', '.env.example'], { cwd: root, stdio: 'pipe' });
  } catch {
    exampleIgnored = false;
  }
  assert.equal(exampleIgnored, false);
  const privacy = fs.readFileSync(path.join(__dirname, '..', 'public', 'privacy.html'), 'utf8');
  assert.match(privacy, /Matthew Finley/);
  assert.match(privacy, /not end-to-end encrypted/i);
  assert.doesNotMatch(privacy, /@gmail\.com/i);
  assert.doesNotMatch(privacy, /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
});

test('unread marker, photo roll, and drafts', () => {
  const messages = [
    { id: 1, kind: 'text', body: 'hi', file_path: null },
    { id: 2, kind: 'photo', body: '', file_path: 'frog/a.jpg' },
    { id: 3, kind: 'voice', body: '', file_path: 'frog/a.m4a' },
    { id: 4, kind: 'photo', body: 'lily', file_path: 'hailey/b.jpg' },
  ];
  assert.equal(logic.firstUnreadId(messages, null), null);
  assert.equal(logic.firstUnreadId(messages, 4), null);
  assert.equal(logic.firstUnreadId(messages, 1), 2);
  assert.equal(logic.firstUnreadId(messages, 0), 1);
  assert.deepEqual(logic.photoRoll(messages).map((row) => row.id), [4, 2]);
  const store = new Map();
  const memory = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  logic.saveDraft(memory, 'frog', '  pond  ');
  assert.equal(logic.loadDraft(memory, 'frog'), '  pond  ');
  logic.saveDraft(memory, 'frog', '');
  assert.equal(logic.loadDraft(memory, 'frog'), '');
  logic.saveDraft(memory, 'frog', 'x'.repeat(9000));
  assert.equal(logic.loadDraft(memory, 'frog').length, 8000);
});

test('the migration is additive and keeps reactions behind RLS', () => {
  const root = path.join(__dirname, '..', 'supabase');
  const migration = fs.readFileSync(path.join(root, 'migrations', '20261115_reactions_replies_edits.sql'), 'utf8');
  const setup = fs.readFileSync(path.join(root, 'setup.sql'), 'utf8');
  for (const sql of [migration, setup]) {
    assert.match(sql, /message_reactions/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /members read reactions/);
    assert.match(sql, /function public\.edit_message/);
    assert.match(sql, /function public\.set_reaction/);
    assert.match(sql, /kind = 'text'/);
    assert.match(sql, /reply_to bigint/);
    assert.match(sql, /edited_at timestamptz/);
    assert.match(sql, /revoke all on public\.message_reactions from anon, authenticated/);
    assert.match(sql, /grant select on public\.message_reactions to authenticated/);
    assert.doesNotMatch(sql, /drop table/i);
  }
  assert.doesNotMatch(migration, /delete from public\.messages/i);
  assert.doesNotMatch(migration, /delete from public\.profiles/i);
  assert.match(migration, /add column if not exists reply_to/);
  assert.match(migration, /add column if not exists edited_at/);
  const lock = fs.readFileSync(path.join(root, 'migrations', '20261115060000_private_helpers_and_force_rls.sql'), 'utf8');
  for (const sql of [setup, lock]) {
    assert.match(sql, /function private\.is_member/);
    assert.match(sql, /edited_at is null/);
    assert.match(sql, /force row level security/);
    assert.match(sql, /revoke all on schema private from public, anon/);
    assert.match(sql, /drop function if exists public\.is_member/);
    assert.doesNotMatch(sql, /create or replace function public\.is_member/);
    assert.doesNotMatch(sql, /drop table/i);
  }
});
