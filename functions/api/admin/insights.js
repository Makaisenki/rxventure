import { json, requireAdmin, supabase } from '../../_lib.js';

const MINIMUM_ATTEMPTS = 5;

async function activeBank(env) {
  const response = await supabase(env, 'question_banks?active=eq.true&select=id&limit=1');
  if (!response.ok) return null;
  const [bank] = await response.json();
  return bank ?? null;
}

async function attemptsForBank(env, bankId) {
  const response = await supabase(env, `question_attempts?question_bank_id=eq.${encodeURIComponent(bankId)}&select=question_id,category,prompt,branch_id,branch_name,correct,created_at&order=created_at.asc&limit=100000`);
  return response.ok ? response.json() : null;
}

export async function onRequestGet({ request, env }) {
  if (!await requireAdmin(request, env)) return json({ error: 'Administrator sign-in required.' }, 401);
  const bank = await activeBank(env); if (!bank) return json({ bankId: null, minimumAttempts: MINIMUM_ATTEMPTS, questions: [] });
  const attempts = await attemptsForBank(env, bank.id); if (!attempts) return json({ error: 'Unable to load learning insights.' }, 503);
  const questions = new Map();
  for (const attempt of attempts) {
    const question = questions.get(attempt.question_id) ?? { id: attempt.question_id, category: attempt.category, prompt: attempt.prompt, attempts: 0, incorrect: 0, branches: new Map() };
    question.attempts += 1; if (!attempt.correct) question.incorrect += 1;
    const branch = question.branches.get(attempt.branch_id) ?? { id: attempt.branch_id, name: attempt.branch_name, attempts: 0, incorrect: 0 };
    branch.attempts += 1; if (!attempt.correct) branch.incorrect += 1;
    question.branches.set(attempt.branch_id, branch); questions.set(attempt.question_id, question);
  }
  const formatted = [...questions.values()].map((question) => ({
    id: question.id, category: question.category, prompt: question.prompt, attempts: question.attempts, incorrect: question.incorrect,
    incorrectRate: question.attempts ? question.incorrect / question.attempts : 0,
    branches: [...question.branches.values()].map((branch) => ({ ...branch, incorrectRate: branch.attempts >= MINIMUM_ATTEMPTS ? branch.incorrect / branch.attempts : null })).sort((a, b) => (b.incorrectRate ?? -1) - (a.incorrectRate ?? -1) || b.incorrect - a.incorrect),
  })).sort((a, b) => b.incorrectRate - a.incorrectRate || b.incorrect - a.incorrect || b.attempts - a.attempts);
  return json({ bankId: bank.id, minimumAttempts: MINIMUM_ATTEMPTS, questions: formatted });
}
