import type { Bank, Role } from './questionBank';

export type CloudScore = { name: string; branch: string | null; score: number; at: number };
export type ActiveBank = { id: string; data: Bank };
export type Branch = { id: string; name: string; position: number; active?: boolean };
export type AttemptInput = { bankId: string; branchId: string; role: Role; questionId: string; category: string; prompt: string; correct: boolean; runId?: string };
export type PlaythroughInput = { bankId: string; branchId: string; role: Role; playerName: string };
export type InsightBranch = { id: string; name: string; attempts: number; incorrect: number; incorrectRate: number | null };
export type InsightQuestion = { id: string; category: string; prompt: string; attempts: number; incorrect: number; incorrectRate: number; branches: InsightBranch[] };
export type LearningInsights = { bankId: string | null; minimumAttempts: number; questions: InsightQuestion[] };
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

export async function fetchActiveBank(): Promise<ActiveBank | null> { try { return (await api<{ bank: ActiveBank | null }>('question-bank')).bank; } catch { return null; } }
export async function fetchBranches(): Promise<Branch[]> { return (await api<{ branches: Branch[] }>('branches')).branches; }
export async function recordAttempt(attempt: AttemptInput) { return api<{ ok: boolean }>('attempts', { method: 'POST', body: JSON.stringify(attempt) }); }
export async function fetchScores(role: Role): Promise<CloudScore[]> { return (await api<{ entries: CloudScore[] }>(`leaderboard?role=${encodeURIComponent(role)}`)).entries; }
export async function createPlaythrough(input: PlaythroughInput) { return api<{ run: { id: string } }>('playthroughs', { method: 'POST', body: JSON.stringify(input) }); }
export async function finishPlaythrough(id: string, score: number, completed: boolean) { return api<{ ok: boolean }>('playthroughs', { method: 'PATCH', body: JSON.stringify({ id, score, completed }) }); }
export async function discardPlaythrough(id: string) { return api<{ ok: boolean }>(`playthroughs?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); }
export async function submitScore(role: Role, name: string, score: number, branch?: string) { return api<{ entry: CloudScore; rank: number }>('leaderboard', { method: 'POST', body: JSON.stringify({ role, name, score, branch }) }); }
export function isAdminSignedIn() { return Boolean(sessionStorage.getItem(TOKEN_KEY)); }

export async function signIn(email: string, password: string) {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase login is not configured yet.');
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: supabaseAnonKey, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!response.ok) throw new Error('Sign-in failed. Check the administrator email and password.');
  const data = await response.json() as { access_token: string };
  sessionStorage.setItem(TOKEN_KEY, data.access_token);
}

export function signOut() { sessionStorage.removeItem(TOKEN_KEY); }

export async function uploadBank(bank: Bank, workbook: File) {
  const form = new FormData(); form.set('bank', JSON.stringify(bank)); form.set('sourceName', workbook.name); form.set('workbook', workbook);
  const response = await fetch('/api/admin/question-bank', { method: 'POST', headers: adminHeaders(), body: form });
  if (!response.ok) throw new Error((await response.json().catch(() => ({ error: 'Unable to upload workbook.' }))).error ?? 'Unable to upload workbook.');
  return response.json() as Promise<{ ok: boolean; id: string }>;
}

export async function restoreBundledBank(bank: Bank) { return api<{ ok: boolean; id: string }>('admin/restore-bundled', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ bank }) }); }
export async function clearLeaderboards() { return api<{ ok: boolean }>('admin/leaderboards', { method: 'DELETE', headers: adminHeaders() }); }
export async function clearLearningInsights() { return api<{ ok: boolean }>('admin/insights', { method: 'DELETE', headers: adminHeaders() }); }
export async function fetchAdminBranches() { return (await api<{ branches: Branch[] }>('admin/branches', { headers: adminHeaders() })).branches; }
export async function createBranch(name: string, position: number) { return (await api<{ branch: Branch }>('admin/branches', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ name, position }) })).branch; }
export async function updateBranch(id: string, update: Partial<Pick<Branch, 'name' | 'active' | 'position'>>) { return (await api<{ branch: Branch }>('admin/branches', { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ id, ...update }) })).branch; }
export async function fetchLearningInsights() { return api<LearningInsights>('admin/insights', { headers: adminHeaders() }); }
export async function downloadLearningInsights(format: 'summary' | 'detail' | 'runs') {
  const response = await fetch(`/api/admin/insights-export?format=${format}`, { headers: adminHeaders() });
  if (!response.ok) throw new Error((await response.json().catch(() => ({ error: 'Unable to export insights.' }))).error ?? 'Unable to export insights.');
  const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = format === 'runs' ? 'rxventure-playthroughs-active-bank.csv' : `rxventure-${format}-active-bank.csv`; link.click(); URL.revokeObjectURL(url);
}
