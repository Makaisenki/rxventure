import * as XLSX from 'xlsx';

export type Role = 'Pharmacist' | 'Pharmacy Technician/Executive/Assistant' | 'Storekeeper/Health Assistant' | 'Retail Staff';
export type Question = { id: string; category: string; prompt: string; options: string[]; answer: string };
export type Bank = { roles: Record<Role, string[]>; questions: Question[] };

export const RUN_QUESTION_COUNT = 30;
export const QUESTIONS_PER_BIOME = 6;

const roles = ['Pharmacist', 'Pharmacy Technician/Executive/Assistant', 'Storekeeper/Health Assistant', 'Retail Staff'] as const;
// Workbook authors may use the shorter label shown on the character-selection
// screen. Keep the canonical role key internally so existing saved banks and
// gameplay code remain compatible with older workbooks.
const roleHeaderAliases: Record<Role, string[]> = {
  Pharmacist: ['Pharmacist'],
  'Pharmacy Technician/Executive/Assistant': ['Pharmacy Technician/Executive/Assistant', 'PA / PT / PE'],
  'Storekeeper/Health Assistant': ['Storekeeper/Health Assistant', 'SK / HA'],
  'Retail Staff': ['Retail Staff'],
};
const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
const aliases: Record<string, string> = {
  'code grey': 'code grey / blue', 'code blue': 'code grey / blue',
  'returning controlled drug (cd)': 'returning controlled drugs',
  'automation & pharmacy systems': 'opas',
};
const canon = (value: string) => aliases[value.trim().toLowerCase()] ?? value.trim().toLowerCase();

export function parseWorkbook(data: ArrayBuffer): Bank {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The workbook does not contain a worksheet.');
  const rows = XLSX.utils.sheet_to_json<(string | undefined)[]>(sheet, { header: 1, defval: '' });
  const header = rows[0] ?? [];
  const requirements = rows[1] ?? [];
  const questionHeaders = rows[4] ?? [];
  const expectedQuestionHeaders = ['Category', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer'];
  if (normalizeHeader(String(header[0] ?? '')) !== 'job role' || normalizeHeader(String(requirements[0] ?? '')) !== 'required question categories') {
    throw new Error('Use the current question-bank layout: job roles on row 1 and required categories on row 2.');
  }
  if (!expectedQuestionHeaders.every((label, column) => normalizeHeader(String(questionHeaders[column] ?? '')) === normalizeHeader(label))) {
    throw new Error('Use the current question table headers on row 5: Category, Question, Option A, Option B, Option C, Option D, Answer.');
  }
  const mappedRoles = {} as Record<Role, string[]>;
  for (const [roleIndex, role] of roles.entries()) {
    const acceptedHeaders = roleHeaderAliases[role].map(normalizeHeader);
    const column = roleIndex + 1;
    if (!acceptedHeaders.includes(normalizeHeader(String(header[column] ?? '')))) throw new Error(`Missing role column: ${role}`);
    mappedRoles[role] = String(requirements[column] ?? '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!mappedRoles[role].length) throw new Error(`Add at least one required question category for ${role}.`);
  }
  const questions = rows.slice(5).flatMap((row, index) => {
    const category = String(row[0] ?? '').trim();
    const prompt = String(row[1] ?? '').trim();
    const options = [2, 3, 4, 5].map((column) => String(row[column] ?? '').trim());
    const answer = String(row[6] ?? '').trim().toUpperCase();
    const hasQuestionData = [category, prompt, ...options, answer].some(Boolean);
    if (!hasQuestionData) return [];
    const rowNumber = index + 6;
    if (!category || !prompt || options.some((option) => !option) || !/^[A-D]$/.test(answer)) {
      throw new Error(`Question row ${rowNumber} must include a category, question, four options, and an answer from A to D.`);
    }
    return [{ id: `${canon(category)}-${rowNumber}-${prompt.slice(0, 20)}`, category, prompt, options, answer }];
  });
  if (questions.length < RUN_QUESTION_COUNT) throw new Error(`The workbook must contain at least ${RUN_QUESTION_COUNT} valid questions.`);
  for (const role of roles) {
    if (eligibleQuestions({ roles: mappedRoles, questions }, role).length < RUN_QUESTION_COUNT) throw new Error(`${role} has fewer than ${RUN_QUESTION_COUNT} eligible questions.`);
  }
  return { roles: mappedRoles, questions };
}

export function eligibleQuestions(bank: Bank, role: Role) {
  const allowed = new Set(bank.roles[role].map(canon));
  return bank.questions.filter((question) => allowed.has(canon(question.category)));
}

export function selectRun(bank: Bank, role: Role, count = RUN_QUESTION_COUNT): Question[] {
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
