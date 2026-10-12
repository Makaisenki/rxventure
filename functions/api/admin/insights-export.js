import { requireAdmin, supabase } from '../../_lib.js';

const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = (rows) => rows.map((row) => row.map(quote).join(',')).join('\r\n');

export async function onRequestGet({ request, env }) {
  if (!await requireAdmin(request, env)) return new Response(JSON.stringify({ error: 'Administrator sign-in required.' }), { status: 401, headers: { 'content-type': 'application/json' } });
  const format = new URL(request.url).searchParams.get('format');
  if (format !== 'summary' && format !== 'detail') return new Response(JSON.stringify({ error: 'Choose summary or detail export.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  const bankResponse = await supabase(env, 'question_banks?active=eq.true&select=id&limit=1');
  if (!bankResponse.ok) return new Response(JSON.stringify({ error: 'Unable to load active question bank.' }), { status: 503, headers: { 'content-type': 'application/json' } });
  const [bank] = await bankResponse.json();
  const attemptResponse = bank ? await supabase(env, `question_attempts?question_bank_id=eq.${encodeURIComponent(bank.id)}&select=question_id,category,prompt,branch_name,role,correct,created_at&order=created_at.asc&limit=100000`) : null;
  if (attemptResponse && !attemptResponse.ok) return new Response(JSON.stringify({ error: 'Unable to load answer attempts.' }), { status: 503, headers: { 'content-type': 'application/json' } });
  const attempts = attemptResponse ? await attemptResponse.json() : [];
  let rows;
  if (format === 'detail') rows = [['Question ID', 'Category', 'Question', 'Branch', 'Role', 'Correct', 'Answered at'], ...attempts.map((item) => [item.question_id, item.category, item.prompt, item.branch_name, item.role, item.correct ? 'Yes' : 'No', item.created_at])];
  else {
    const groups = new Map();
    for (const item of attempts) { const key = `${item.question_id}\u0000${item.branch_name}`; const group = groups.get(key) ?? { ...item, attempts: 0, incorrect: 0 }; group.attempts += 1; if (!item.correct) group.incorrect += 1; groups.set(key, group); }
    rows = [['Question ID', 'Category', 'Question', 'Branch', 'Attempts', 'Incorrect answers', 'Incorrect rate'], ...[...groups.values()].map((item) => [item.question_id, item.category, item.prompt, item.branch_name, item.attempts, item.incorrect, `${((item.incorrect / item.attempts) * 100).toFixed(1)}%`])];
  }
  return new Response(csv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="rxventure-${format}-active-bank.csv"`, 'cache-control': 'no-store' } });
}
