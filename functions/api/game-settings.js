import { json, supabase } from '../_lib.js';

const DEFAULT_QUESTION_COUNT = 30;

export async function onRequestGet({ env }) {
  const response = await supabase(env, 'game_settings?key=eq.question_count&select=value&limit=1');
  if (!response.ok) return json({ error: 'Game settings are unavailable.' }, 503);
  const [setting] = await response.json();
  const questionCount = Number(setting?.value);
  return json({ questionCount: Number.isInteger(questionCount) && questionCount >= 5 && questionCount <= 30 && questionCount % 5 === 0 ? questionCount : DEFAULT_QUESTION_COUNT });
}
