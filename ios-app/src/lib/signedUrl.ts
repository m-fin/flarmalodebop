import { BUCKET } from '@/lib/config';
import { supabase } from '@/lib/supabase';

const cache = new Map<string, { url: string; exp: number }>();

export async function signedUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw error ?? new Error('Could not open that file');
  cache.set(path, { url: data.signedUrl, exp: Date.now() + 3_600_000 });
  return data.signedUrl;
}
