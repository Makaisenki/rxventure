import { allowSubmission, json, ROLES, supabase } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const role = new URL(request.url).searchParams.get('role');
  if (!ROLES.includes(role)) return json({ error: 'Invalid role.' }, 400);
  const response = await supabase(env, `leaderboard_entries?role=eq.${encodeURIComponent(role)}&select=nickname,score,created_at&order=score.desc,created_at.asc&limit=20`);
  if (!response.ok) return json({ error: 'Leaderboard service unavailable.' }, 503);
  const rows = await response.json();
  return json({ entries: rows.map((row) => ({ name: row.nickname, score: row.score, at: Date.parse(row.created_at) })) });
}

export async function onRequestPost({ request, env }) {
  if (!allowSubmission(request)) return json({ error: 'Please wait before submitting another score.' }, 429);
  const { role, name, score } = await request.json().catch(() => ({}));
  const nickname = typeof name === 'string' ? name.trim() : '';
  if (!ROLES.includes(role) || !/^[\p{L}\p{N} _.-]{1,16}$/u.test(nickname) || !Number.isInteger(score) || score < 0 || score > 5000) return json({ error: 'Invalid score submission.' }, 400);
  const response = await supabase(env, 'leaderboard_entries', { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ role, nickname, score }) });
  if (!response.ok) return json({ error: 'Unable to save score.' }, 503);
  const [entry] = await response.json();
  return json({ entry: { name: entry.nickname, score: entry.score, at: Date.parse(entry.created_at) } }, 201);
}
