import {ApiError} from './api';

export const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
export type CaptureFile = {uri: string; name: string; size: number; mime: string};
export type ManualDraft = {
  url: string; title: string; content: string; file: CaptureFile | null;
  attempt: {key: string} | null;
};
export function newManualDraft(): ManualDraft {
  return {url: '',title: '',content: '',file: null,attempt: null};
}

/** Mirror the existing capture API: preserve the URL, reject credentials/unsafe syntax. */
export function validCaptureURL(value: string): boolean {
  const raw = value.trim();
  if (raw.length < 10 || raw.length > 4096 || /[\s\u0000-\u001f\u007f\\]/.test(raw) || !/^https?:\/\//i.test(raw)) return false;
  try {
    const url = new URL(raw);
    return ['http:','https:'].includes(url.protocol) && Boolean(url.hostname) &&
      !url.username && !url.password && ['', '80', '443'].includes(url.port);
  } catch {return false;}
}

/** Select MIME from bytes, not a provider's filename or potentially incorrect metadata. */
export function captureMIME(bytes: Uint8Array): string | null {
  const starts = (signature: number[]) => signature.every((value,index) => bytes[index] === value);
  if (starts([0x25,0x50,0x44,0x46,0x2d])) return 'application/pdf';
  if (starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) return 'image/png';
  if (starts([0xff,0xd8,0xff])) return 'image/jpeg';
  if (starts([82,73,70,70]) && [87,69,66,80].every((n,i) => bytes[i+8] === n)) return 'image/webp';
  return null;
}
export function manualSaveError(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.status === 401 || cause.code === 'session_changed')
      return 'Your session ended. Sign in to the same account and reopen this editor to recover your draft.';
    if (cause.code === 'account_storage_limit') return 'Your account storage limit has been reached. Your selection is still here.';
    if (cause.status === 413) return 'This file exceeds the allowed size. Choose a file up to 8 MiB.';
    if (cause.status === 422 || cause.status === 400) return 'Check your input. Supported files are JPG, PNG, WebP and PDF, up to 8 MiB.';
    if (cause.status === 429) return 'Your capture queue is busy. Keep this draft and retry after other captures finish.';
    if (cause.status === 409 || cause.status === 410)
      return 'This attempt needs review. Check Library before creating another save.';
  }
  return 'Save not confirmed. Check your connection and retry. Your draft remains in this account while RecallBox stays open.';
}
export const definitiveRejection = (cause: unknown) => cause instanceof ApiError &&
  cause.code !== 'session_changed' && [400,401,413,422].includes(cause.status);
