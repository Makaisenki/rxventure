import { allowSubmission, json, ROLES, supabase } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const role = new URL(request.url).searchParams.get('role');
  if (!ROLES.includes(role)) return json({ error: 'Invalid role.' }, 400);
  const response = await supabase(env, `leaderboard_entries?role=eq.${encodeURIComponent(role)}&select=nickname,branch_name,score,created_at&order=score.desc,created_at.asc&limit=20`);
  if (!response.ok) return json({ error: 'Leaderboard service unavailable.' }, 503);
  const rows = await response.json();
  return json({ entries: rows.map((row) => ({ name: row.nickname, branch: row.branch_name ?? null, score: row.score, at: Date.parse(row.created_at) })) });
}

export async function onRequestPost({ request, env }) {
  if (!allowSubmission(request)) return json({ error: 'Please wait before submitting another score.' }, 429);
  const { role, name, score, branch } = await request.json().catch(() => ({}));
  const nickname = typeof name === 'string' ? name.trim() : '';
  const branchName = typeof branch === 'string' ? branch.trim() : '';
  if (!ROLES.includes(role) || !/^[\p{L}\p{N} _.-]{1,16}$/u.test(nickname) || (branchName && (branchName.length > 80 || /[<>]/.test(branchName))) || !Number.isInteger(score) || score < 0 || score > 3000) return json({ error: 'Invalid score submission.' }, 400);
  const response = await supabase(env, 'leaderboard_entries', { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ role, nickname, branch_name: branchName || null, score }) });
  if (!response.ok) return json({ error: 'Unable to save score.' }, 503);
  const [entry] = await response.json();
  const aheadResponse = await supabase(env, `leaderboard_entries?role=eq.${encodeURIComponent(role)}&or=${encodeURIComponent(`(score.gt.${score},and(score.eq.${score},created_at.lt.${entry.created_at}))`)}&select=id&limit=100000`);
  const ahead = aheadResponse.ok ? await aheadResponse.json() : [];
  return json({ entry: { name: entry.nickname, branch: entry.branch_name ?? null, score: entry.score, at: Date.parse(entry.created_at) }, rank: ahead.length + 1 }, 201);
}
