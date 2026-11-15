import assert from 'node:assert/strict';
import test from 'node:test';
import { emailFor } from './config.ts';
import { formatDur } from './format.ts';
import { gooseEffect, pushPreview, receiptFor } from './goose.ts';
import { canEdit, canUnsend, draftKey, draftToStore, firstUnreadId, groupReactions, likePattern, localSearch, nextReactions, normalizeDraft, photoRoll, replySnippet, resolveAppearance, resolveReply } from './thread.ts';

test('username maps to the two member emails', () => {
  assert.equal(emailFor('frog'), 'frog@flarmalodebop.app');
  assert.equal(emailFor('hailey'), 'hailey@flarmalodebop.app');
  assert.equal(emailFor('Frog'), null);
  assert.equal(emailFor('someone'), null);
});

test('goose energy matches the web rules', () => {
  assert.equal(gooseEffect('🪿'), 'waddle');
  assert.equal(gooseEffect('  🪿  '), 'waddle');
  assert.equal(gooseEffect('honk 🪿'), null);
  assert.equal(gooseEffect('🪿🪿🪿🪿🪿'), 'flock');
  assert.equal(gooseEffect('the flock has assembled'), 'flock');
  assert.equal(gooseEffect('hello'), null);
});

test('push preview keeps photos, voice, and flocks short', () => {
  assert.equal(pushPreview('photo', ''), '📷 sent a photo');
  assert.equal(pushPreview('voice', ''), '🎙️ sent a voice note');
  assert.equal(pushPreview('text', '🪿'.repeat(5)), '🪿 The flock has assembled!');
  assert.equal(pushPreview('text', 'pond'), 'pond');
});

test('read receipt sits on the latest outgoing message only', () => {
  const messages = [
    { id: 1, sender: 'me' },
    { id: 2, sender: 'them' },
    { id: 3, sender: 'me' },
  ];
  assert.deepEqual(receiptFor(messages, 'me', 3), { messageId: 3, label: '♫ Read' });
  assert.deepEqual(receiptFor(messages, 'me', 2), { messageId: 3, label: '♪ Delivered' });
  assert.equal(receiptFor([...messages, { id: 4, sender: 'them' }], 'me', 4), null);
});

test('reactions are one per person and toggle off', () => {
  const rows = [
    { message_id: 1, user_id: 'frog', emoji: '❤️' },
    { message_id: 1, user_id: 'hailey', emoji: '🐸' },
  ];
  assert.deepEqual(groupReactions(rows, 'frog'), [
    { emoji: '❤️', count: 1, mine: true },
    { emoji: '🐸', count: 1, mine: false },
  ]);
  const replaced = nextReactions(rows, 'frog', '🪿');
  assert.equal(replaced.find((row) => row.user_id === 'frog').emoji, '🪿');
  assert.equal(replaced.length, 2);
  const cleared = nextReactions(replaced, 'frog', '🪿');
  assert.equal(cleared.some((row) => row.user_id === 'frog'), false);
  assert.equal(nextReactions(rows, 'frog', 'not-a-reaction').length, 2);
});

test('reply snippets and live quote resolution', () => {
  assert.equal(replySnippet(null), 'Earlier message');
  assert.equal(replySnippet({ kind: 'photo', body: '' }), '📷 Photo');
  assert.equal(replySnippet({ kind: 'voice', body: '' }), '🎙️ Voice note');
  assert.equal(replySnippet({ kind: 'text', body: '  pond\nnotes  ' }), 'pond notes');
  const messages = [
    { id: 1, sender: 'hailey', kind: 'text', body: 'original', reply_to: null, reply: null },
    { id: 2, sender: 'frog', kind: 'text', body: 'reply', reply_to: 1, reply: { id: 1, sender: 'hailey', kind: 'text', body: 'stale' } },
  ];
  assert.equal(resolveReply(messages[1], messages).body, 'original');
  assert.equal(resolveReply({ ...messages[1], reply_to: 9 }, messages).body, 'stale');
});

test('search pattern escapes like wildcards and edit rights stay with the author', () => {
  assert.equal(likePattern('  lily  '), '%lily%');
  assert.equal(likePattern('100%_done'), '%100\\%\\_done%');
  assert.equal(likePattern('   '), null);
  const mine = { kind: 'text', sender: 'frog' };
  assert.equal(canEdit(mine, 'frog'), true);
  assert.equal(canEdit({ kind: 'photo', sender: 'frog' }, 'frog'), false);
  assert.equal(canEdit(mine, 'hailey'), false);
  assert.equal(canUnsend({ sender: 'frog' }, 'frog'), true);
  assert.equal(canUnsend({ sender: 'frog' }, 'hailey'), false);
  const found = localSearch(
    [
      { body: 'lily pad' },
      { body: 'honk' },
    ],
    'LILY',
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].body, 'lily pad');
});

test('appearance resolves dusk, dawn, and the device', () => {
  assert.equal(resolveAppearance('dusk', false), 'dark');
  assert.equal(resolveAppearance('dawn', true), 'light');
  assert.equal(resolveAppearance('system', true), 'dark');
  assert.equal(resolveAppearance('system', false), 'light');
});

test('unread marker, photo roll, and drafts', () => {
  const messages = [
    { id: 1, kind: 'text', body: 'hi', file_path: null },
    { id: 2, kind: 'photo', body: '', file_path: 'frog/a.jpg' },
    { id: 4, kind: 'photo', body: 'lily', file_path: 'hailey/b.jpg' },
  ];
  assert.equal(firstUnreadId(messages, null), null);
  assert.equal(firstUnreadId(messages, 4), null);
  assert.equal(firstUnreadId(messages, 1), 2);
  assert.deepEqual(photoRoll(messages).map((row) => row.id), [4, 2]);
  assert.equal(draftKey('frog'), 'flarm-draft:frog');
  assert.equal(normalizeDraft(null), '');
  assert.equal(draftToStore(''), null);
  assert.equal(draftToStore('pond'), 'pond');
  assert.equal(draftToStore('x'.repeat(9000)).length, 8000);
});

test('duration formatting', () => {
  assert.equal(formatDur(0), '0:00');
  assert.equal(formatDur(65), '1:05');
  assert.equal(formatDur(9.9), '0:09');
});
