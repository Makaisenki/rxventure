const ROLES = ['Pharmacist', 'Pharmacy Technician/Executive/Assistant', 'Storekeeper/Health Assistant', 'Retail Staff'];
const MIN_RUN_QUESTION_COUNT = 5;
const MAX_RUN_QUESTION_COUNT = 50;
const CATEGORY_ALIASES = {
  'code grey': 'code grey / blue', 'code blue': 'code grey / blue',
  'returning controlled drug (cd)': 'returning controlled drugs',
  'automation & pharmacy systems': 'opas',
};
const canonicalCategory = (value) => CATEGORY_ALIASES[String(value).trim().toLowerCase()] ?? String(value).trim().toLowerCase();
const rateWindow = new Map();
const attemptRateWindow = new Map();

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

export function maximumSupportedRunLength(bank) {
  if (!bank?.roles || !Array.isArray(bank.questions)) return 0;
  const eligibleCounts = ROLES.map((role) => {
    if (!Array.isArray(bank.roles[role])) return 0;
    const categories = new Set(bank.roles[role].map(canonicalCategory));
    return bank.questions.filter((question) => categories.has(canonicalCategory(question.category))).length;
  });
  return Math.min(MAX_RUN_QUESTION_COUNT, Math.floor(Math.min(...eligibleCounts) / MIN_RUN_QUESTION_COUNT) * MIN_RUN_QUESTION_COUNT);
}

export function isValidBank(bank) {
  if (!bank || !Array.isArray(bank.questions) || !bank.roles || bank.questions.length < MIN_RUN_QUESTION_COUNT) return false;
  return maximumSupportedRunLength(bank) >= MIN_RUN_QUESTION_COUNT
    && bank.questions.every((question) => typeof question.id === 'string' && typeof question.prompt === 'string' && Array.isArray(question.options) && question.options.length === 4 && /^[A-D]$/.test(question.answer));
}

export function allowSubmission(request) {
  const key = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const now = Date.now(); const entries = (rateWindow.get(key) ?? []).filter((time) => now - time < 60_000);
  if (entries.length >= 5) return false;
  entries.push(now); rateWindow.set(key, entries); return true;
}

export function allowAttempt(request) {
  const key = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const now = Date.now(); const entries = (attemptRateWindow.get(key) ?? []).filter((time) => now - time < 60_000);
  if (entries.length >= 180) return false;
  entries.push(now); attemptRateWindow.set(key, entries); return true;
}

export { ROLES };
