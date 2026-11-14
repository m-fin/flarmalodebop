export type MessageKind = 'text' | 'photo' | 'voice';

export type MessageMeta = {
  w?: number;
  h?: number;
  dur?: number;
  peaks?: number[];
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

export function asMessage(row: Record<string, unknown>): Message {
  const kind = String(row.kind);
  const meta = row.meta && typeof row.meta === 'object' ? (row.meta as MessageMeta) : null;
  return {
    id: Number(row.id),
    sender: String(row.sender),
    kind: kind === 'photo' || kind === 'voice' ? kind : 'text',
    body: String(row.body ?? ''),
    file_path: row.file_path ? String(row.file_path) : null,
    mime: row.mime ? String(row.mime) : null,
    meta,
    created_at: String(row.created_at),
  };
}
