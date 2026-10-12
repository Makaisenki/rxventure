import { json, requireAdmin, supabase } from '../../_lib.js';

const validName = (value) => typeof value === 'string' && /^[\p{L}\p{N} .,'&()/-]{1,80}$/u.test(value.trim());
const validPosition = (value) => Number.isInteger(value) && value >= 0 && value <= 10000;

export async function onRequestGet({ request, env }) {
  if (!await requireAdmin(request, env)) return json({ error: 'Administrator sign-in required.' }, 401);
  const response = await supabase(env, 'branches?select=id,name,position,active&order=position.asc,name.asc');
  return response.ok ? json({ branches: await response.json() }) : json({ error: 'Unable to load branches.' }, 503);
}

export async function onRequestPost({ request, env }) {
  if (!await requireAdmin(request, env)) return json({ error: 'Administrator sign-in required.' }, 401);
  const { name, position } = await request.json().catch(() => ({}));
  if (!validName(name) || (position !== undefined && !validPosition(position))) return json({ error: 'Enter a valid branch name.' }, 400);
  const response = await supabase(env, 'branches', { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ name: name.trim(), position: position ?? 0 }) });
  if (!response.ok) return json({ error: 'Unable to add branch. Names must be unique.' }, 503);
  const [branch] = await response.json();
  return json({ branch }, 201);
}

export async function onRequestPatch({ request, env }) {
  if (!await requireAdmin(request, env)) return json({ error: 'Administrator sign-in required.' }, 401);
  const { id, name, active, position } = await request.json().catch(() => ({}));
  if (typeof id !== 'string' || (name !== undefined && !validName(name)) || (active !== undefined && typeof active !== 'boolean') || (position !== undefined && !validPosition(position))) return json({ error: 'Invalid branch update.' }, 400);
  const update = {}; if (name !== undefined) update.name = name.trim(); if (active !== undefined) update.active = active; if (position !== undefined) update.position = position;
  const response = await supabase(env, `branches?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify(update) });
  if (!response.ok) return json({ error: 'Unable to update branch.' }, 503);
  const [branch] = await response.json();
  return branch ? json({ branch }) : json({ error: 'Branch not found.' }, 404);
}
