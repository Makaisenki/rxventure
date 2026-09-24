import { isValidBank, json, requireAdmin, supabase } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!await requireAdmin(request, env)) return json({ error: 'Administrator sign-in required.' }, 401);
  const { bank } = await request.json().catch(() => ({}));
  if (!isValidBank(bank)) return json({ error: 'Bundled question bank is invalid.' }, 400);
  await supabase(env, 'question_banks?active=eq.true', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: false }) });
  const response = await supabase(env, 'question_banks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: bank, source_name: 'Bundled Question Bank', active: true, is_default: true }) });
  return response.ok ? json({ ok: true }) : json({ error: 'Unable to restore bundled question bank.' }, 503);
}
