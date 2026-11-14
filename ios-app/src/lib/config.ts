// Same public project as the web app (v2/public/config.js).
// The publishable key is meant for clients. Row Level Security limits every
// table, realtime topic, and storage object to the two members.
export const SUPABASE_URL = 'https://bpovuwrgvfzdeihpnssv.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_CA5kH9bX_grdohd8BN7H7g_bWOdf24U';

export const ROOM = 'flarm:room';
export const BUCKET = 'media';

export const MEMBERS = {
  frog: { email: 'frog@flarmalodebop.app', display: 'Frog', emoji: '🐸' },
  hailey: { email: 'hailey@flarmalodebop.app', display: 'Hailey', emoji: '🌸' },
} as const;

export type Username = keyof typeof MEMBERS;

export function emailFor(username: string): string | null {
  if (username === 'frog' || username === 'hailey') return MEMBERS[username].email;
  return null;
}

export function avatarFor(username: string | undefined, display: string): string {
  if (username === 'hailey') return MEMBERS.hailey.emoji;
  if (username === 'frog') return MEMBERS.frog.emoji;
  return display.slice(0, 1).toUpperCase() || '♪';
}
