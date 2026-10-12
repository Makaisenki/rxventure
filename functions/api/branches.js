import { json, supabase } from '../_lib.js';

export async function onRequestGet({ env }) {
  const response = await supabase(env, 'branches?active=eq.true&select=id,name,position&order=position.asc,name.asc');
  if (!response.ok) return json({ error: 'Branch service unavailable.' }, 503);
  return json({ branches: await response.json() });
}
