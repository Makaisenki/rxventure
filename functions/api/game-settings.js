import { json, maximumSupportedRunLength, supabase } from '../_lib.js';

const DEFAULT_QUESTION_COUNT = 30;
const DEFAULT_MAX_LIVES = 5;
const MAX_RUN_QUESTION_COUNT = 50;

export async function onRequestGet({ env }) {
  const [settingsResponse, bankResponse] = await Promise.all([
    supabase(env, 'game_settings?key=in.(question_count,max_lives)&select=key,value'),
    supabase(env, 'question_banks?active=eq.true&select=data&order=created_at.desc&limit=1'),
  ]);
  if (!settingsResponse.ok || !bankResponse.ok) return json({ error: 'Game settings are unavailable.' }, 503);
  const settings = await settingsResponse.json();
  const [activeBank] = await bankResponse.json();
  const values = Object.fromEntries(settings.map((setting) => [setting.key, Number(setting.value)]));
  const questionCount = values.question_count;
  const maxLives = values.max_lives;
  const maximumQuestionCount = activeBank ? maximumSupportedRunLength(activeBank.data) : MAX_RUN_QUESTION_COUNT;
  const configuredQuestionCount = Number.isInteger(questionCount) && questionCount >= 5 && questionCount <= 50 && questionCount % 5 === 0 ? questionCount : DEFAULT_QUESTION_COUNT;
  return json({
    questionCount: Math.min(configuredQuestionCount, maximumQuestionCount),
    maxLives: Number.isInteger(maxLives) && maxLives >= 3 && maxLives <= 5 ? maxLives : DEFAULT_MAX_LIVES,
    maximumQuestionCount,
  });
}
