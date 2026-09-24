import * as XLSX from 'xlsx';

export type Role = 'Pharmacist' | 'Pharmacy Technician/Executive/Assistant' | 'Storekeeper/Health Assistant' | 'Retail Staff';
export type Question = { id: string; category: string; prompt: string; options: string[]; answer: string };
export type Bank = { roles: Record<Role, string[]>; questions: Question[] };

const roles = ['Pharmacist', 'Pharmacy Technician/Executive/Assistant', 'Storekeeper/Health Assistant', 'Retail Staff'] as const;
const aliases: Record<string, string> = {
  'code grey': 'code grey / blue', 'code blue': 'code grey / blue',
  'returning controlled drug (cd)': 'returning controlled drugs',
  'automation & pharmacy systems': 'opas',
};
const canon = (value: string) => aliases[value.trim().toLowerCase()] ?? value.trim().toLowerCase();

function parseBlock(category: string, source: string): Question[] {
  const blocks = source.split(/(?=^Question\s+\d+)/m).filter(Boolean);
  return blocks.flatMap((block, index) => {
    const answer = block.match(/✅\s*Answer:\s*([A-D])/i)?.[1]?.toUpperCase();
    const firstOption = block.search(/^A\.\s*/m);
    if (!answer || firstOption < 0) return [];
    const prompt = block.slice(0, firstOption).replace(/^Question\s+\d+\s*/i, '').trim();
    const choiceText = block.slice(firstOption).replace(/✅\s*Answer:[\s\S]*/i, '');
    const matches = [...choiceText.matchAll(/^([A-D])\.\s*([\s\S]*?)(?=^[A-D]\.\s*|$)/gm)];
    const values = matches.map((match) => match[2].trim().replace(/\n+/g, ' '));
    return values.length === 4 ? [{ id: `${canon(category)}-${index}-${prompt.slice(0, 20)}`, category, prompt, options: values, answer }] : [];
  });
}

export function parseWorkbook(data: ArrayBuffer): Bank {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The workbook does not contain a worksheet.');
  const rows = XLSX.utils.sheet_to_json<(string | undefined)[]>(sheet, { header: 1, defval: '' });
  const header = rows[1] ?? [];
  const requirements = rows[2] ?? [];
  const mappedRoles = {} as Record<Role, string[]>;
  for (const role of roles) {
    const column = header.findIndex((cell) => String(cell).trim() === role);
    if (column < 0) throw new Error(`Missing role column: ${role}`);
    mappedRoles[role] = String(requirements[column] ?? '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
  const questions = rows.slice(5).flatMap((row) => {
    const category = String(row[0] ?? '').trim();
    const block = String(row[1] ?? '');
    return category && block ? parseBlock(category, block) : [];
  });
  if (questions.length < 50) throw new Error('The workbook must contain at least 50 valid questions.');
  for (const role of roles) {
    if (eligibleQuestions({ roles: mappedRoles, questions }, role).length < 50) throw new Error(`${role} has fewer than 50 eligible questions.`);
  }
  return { roles: mappedRoles, questions };
}

export function eligibleQuestions(bank: Bank, role: Role) {
  const allowed = new Set(bank.roles[role].map(canon));
  return bank.questions.filter((question) => allowed.has(canon(question.category)));
}

export function selectRun(bank: Bank, role: Role, count = 50): Question[] {
  const pool = eligibleQuestions(bank, role);
  const groups = new Map<string, Question[]>();
  pool.forEach((question) => { const key = canon(question.category); groups.set(key, [...(groups.get(key) ?? []), question]); });
  const buckets = [...groups.values()].map((items) => [...items].sort(() => Math.random() - 0.5));
  const selected: Question[] = [];
  while (selected.length < count && buckets.some((bucket) => bucket.length)) {
    for (const bucket of buckets) if (bucket.length && selected.length < count) selected.push(bucket.pop()!);
  }
  return selected.sort(() => Math.random() - 0.5);
}

export const roleList = roles;
