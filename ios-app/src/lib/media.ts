import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { BUCKET } from '@/lib/config';
import { supabase } from '@/lib/supabase';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
};

export async function preparePhoto(asset: ImagePickerAsset): Promise<{ uri: string; mime: string; w: number; h: number }> {
  const mime = asset.mimeType || 'image/jpeg';
  if (mime === 'image/gif') {
    return { uri: asset.uri, mime, w: asset.width || 0, h: asset.height || 0 };
  }
  const context = ImageManipulator.manipulate(asset.uri, { maxWidth: 2048, maxHeight: 2048 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.86, format: SaveFormat.JPEG });
  return { uri: saved.uri, mime: 'image/jpeg', w: saved.width, h: saved.height };
}

export async function uploadFile(userId: string, uri: string, mime: string): Promise<string> {
  const ext = EXT[mime];
  if (!ext) throw new Error('That file type isn’t supported');
  const path = `${userId}/${Crypto.randomUUID()}.${ext}`;
  const response = await fetch(uri);
  const body = await response.arrayBuffer();
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: mime,
    upsert: false,
    cacheControl: '31536000',
  });
  if (error) throw error;
  return path;
}
