import { json, maximumSupportedRunLength, requireAdmin, supabase } from '../../_lib.js';

const validQuestionCount = (value) => Number.isInteger(value) && value >= 5 && value <= 50 && value % 5 === 0;
const validMaxLives = (value) => Number.isInteger(value) && value >= 3 && value <= 5;

export async function onRequestPatch({ request, env }) {
  if (!await requireAdmin(request, env)) return json({ error: 'Administrator sign-in required.' }, 401);
  const { questionCount, maxLives } = await request.json().catch(() => ({}));
  const isQuestionCountUpdate = questionCount !== undefined && maxLives === undefined;
  const isMaxLivesUpdate = maxLives !== undefined && questionCount === undefined;
  if (isQuestionCountUpdate && !validQuestionCount(questionCount)) return json({ error: 'Choose a question count from 5 to 50 in steps of 5.' }, 400);
  if (isMaxLivesUpdate && !validMaxLives(maxLives)) return json({ error: 'Choose between 3 and 5 lives.' }, 400);
  if (!isQuestionCountUpdate && !isMaxLivesUpdate) return json({ error: 'Update one game setting at a time.' }, 400);
  if (isQuestionCountUpdate) {
    const bankResponse = await supabase(env, 'question_banks?active=eq.true&select=data&order=created_at.desc&limit=1');
    if (!bankResponse.ok) return json({ error: 'Unable to validate the active question bank.' }, 503);
    const [activeBank] = await bankResponse.json();
    const maximumQuestionCount = maximumSupportedRunLength(activeBank?.data);
    if (questionCount > maximumQuestionCount) return json({ error: `The active question bank supports up to ${maximumQuestionCount} questions per run across all roles.` }, 400);
  }
  const key = isQuestionCountUpdate ? 'question_count' : 'max_lives';
  const value = isQuestionCountUpdate ? questionCount : maxLives;
  const response = await supabase(env, 'game_settings', { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'return=representation,resolution=merge-duplicates' }, body: JSON.stringify({ key, value }) });
  if (!response.ok) return json({ error: 'Unable to update the game setting.' }, 503);
  return json(isQuestionCountUpdate ? { questionCount } : { maxLives });
}
