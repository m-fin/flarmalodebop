export type MessageKind = 'text' | 'photo' | 'voice';

export type MessageMeta = {
  w?: number;
  h?: number;
  dur?: number;
  peaks?: number[];
  flarm?: 'meetup';
  meetup_id?: string;
};

export type ReplySnap = {
  id: number;
  sender: string;
  kind: MessageKind;
  body: string;
};

export type Message = {
  id: number;
  sender: string;
  kind: MessageKind;
  body: string;
  file_path: string | null;
  mime: string | null;
  meta: MessageMeta | null;
  created_at: string;
  reply_to: number | null;
  edited_at: string | null;
  reply: ReplySnap | null;
};

export type Reaction = {
  message_id: number;
  user_id: string;
  emoji: string;
};

export type Profile = {
  id: string;
  username: string;
  display: string;
  last_read: number;
  created_at: string;
};

export function asProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    username: String(row.username),
    display: String(row.display),
    last_read: Number(row.last_read ?? 0),
    created_at: String(row.created_at ?? ''),
  };
}

function asKind(value: unknown): MessageKind {
  const kind = String(value);
  return kind === 'photo' || kind === 'voice' ? kind : 'text';
}

export function asReply(value: unknown): ReplySnap | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') return null;
  const rec = row as Record<string, unknown>;
  if (rec.id == null) return null;
  return {
    id: Number(rec.id),
    sender: String(rec.sender ?? ''),
    kind: asKind(rec.kind),
    body: String(rec.body ?? ''),
  };
}

export function asMessage(row: Record<string, unknown>): Message {
  const meta = row.meta && typeof row.meta === 'object' ? (row.meta as MessageMeta) : null;
  return {
    id: Number(row.id),
    sender: String(row.sender),
    kind: asKind(row.kind),
    body: String(row.body ?? ''),
    file_path: row.file_path ? String(row.file_path) : null,
    mime: row.mime ? String(row.mime) : null,
    meta,
    created_at: String(row.created_at),
    reply_to: row.reply_to == null ? null : Number(row.reply_to),
    edited_at: row.edited_at ? String(row.edited_at) : null,
    reply: asReply(row.reply),
  };
}

export function asReaction(row: Record<string, unknown>): Reaction {
  return {
    message_id: Number(row.message_id),
    user_id: String(row.user_id),
    emoji: String(row.emoji),
  };
}

export function oneRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }
  if (data && typeof data === 'object') return data as Record<string, unknown>;
  return null;
}
