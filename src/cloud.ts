import type { Bank, Role } from './questionBank';

export type CloudScore = { name: string; score: number; at: number };
const TOKEN_KEY = 'rxventure-admin-token';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({ error: 'Service unavailable.' }))).error ?? 'Service unavailable.');
  return response.json() as Promise<T>;
}

function adminHeaders() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error('Please sign in to administer the game.');
  return { authorization: `Bearer ${token}` };
}

export async function fetchActiveBank(): Promise<Bank | null> {
  try { return (await api<{ bank: Bank | null }>('question-bank')).bank; } catch { return null; }
}

export async function fetchScores(role: Role): Promise<CloudScore[]> {
  return (await api<{ entries: CloudScore[] }>(`leaderboard?role=${encodeURIComponent(role)}`)).entries;
}

export async function submitScore(role: Role, name: string, score: number) {
  return api<{ entry: CloudScore }>('leaderboard', { method: 'POST', body: JSON.stringify({ role, name, score }) });
}

export function isAdminSignedIn() { return Boolean(sessionStorage.getItem(TOKEN_KEY)); }

export async function signIn(email: string, password: string) {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase login is not configured yet.');
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: supabaseAnonKey, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error('Sign-in failed. Check the administrator email and password.');
  const data = await response.json() as { access_token: string };
  sessionStorage.setItem(TOKEN_KEY, data.access_token);
}

export function signOut() { sessionStorage.removeItem(TOKEN_KEY); }

export async function uploadBank(bank: Bank, workbook: File) {
  const form = new FormData();
  form.set('bank', JSON.stringify(bank));
  form.set('sourceName', workbook.name);
  form.set('workbook', workbook);
  const response = await fetch('/api/admin/question-bank', { method: 'POST', headers: adminHeaders(), body: form });
  if (!response.ok) throw new Error((await response.json().catch(() => ({ error: 'Unable to upload workbook.' }))).error ?? 'Unable to upload workbook.');
  return response.json() as Promise<{ ok: boolean }>;
}

export async function restoreBundledBank(bank: Bank) {
  return api<{ ok: boolean }>('admin/restore-bundled', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ bank }) });
}

export async function clearLeaderboards() {
  return api<{ ok: boolean }>('admin/leaderboards', { method: 'DELETE', headers: adminHeaders() });
}
