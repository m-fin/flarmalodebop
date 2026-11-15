import assert from 'node:assert/strict';
import test from 'node:test';
import { emailFor } from './config.ts';
import { formatDur } from './format.ts';
import { gooseEffect, pushPreview, receiptFor } from './goose.ts';

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

test('duration formatting', () => {
  assert.equal(formatDur(0), '0:00');
  assert.equal(formatDur(65), '1:05');
  assert.equal(formatDur(9.9), '0:09');
});
