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
});
