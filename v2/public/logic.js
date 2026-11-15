// Pure chat rules shared by the page and node tests. No DOM, no network.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlarmLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const REACTIONS = ['❤️', '😂', '🐸', '🪿', '🔥', '🎵'];

  function clip(text, max) {
    const flat = String(text || '').replace(/\s+/g, ' ').trim();
    if (flat.length <= max) return flat;
    return flat.slice(0, max - 1) + '…';
  }

  function groupReactions(rows, meId) {
    const grouped = new Map();
    for (const row of rows || []) {
      if (!row || !row.emoji) continue;
      const slot = grouped.get(row.emoji) || { emoji: row.emoji, count: 0, mine: false };
      slot.count += 1;
      if (row.user_id === meId) slot.mine = true;
      grouped.set(row.emoji, slot);
    }
    return [...grouped.values()];
  }

  // One reaction per person. Tapping the current emoji clears it; tapping another replaces it.
  function nextReactions(rows, meId, emoji) {
    const mine = (rows || []).find((row) => row.user_id === meId);
    const others = (rows || []).filter((row) => row.user_id !== meId);
    if (!REACTIONS.includes(emoji)) return others.concat(mine ? [mine] : []);
    if (mine && mine.emoji === emoji) return others;
    return others.concat([{ ...mine, user_id: meId, emoji }]);
  }

  function replySnippet(message) {
    if (!message) return 'Earlier message';
    if (message.kind === 'photo') return message.body ? '📷 ' + clip(message.body, 80) : '📷 Photo';
    if (message.kind === 'voice') return '🎙️ Voice note';
    return clip(message.body, 80) || 'Message';
  }

  function resolveReply(message, byId) {
    if (!message || message.reply_to == null) return null;
    const live = byId && (byId.get ? byId.get(message.reply_to) : byId[message.reply_to]);
    if (live) return { id: live.id, sender: live.sender, kind: live.kind, body: live.body };
    return message.reply || null;
  }

  function likePattern(query) {
    const q = String(query || '').trim().slice(0, 80);
    if (!q) return null;
    return '%' + q.replace(/[\\%_]/g, (ch) => '\\' + ch) + '%';
  }

  function localSearch(messages, query) {
    const q = String(query || '').trim().toLowerCase().slice(0, 80);
    if (!q) return [];
    return (messages || []).filter((message) => String(message.body || '').toLowerCase().includes(q)).slice(-40).reverse();
  }

  function canEdit(message, meId) {
    return !!(message && message.kind === 'text' && message.sender === meId);
  }

  function canUnsend(message, meId) {
    return !!(message && message.sender === meId);
  }

  function resolveAppearance(pref, prefersDark) {
    if (pref === 'dawn') return 'light';
    if (pref === 'dusk') return 'dark';
    return prefersDark ? 'dark' : 'light';
  }

  function cycleAppearance(pref) {
    if (pref === 'dusk') return 'dawn';
    if (pref === 'dawn') return 'system';
    return 'dusk';
  }

  function appearanceLabel(pref) {
    if (pref === 'dawn') return 'Dawn';
    if (pref === 'system') return 'Match device';
    return 'Dusk';
  }

  // First message the reader had not reached when they opened the thread.
  // null readAtOpen means "don't mark" (previews). 0 means nothing was read.
  function firstUnreadId(messages, readAtOpen) {
    if (readAtOpen == null || readAtOpen === '') return null;
    const read = Number(readAtOpen);
    if (!Number.isFinite(read)) return null;
    const hit = (messages || []).find((message) => message && Number(message.id) > read);
    return hit ? Number(hit.id) : null;
  }

  function photoRoll(messages) {
    return (messages || [])
      .filter((message) => message && message.kind === 'photo' && message.file_path)
      .sort((a, b) => Number(b.id) - Number(a.id));
  }

  function draftKey(userId) {
    return 'flarm-draft:' + String(userId || '');
  }

  function normalizeDraft(value) {
    return typeof value === 'string' ? value.slice(0, 8000) : '';
  }

  function loadDraft(store, userId) {
    if (!store || !userId) return '';
    return normalizeDraft(store.getItem(draftKey(userId)));
  }

  function saveDraft(store, userId, text) {
    if (!store || !userId) return;
    const key = draftKey(userId);
    const next = normalizeDraft(text);
    if (!next) store.removeItem(key);
    else store.setItem(key, next);
  }

  return {
    REACTIONS,
    clip,
    groupReactions,
    nextReactions,
    replySnippet,
    resolveReply,
    likePattern,
    localSearch,
    canEdit,
    canUnsend,
    resolveAppearance,
    cycleAppearance,
    appearanceLabel,
    firstUnreadId,
    photoRoll,
    draftKey,
    normalizeDraft,
    loadDraft,
    saveDraft,
  };
});
