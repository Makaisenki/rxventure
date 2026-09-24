import { json, requireAdmin, supabase } from '../../_lib.js';

export async function onRequestDelete({ request, env }) {
  if (!await requireAdmin(request, env)) return json({ error: 'Administrator sign-in required.' }, 401);
  const response = await supabase(env, 'leaderboard_entries?id=not.is.null', { method: 'DELETE' });
  return response.ok ? json({ ok: true }) : json({ error: 'Unable to clear leaderboards.' }, 503);
}
