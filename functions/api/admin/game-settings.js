import { json, requireAdmin, supabase } from '../../_lib.js';

const validQuestionCount = (value) => Number.isInteger(value) && value >= 5 && value <= 30 && value % 5 === 0;

export async function onRequestPatch({ request, env }) {
  if (!await requireAdmin(request, env)) return json({ error: 'Administrator sign-in required.' }, 401);
  const { questionCount } = await request.json().catch(() => ({}));
  if (!validQuestionCount(questionCount)) return json({ error: 'Choose a question count from 5 to 30 in steps of 5.' }, 400);
  const response = await supabase(env, 'game_settings', { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'return=representation,resolution=merge-duplicates' }, body: JSON.stringify({ key: 'question_count', value: questionCount }) });
  if (!response.ok) return json({ error: 'Unable to update the question count.' }, 503);
  return json({ questionCount });
}
