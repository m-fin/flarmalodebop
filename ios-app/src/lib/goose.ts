export type GooseKind = 'waddle' | 'flock';

/** Same rules as the web app: a lone goose waddles; a flock flies in a V. */
export function gooseEffect(body: string): GooseKind | null {
  const geese = body.match(/🪿/gu)?.length ?? 0;
  if (geese >= 5 || /the flock has assembled/i.test(body)) return 'flock';
  const onlyGoose = body.replace(/[\s\ufe0f]/g, '').replace(/🪿/gu, '') === '';
  if (geese >= 1 && onlyGoose) return 'waddle';
  return null;
}

export function pushPreview(kind: string, body: string): string {
  const geese = body.match(/🪿/gu)?.length ?? 0;
  if (kind === 'photo') return '📷 sent a photo';
  if (kind === 'voice') return '🎙️ sent a voice note';
  if (geese >= 5) return '🪿 The flock has assembled!';
  return body.slice(0, 140);
}

export function receiptFor(
  messages: { id: number; sender: string }[],
  meId: string,
  otherRead: number,
): { messageId: number; label: string } | null {
  let lastMine: { id: number; sender: string } | null = null;
  for (const message of messages) {
    if (message.sender === meId) lastMine = message;
  }
  if (!lastMine) return null;
  if (messages.some((message) => message.id > lastMine.id && message.sender !== meId)) return null;
  return { messageId: lastMine.id, label: otherRead >= lastMine.id ? '♫ Read' : '♪ Delivered' };
}
