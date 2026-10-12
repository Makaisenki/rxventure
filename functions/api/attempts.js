import { allowAttempt, json, ROLES, supabase } from '../_lib.js';

const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit;

export async function onRequestPost({ request, env }) {
  if (!allowAttempt(request)) return json({ error: 'Please wait before submitting more answers.' }, 429);
  const { bankId, branchId, role, questionId, category, prompt, correct } = await request.json().catch(() => ({}));
  if (typeof bankId !== 'string' || typeof branchId !== 'string' || !ROLES.includes(role) || !text(questionId, 240) || !text(category, 240) || !text(prompt, 12000) || typeof correct !== 'boolean') return json({ error: 'Invalid answer attempt.' }, 400);
  const [bankResponse, branchResponse] = await Promise.all([
    supabase(env, `question_banks?id=eq.${encodeURIComponent(bankId)}&active=eq.true&select=id&limit=1`),
    supabase(env, `branches?id=eq.${encodeURIComponent(branchId)}&active=eq.true&select=id,name&limit=1`),
  ]);
  if (!bankResponse.ok || !branchResponse.ok) return json({ error: 'Answer tracking is temporarily unavailable.' }, 503);
  const banks = await bankResponse.json(); const branches = await branchResponse.json();
  if (!banks[0] || !branches[0]) return json({ error: 'This game session is no longer available for tracked play.' }, 409);
  const response = await supabase(env, 'question_attempts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question_bank_id: bankId, branch_id: branchId, branch_name: branches[0].name, role, question_id: questionId.trim(), category: category.trim(), prompt: prompt.trim(), correct }) });
  return response.ok ? json({ ok: true }, 201) : json({ error: 'Unable to save answer attempt.' }, 503);
}
