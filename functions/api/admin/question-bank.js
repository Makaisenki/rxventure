import { isValidBank, json, requireAdmin, storage, supabase } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!await requireAdmin(request, env)) return json({ error: 'Administrator sign-in required.' }, 401);
  const form = await request.formData().catch(() => null);
  const sourceName = String(form?.get('sourceName') ?? 'Uploaded workbook').slice(0, 120);
  const workbook = form?.get('workbook');
  let bank;
  try { bank = JSON.parse(String(form?.get('bank') ?? '')); } catch { bank = null; }
  if (!isValidBank(bank)) return json({ error: 'The workbook does not contain a valid 50-question pool for every role.' }, 400);
  if (!(workbook instanceof File) || workbook.size === 0 || workbook.size > 10_000_000) return json({ error: 'Upload an Excel workbook smaller than 10 MB.' }, 400);
  const safeName = sourceName.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const sourcePath = `question-banks/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const stored = await storage(env, `object/question-banks/${sourcePath}`, { method: 'POST', headers: { 'content-type': workbook.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'x-upsert': 'false' }, body: await workbook.arrayBuffer() });
  if (!stored.ok) return json({ error: 'Unable to secure the original workbook.' }, 503);
  await supabase(env, 'question_banks?active=eq.true', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: false }) });
  const response = await supabase(env, 'question_banks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: bank, source_name: sourceName, source_path: sourcePath, active: true, is_default: false }) });
  return response.ok ? json({ ok: true }) : json({ error: 'Unable to activate question bank.' }, 503);
}
