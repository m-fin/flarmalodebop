import type { Message, MessageKind, Reaction, ReplySnap } from './types';

export const REACTIONS = ['❤️', '😂', '🐸', '🪿', '🔥', '🎵'] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

export type Appearance = 'dusk' | 'dawn' | 'system';

export function clip(text: string, max: number): string {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1) + '…';
}

export function groupReactions(rows: Reaction[], meId: string): { emoji: string; count: number; mine: boolean }[] {
  const grouped = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const row of rows) {
    if (!row?.emoji) continue;
    const slot = grouped.get(row.emoji) ?? { emoji: row.emoji, count: 0, mine: false };
    slot.count += 1;
    if (row.user_id === meId) slot.mine = true;
    grouped.set(row.emoji, slot);
  }
  return [...grouped.values()];
}

/** One reaction per person. The current emoji clears; a different one replaces it. */
export function nextReactions(rows: Reaction[], meId: string, emoji: string): Reaction[] {
  const mine = rows.find((row) => row.user_id === meId);
  const others = rows.filter((row) => row.user_id !== meId);
  if (!REACTIONS.includes(emoji as ReactionEmoji)) return mine ? [...others, mine] : others;
  if (mine?.emoji === emoji) return others;
  return [...others, { ...(mine ?? { message_id: 0, user_id: meId, emoji }), user_id: meId, emoji }];
}

export function replySnippet(message: Pick<Message, 'kind' | 'body'> | ReplySnap | null | undefined): string {
  if (!message) return 'Earlier message';
  if (message.kind === 'photo') return message.body ? `📷 ${clip(message.body, 80)}` : '📷 Photo';
  if (message.kind === 'voice') return '🎙️ Voice note';
  return clip(message.body, 80) || 'Message';
}

export function resolveReply(message: Message, messages: Message[]): ReplySnap | null {
  if (message.reply_to == null) return null;
  const live = messages.find((row) => row.id === message.reply_to);
  if (live) return { id: live.id, sender: live.sender, kind: live.kind, body: live.body };
  return message.reply;
}

export function likePattern(query: string): string | null {
  const q = String(query || '').trim().slice(0, 80);
  if (!q) return null;
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function localSearch(messages: Message[], query: string): Message[] {
  const q = String(query || '').trim().toLowerCase().slice(0, 80);
  if (!q) return [];
  return messages.filter((message) => message.body.toLowerCase().includes(q)).slice(-40).reverse();
}

export function canEdit(
  message: { kind: MessageKind; sender: string; meta?: { flarm?: string } | null } | null | undefined,
  meId: string,
): boolean {
  if (!message || message.kind !== 'text' || message.sender !== meId) return false;
  if (message.meta?.flarm === 'meetup') return false;
  return true;
}

export function canUnsend(message: { sender: string } | null | undefined, meId: string): boolean {
  return !!message && message.sender === meId;
}

export function resolveAppearance(pref: Appearance, prefersDark: boolean): 'light' | 'dark' {
  if (pref === 'dawn') return 'light';
  if (pref === 'dusk') return 'dark';
  return prefersDark ? 'dark' : 'light';
}

export function cycleAppearance(pref: Appearance): Appearance {
  if (pref === 'dusk') return 'dawn';
  if (pref === 'dawn') return 'system';
  return 'dusk';
}

export function appearanceLabel(pref: Appearance): string {
  if (pref === 'dawn') return 'Dawn';
  if (pref === 'system') return 'Match device';
  return 'Dusk';
}

/** First message the reader had not reached when they opened the thread. */
export function firstUnreadId(messages: { id: number }[], readAtOpen: number | null | undefined): number | null {
  if (readAtOpen == null) return null;
  const read = Number(readAtOpen);
  if (!Number.isFinite(read)) return null;
  const hit = messages.find((message) => Number(message.id) > read);
  return hit ? Number(hit.id) : null;
}

export function photoRoll<T extends { id: number; kind: string; file_path: string | null }>(messages: T[]): T[] {
  return messages.filter((message) => message.kind === 'photo' && message.file_path).sort((a, b) => b.id - a.id);
}

export function draftKey(userId: string): string {
  return `flarm-draft:${userId}`;
}

export function normalizeDraft(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 8000) : '';
}

/** Empty text clears the saved draft. */
export function draftToStore(text: string): string | null {
  const next = normalizeDraft(text);
  return next ? next : null;
}
