import { json, supabase } from '../_lib.js';

const DEFAULT_QUESTION_COUNT = 30;
const DEFAULT_MAX_LIVES = 5;

export async function onRequestGet({ env }) {
  const response = await supabase(env, 'game_settings?key=in.(question_count,max_lives)&select=key,value');
  if (!response.ok) return json({ error: 'Game settings are unavailable.' }, 503);
  const settings = await response.json();
  const values = Object.fromEntries(settings.map((setting) => [setting.key, Number(setting.value)]));
  const questionCount = values.question_count;
  const maxLives = values.max_lives;
  return json({
    questionCount: Number.isInteger(questionCount) && questionCount >= 5 && questionCount <= 50 && questionCount % 5 === 0 ? questionCount : DEFAULT_QUESTION_COUNT,
    maxLives: Number.isInteger(maxLives) && maxLives >= 3 && maxLives <= 5 ? maxLives : DEFAULT_MAX_LIVES,
  });
}
