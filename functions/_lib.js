const ROLES = ['Pharmacist', 'Pharmacy Technician/Executive/Assistant', 'Storekeeper/Health Assistant', 'Retail Staff'];
const rateWindow = new Map();

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export function supabase(env, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...(init.headers ?? {}) } });
}

export function storage(env, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}/storage/v1/${path}`, { ...init, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...(init.headers ?? {}) } });
}

export async function requireAdmin(request, env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !env.ADMIN_EMAIL) return false;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
  if (!response.ok) return false;
  const user = await response.json();
  return user.email?.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
}

export function isValidBank(bank) {
  if (!bank || !Array.isArray(bank.questions) || !bank.roles || bank.questions.length < 50) return false;
  return ROLES.every((role) => Array.isArray(bank.roles[role]) && bank.questions.filter((question) => bank.roles[role].map((item) => String(item).trim().toLowerCase()).includes(String(question.category).trim().toLowerCase())).length >= 50)
    && bank.questions.every((question) => typeof question.id === 'string' && typeof question.prompt === 'string' && Array.isArray(question.options) && question.options.length === 4 && /^[A-D]$/.test(question.answer));
}

export function allowSubmission(request) {
  const key = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const now = Date.now(); const entries = (rateWindow.get(key) ?? []).filter((time) => now - time < 60_000);
  if (entries.length >= 5) return false;
  entries.push(now); rateWindow.set(key, entries); return true;
}

export { ROLES };
