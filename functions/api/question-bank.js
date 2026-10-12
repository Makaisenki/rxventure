import { json, supabase } from '../_lib.js';

export async function onRequestGet({ env }) {
  const response = await supabase(env, 'question_banks?active=eq.true&select=id,data&order=created_at.desc&limit=1');
  if (!response.ok) return json({ error: 'Question-bank service unavailable.' }, 503);
  const rows = await response.json();
  return json({ bank: rows[0] ? { id: rows[0].id, data: rows[0].data } : null });
}
