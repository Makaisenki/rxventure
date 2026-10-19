import { allowAttempt, json, ROLES, supabase } from '../_lib.js';

const validName = (value) => typeof value === 'string' && /^[\p{L}\p{N} _.-]{1,16}$/u.test(value.trim());
const validId = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function onRequestPost({ request, env }) {
  if (!allowAttempt(request)) return json({ error: 'Please wait before starting another run.' }, 429);
  const { bankId, branchId, role, playerName } = await request.json().catch(() => ({}));
  if (!validId(bankId) || !validId(branchId) || !ROLES.includes(role) || !validName(playerName)) return json({ error: 'Enter a valid player name and branch.' }, 400);
  const [bankResponse, branchResponse] = await Promise.all([
    supabase(env, `question_banks?id=eq.${encodeURIComponent(bankId)}&active=eq.true&select=id&limit=1`),
    supabase(env, `branches?id=eq.${encodeURIComponent(branchId)}&active=eq.true&select=id,name&limit=1`),
  ]);
  if (!bankResponse.ok || !branchResponse.ok) return json({ error: 'Playthrough tracking is temporarily unavailable.' }, 503);
  const banks = await bankResponse.json(); const branches = await branchResponse.json();
  if (!banks[0] || !branches[0]) return json({ error: 'This game session is no longer available for tracked play.' }, 409);
  const response = await supabase(env, 'playthroughs', { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ question_bank_id: bankId, branch_id: branchId, branch_name: branches[0].name, role, player_name: playerName.trim() }) });
  if (!response.ok) return json({ error: 'Unable to begin a tracked run.' }, 503);
  const [run] = await response.json();
  return json({ run: { id: run.id } }, 201);
}

export async function onRequestPatch({ request, env }) {
  const { id, score, completed } = await request.json().catch(() => ({}));
  if (!validId(id) || !Number.isInteger(score) || score < 0 || score > 3000 || typeof completed !== 'boolean') return json({ error: 'Invalid playthrough result.' }, 400);
  const response = await supabase(env, `playthroughs?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ score, completed, finished_at: new Date().toISOString() }) });
  return response.ok ? json({ ok: true }) : json({ error: 'Unable to save the playthrough result.' }, 503);
}
