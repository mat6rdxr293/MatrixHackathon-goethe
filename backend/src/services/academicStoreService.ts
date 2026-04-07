import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  Achievement,
  GradePoint,
  JournalFilterScope,
  JournalGradeRow,
  JournalScopeInfo,
  StudentProfile,
  SubjectPracticeAnswerInput,
  SubjectPracticeOption,
  SubjectPracticePair,
  SubjectPracticeQuestion,
  SubjectPracticeQuestionInput,
  SubjectPracticeQuestionType,
} from "../types";

type StudentProfileRow = {
  student_id: string;
  full_name: string;
  class_id: string;
  average_score: number;
  weak_subjects: string;
  created_at: string;
  updated_at: string;
};

type SubjectProgressRow = {
  id: string;
  student_id: string;
  subject: string;
  current_score: number;
  trend: number;
  risk: number;
  history_json: string;
  created_at: string;
  updated_at: string;
};

type AchievementRow = {
  id: string;
  student_id: string;
  title: string;
  type: Achievement["type"];
  badge: string;
  date: string;
  points: number;
  proof_url: string | null;
  proof_note: string | null;
  proof_file_name: string | null;
  proof_file_mime: string | null;
  proof_file_data_url: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  verification_status: "verified" | "pending" | null;
  verified_at: string | null;
  verified_by: string | null;
  verification_method: string | null;
  verification_evidence: string | null;
  created_at: string;
};

type JournalGradeDbRow = {
  id: string;
  student_id: string;
  edu_year: number;
  period: number;
  period_type: string;
  subject_id: number | null;
  subject_uuid: string | null;
  subject_name: string;
  schedule_uuid: string;
  lesson_date: string;
  lesson_time: string;
  mark_type: string;
  mark_max: number | null;
  score_raw: string;
  score_five: number | null;
  synced_at: string;
};

type SubjectPracticeQuestionRow = {
  id: string;
  subject: string;
  type: SubjectPracticeQuestionType;
  prompt: string;
  explanation: string | null;
  options_json: string | null;
  correct_option_id: string | null;
  correct_option_ids_json: string | null;
  accepted_answers_json: string | null;
  left_items_json: string | null;
  right_items_json: string | null;
  correct_pairs_json: string | null;
  order_items_json: string | null;
  correct_order_json: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const resolveDbPath = () => {
  const rawPath = process.env.DB_PATH?.trim();
  if (rawPath) {
    return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  }
  return path.resolve(process.cwd(), "data", "portal.sqlite");
};

const parseJsonArray = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [] as string[];
  }
};

const parseJsonValue = <T>(value: string | null, fallback: T): T => {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const sanitizeJournalScoreRaw = (value: string) =>
  value
    .replace(/РІР‚вЂќ/g, "-")
    .replace(/вЂ”/g, "-")
    .replace(/—/g, "-")
    .replace(/вЂ/g, "-")
    .replace(/-{2,}/g, "-")
    .trim();

const parseHistory = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [] as GradePoint[];
    }
    return parsed
      .filter(
        (item): item is GradePoint =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { date?: unknown }).date === "string" &&
          Number.isFinite(Number((item as { score?: unknown }).score)),
      )
      .map((item) => ({
        date: item.date,
        score: Number(item.score),
      }));
  } catch {
    return [] as GradePoint[];
  }
};

const normalizeHistory = (history: GradePoint[], currentScore: number): GradePoint[] => {
  if (history.length > 0) {
    return history.map((point) => ({
      date: point.date,
      score: Number(Number(point.score).toFixed(2)),
    }));
  }
  return [{ date: new Date().toISOString().slice(0, 10), score: Number(currentScore.toFixed(2)) }];
};

const mapAchievement = (row: AchievementRow): Achievement => ({
  id: row.id,
  studentId: row.student_id,
  title: row.title,
  type: row.type,
  badge: row.badge,
  date: row.date,
  points: row.points,
  proofUrl: row.proof_url ?? undefined,
  proofNote: row.proof_note ?? undefined,
  proofAttachment:
    row.proof_file_name && row.proof_file_mime && row.proof_file_data_url
      ? {
          fileName: row.proof_file_name,
          mimeType: row.proof_file_mime,
          dataUrl: row.proof_file_data_url,
        }
      : undefined,
  submittedBy: row.submitted_by ?? undefined,
  submittedAt: row.submitted_at ?? undefined,
  verification: row.verification_status
    ? {
        status: row.verification_status,
        verifiedAt: row.verified_at ?? undefined,
        verifiedBy: row.verified_by ?? undefined,
        method: row.verification_method ?? undefined,
        evidence: row.verification_evidence ?? undefined,
      }
    : undefined,
});

const mapJournalGrade = (row: JournalGradeDbRow): JournalGradeRow => ({
  id: row.id,
  studentId: row.student_id,
  eduYear: row.edu_year,
  period: row.period,
  periodType: row.period_type,
  subjectId: row.subject_id ?? undefined,
  subjectUuid: row.subject_uuid ?? undefined,
  subjectName: row.subject_name,
  scheduleUuid: row.schedule_uuid || undefined,
  lessonDate: row.lesson_date,
  lessonTime: row.lesson_time || undefined,
  markType: row.mark_type || undefined,
  markMax: row.mark_max ?? undefined,
  scoreRaw: sanitizeJournalScoreRaw(row.score_raw),
  scoreFive: row.score_five ?? undefined,
  syncedAt: row.synced_at,
});

const ensureOptions = (items: unknown, fallbackPrefix: string): SubjectPracticeOption[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  const result: SubjectPracticeOption[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const entry = items[index];
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const rawId = String((entry as { id?: unknown }).id ?? "").trim();
    const rawText = String((entry as { text?: unknown }).text ?? "").trim();
    if (!rawText) {
      continue;
    }
    result.push({
      id: rawId || `${fallbackPrefix}-${index + 1}`,
      text: rawText,
    });
  }
  return result;
};

const ensurePairs = (items: unknown): SubjectPracticePair[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  const result: SubjectPracticePair[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const leftId = String((entry as { leftId?: unknown }).leftId ?? "").trim();
    const rightId = String((entry as { rightId?: unknown }).rightId ?? "").trim();
    if (!leftId || !rightId) {
      continue;
    }
    result.push({ leftId, rightId });
  }
  return result;
};

const ensureStringList = (items: unknown): string[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  const result: string[] = [];
  for (const entry of items) {
    if (typeof entry !== "string") {
      continue;
    }
    const normalized = normalizeText(entry);
    if (!normalized) {
      continue;
    }
    result.push(normalized);
  }
  return [...new Set(result)];
};

const normalizeAnswerText = (value: string) => normalizeText(value).toLowerCase();

const mapSubjectPracticeQuestion = (row: SubjectPracticeQuestionRow): SubjectPracticeQuestion => {
  const base = {
    id: row.id,
    subject: row.subject,
    prompt: row.prompt,
    explanation: row.explanation ?? undefined,
    sortOrder: row.sort_order,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.type === "single_choice") {
    const options = ensureOptions(parseJsonValue<unknown>(row.options_json, []), "opt");
    const fallbackCorrectId = options[0]?.id ?? "";
    return {
      ...base,
      type: "single_choice",
      options,
      correctOptionId: row.correct_option_id ?? fallbackCorrectId,
    };
  }

  if (row.type === "multiple_choice") {
    const options = ensureOptions(parseJsonValue<unknown>(row.options_json, []), "opt");
    const optionIds = new Set(options.map((item) => item.id));
    const parsedIds = ensureStringList(parseJsonValue<unknown>(row.correct_option_ids_json, []));
    const correctOptionIds = parsedIds.filter((id) => optionIds.has(id));
    return {
      ...base,
      type: "multiple_choice",
      options,
      correctOptionIds,
    };
  }

  if (row.type === "short_answer") {
    return {
      ...base,
      type: "short_answer",
      acceptedAnswers: ensureStringList(parseJsonValue<unknown>(row.accepted_answers_json, [])),
    };
  }

  if (row.type === "matching") {
    return {
      ...base,
      type: "matching",
      leftItems: ensureOptions(parseJsonValue<unknown>(row.left_items_json, []), "left"),
      rightItems: ensureOptions(parseJsonValue<unknown>(row.right_items_json, []), "right"),
      correctPairs: ensurePairs(parseJsonValue<unknown>(row.correct_pairs_json, [])),
    };
  }

  return {
    ...base,
    type: "ordering",
    items: ensureOptions(parseJsonValue<unknown>(row.order_items_json, []), "ord"),
    correctOrder: ensureStringList(parseJsonValue<unknown>(row.correct_order_json, [])),
  };
};

const withoutAnswers = (question: SubjectPracticeQuestion): SubjectPracticeQuestion => {
  if (question.type === "single_choice") {
    return {
      ...question,
      correctOptionId: "",
    };
  }
  if (question.type === "short_answer") {
    return {
      ...question,
      acceptedAnswers: [],
    };
  }
  if (question.type === "matching") {
    return {
      ...question,
      correctPairs: [],
    };
  }
  if (question.type === "multiple_choice") {
    return {
      ...question,
      correctOptionIds: [],
    };
  }
  return {
    ...question,
    correctOrder: [],
  };
};

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('academic', 'sport', 'creative', 'social')),
    badge TEXT NOT NULL,
    date TEXT NOT NULL,
    points INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS student_profiles (
    student_id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    class_id TEXT NOT NULL,
    average_score REAL NOT NULL DEFAULT 0,
    weak_subjects TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS student_subject_progress (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    current_score REAL NOT NULL,
    trend REAL NOT NULL DEFAULT 0,
    risk INTEGER NOT NULL DEFAULT 0,
    history_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(student_id, subject),
    FOREIGN KEY(student_id) REFERENCES student_profiles(student_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS student_journal_grades (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    edu_year INTEGER NOT NULL,
    period INTEGER NOT NULL,
    period_type TEXT NOT NULL,
    subject_id INTEGER,
    subject_uuid TEXT,
    subject_name TEXT NOT NULL,
    schedule_uuid TEXT NOT NULL DEFAULT '',
    lesson_date TEXT NOT NULL,
    lesson_time TEXT NOT NULL DEFAULT '',
    mark_type TEXT NOT NULL DEFAULT '',
    mark_max REAL,
    score_raw TEXT NOT NULL DEFAULT '',
    score_five REAL,
    synced_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_student_profiles_class_id
    ON student_profiles(class_id);

  CREATE INDEX IF NOT EXISTS idx_student_subject_progress_student_id
    ON student_subject_progress(student_id);

  CREATE INDEX IF NOT EXISTS idx_student_journal_scope
    ON student_journal_grades(student_id, edu_year, period, period_type);

  CREATE INDEX IF NOT EXISTS idx_student_journal_date
    ON student_journal_grades(student_id, lesson_date DESC, lesson_time DESC);

  CREATE TABLE IF NOT EXISTS subject_sessions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    task_id INTEGER NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    time_spent_seconds INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_subject_sessions_student
    ON subject_sessions(student_id, subject);

  CREATE TABLE IF NOT EXISTS subject_practice_questions (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('single_choice', 'multiple_choice', 'short_answer', 'matching', 'ordering')),
    prompt TEXT NOT NULL,
    explanation TEXT,
    options_json TEXT,
    correct_option_id TEXT,
    correct_option_ids_json TEXT,
    accepted_answers_json TEXT,
    left_items_json TEXT,
    right_items_json TEXT,
    correct_pairs_json TEXT,
    order_items_json TEXT,
    correct_order_json TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_subject_practice_questions_subject
    ON subject_practice_questions(subject, sort_order, created_at);
`);

const ensureColumn = (table: string, column: string, definition: string) => {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!rows.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

ensureColumn("achievements", "proof_url", "TEXT");
ensureColumn("achievements", "proof_note", "TEXT");
ensureColumn("achievements", "proof_file_name", "TEXT");
ensureColumn("achievements", "proof_file_mime", "TEXT");
ensureColumn("achievements", "proof_file_data_url", "TEXT");
ensureColumn("achievements", "submitted_by", "TEXT");
ensureColumn("achievements", "submitted_at", "TEXT");
ensureColumn("achievements", "verification_status", "TEXT");
ensureColumn("achievements", "verified_at", "TEXT");
ensureColumn("achievements", "verified_by", "TEXT");
ensureColumn("achievements", "verification_method", "TEXT");
ensureColumn("achievements", "verification_evidence", "TEXT");
ensureColumn("subject_practice_questions", "correct_option_ids_json", "TEXT");

type DefaultSubjectSeed = {
  label: string;
  keyTerm: string;
  distractors: string[];
  shortAnswers: string[];
  matchPairs: Array<{ left: string; right: string }>;
  orderSteps: string[];
};

const DEFAULT_SUBJECT_SEEDS: Record<string, DefaultSubjectSeed> = {
  algebra: {
    label: "Алгебра",
    keyTerm: "многочлен",
    distractors: ["реактив", "континент", "фотосинтез"],
    shortAnswers: ["алгебра", "многочлен"],
    matchPairs: [
      { left: "x^2 + 5x + 6", right: "квадратный многочлен" },
      { left: "D = b^2 - 4ac", right: "дискриминант" },
      { left: "a(x+b)", right: "раскрытие скобок" },
    ],
    orderSteps: ["Прочитать условие", "Выбрать формулу", "Подставить значения", "Проверить ответ"],
  },
  geometry: {
    label: "Геометрия",
    keyTerm: "треугольник",
    distractors: ["реакция", "глагол", "алгоритм"],
    shortAnswers: ["геометрия", "треугольник"],
    matchPairs: [
      { left: "Сумма углов треугольника", right: "180 градусов" },
      { left: "Площадь прямоугольника", right: "S = a * b" },
      { left: "Пифагор", right: "a^2 + b^2 = c^2" },
    ],
    orderSteps: ["Сделать рисунок", "Отметить известные данные", "Применить теорему", "Записать вывод"],
  },
  physics: {
    label: "Физика",
    keyTerm: "ускорение",
    distractors: ["суффикс", "контурная карта", "валентность"],
    shortAnswers: ["физика", "ускорение"],
    matchPairs: [
      { left: "F = ma", right: "второй закон Ньютона" },
      { left: "U = IR", right: "закон Ома" },
      { left: "A = Fs", right: "механическая работа" },
    ],
    orderSteps: ["Выбрать систему СИ", "Записать формулу", "Подставить данные", "Проверить единицы"],
  },
  chemistry: {
    label: "Химия",
    keyTerm: "реакция",
    distractors: ["проекция", "подлежащее", "радиус"],
    shortAnswers: ["химия", "реакция"],
    matchPairs: [
      { left: "H2O", right: "вода" },
      { left: "NaCl", right: "поваренная соль" },
      { left: "CO2", right: "углекислый газ" },
    ],
    orderSteps: ["Определить реагенты", "Составить формулу продукта", "Уравнять коэффициенты", "Проверить баланс"],
  },
  biology: {
    label: "Биология",
    keyTerm: "клетка",
    distractors: ["интеграл", "префикс", "архипелаг"],
    shortAnswers: ["биология", "клетка"],
    matchPairs: [
      { left: "Митохондрия", right: "энергия клетки" },
      { left: "Ядро", right: "генетическая информация" },
      { left: "Хлоропласт", right: "фотосинтез" },
    ],
    orderSteps: ["Определить организм", "Выделить признак", "Сравнить с классификацией", "Сделать вывод"],
  },
  russian: {
    label: "Русский язык",
    keyTerm: "предложение",
    distractors: ["реакция", "формула", "орбита"],
    shortAnswers: ["русский язык", "предложение"],
    matchPairs: [
      { left: "Существительное", right: "кто? что?" },
      { left: "Глагол", right: "что делать?" },
      { left: "Прилагательное", right: "какой?" },
    ],
    orderSteps: ["Прочитать предложение", "Найти основу", "Определить части речи", "Проверить пунктуацию"],
  },
  kazakh: {
    label: "Казахский язык",
    keyTerm: "сөйлем",
    distractors: ["реакция", "вектор", "материк"],
    shortAnswers: ["қазақ тілі", "казахский язык", "сөйлем"],
    matchPairs: [
      { left: "Зат есім", right: "кім? не?" },
      { left: "Етістік", right: "не істеу?" },
      { left: "Сын есім", right: "қандай?" },
    ],
    orderSteps: ["Мәтінді оқу", "Сөз табын анықтау", "Сөйлем мүшесін табу", "Емлені тексеру"],
  },
  history: {
    label: "История Казахстана",
    keyTerm: "хронология",
    distractors: ["электролит", "суффикс", "логарифм"],
    shortAnswers: ["история", "хронология"],
    matchPairs: [
      { left: "1465/1466", right: "образование Казахского ханства" },
      { left: "1991", right: "независимость Казахстана" },
      { left: "Ботай", right: "раннее коневодство" },
    ],
    orderSteps: ["Определить период", "Расположить события", "Сопоставить причины и последствия", "Сделать вывод"],
  },
  informatics: {
    label: "Информатика",
    keyTerm: "алгоритм",
    distractors: ["молекула", "экватор", "сказуемое"],
    shortAnswers: ["информатика", "алгоритм"],
    matchPairs: [
      { left: "if", right: "условие" },
      { left: "for", right: "цикл с параметром" },
      { left: "while", right: "цикл с условием" },
    ],
    orderSteps: ["Прочитать задачу", "Составить алгоритм", "Написать код", "Проверить тестами"],
  },
  geography: {
    label: "География",
    keyTerm: "карта",
    distractors: ["катализатор", "местоимение", "матрица"],
    shortAnswers: ["география", "карта"],
    matchPairs: [
      { left: "Широта", right: "север-юг" },
      { left: "Долгота", right: "запад-восток" },
      { left: "Масштаб", right: "степень уменьшения" },
    ],
    orderSteps: ["Определить регион", "Найти объект на карте", "Сравнить климатические факторы", "Сделать вывод"],
  },
};

const buildDefaultSubjectQuestions = (subject: string): SubjectPracticeQuestionInput[] => {
  const seed = DEFAULT_SUBJECT_SEEDS[subject];
  if (!seed) {
    return [];
  }

  const singleOptions: SubjectPracticeOption[] = [
    { id: "opt-1", text: seed.keyTerm },
    { id: "opt-2", text: seed.distractors[0] ?? "вариант 2" },
    { id: "opt-3", text: seed.distractors[1] ?? "вариант 3" },
    { id: "opt-4", text: seed.distractors[2] ?? "вариант 4" },
  ];

  const leftItems: SubjectPracticeOption[] = seed.matchPairs.map((pair, index) => ({
    id: `left-${index + 1}`,
    text: pair.left,
  }));

  const rightItems: SubjectPracticeOption[] = seed.matchPairs.map((pair, index) => ({
    id: `right-${index + 1}`,
    text: pair.right,
  }));

  const correctPairs: SubjectPracticePair[] = leftItems.map((left, index) => ({
    leftId: left.id,
    rightId: rightItems[index]?.id ?? "",
  }));

  const orderItems: SubjectPracticeOption[] = seed.orderSteps.map((text, index) => ({
    id: `step-${index + 1}`,
    text,
  }));

  return [
    {
      type: "single_choice",
      prompt: `${seed.label}: выберите термин, который относится к этому предмету.`,
      explanation: `Ключевой термин по теме: ${seed.keyTerm}.`,
      sortOrder: 1,
      options: singleOptions,
      correctOptionId: "opt-1",
    },
    {
      type: "multiple_choice",
      prompt: `${seed.label}: выберите все варианты, которые относятся к теме.`,
      explanation: "В этом вопросе может быть несколько правильных вариантов.",
      sortOrder: 2,
      options: singleOptions,
      correctOptionIds: ["opt-1", "opt-2"],
    },
    {
      type: "short_answer",
      prompt: `${seed.label}: введите ключевое слово темы (одно или два слова).`,
      explanation: `Подойдут ответы: ${seed.shortAnswers.join(", ")}.`,
      sortOrder: 3,
      acceptedAnswers: seed.shortAnswers,
    },
    {
      type: "matching",
      prompt: `${seed.label}: сопоставьте понятие и определение.`,
      explanation: "Каждой левой части соответствует одна правая.",
      sortOrder: 4,
      leftItems,
      rightItems,
      correctPairs,
    },
    {
      type: "ordering",
      prompt: `${seed.label}: укажите правильный порядок выполнения.`,
      explanation: "Порядок шагов должен быть логически последовательным.",
      sortOrder: 5,
      items: orderItems,
      correctOrder: orderItems.map((item) => item.id),
    },
  ];
};

const seedSubjectPracticeQuestions = () => {
  const total = db.prepare("SELECT COUNT(1) as total FROM subject_practice_questions").get() as {
    total: number;
  };
  if (total.total > 0) {
    return;
  }

  const insert = db.prepare(
    `INSERT INTO subject_practice_questions (
      id, subject, type, prompt, explanation,
      options_json, correct_option_id, correct_option_ids_json,
      accepted_answers_json,
      left_items_json, right_items_json, correct_pairs_json,
      order_items_json, correct_order_json,
      sort_order, created_by, created_at, updated_at
    ) VALUES (
      @id, @subject, @type, @prompt, @explanation,
      @options_json, @correct_option_id, @correct_option_ids_json,
      @accepted_answers_json,
      @left_items_json, @right_items_json, @correct_pairs_json,
      @order_items_json, @correct_order_json,
      @sort_order, @created_by, @created_at, @updated_at
    )`,
  );

  const tx = db.transaction(() => {
    const now = new Date().toISOString();
    for (const subject of Object.keys(DEFAULT_SUBJECT_SEEDS)) {
      const questions = buildDefaultSubjectQuestions(subject);
      for (const question of questions) {
        insert.run({
          id: `spq-${randomUUID().slice(0, 12)}`,
          subject,
          type: question.type,
          prompt: question.prompt.trim(),
          explanation: question.explanation?.trim() || null,
          options_json:
            question.type === "single_choice" || question.type === "multiple_choice"
              ? JSON.stringify(question.options)
              : null,
          correct_option_id: question.type === "single_choice" ? question.correctOptionId : null,
          correct_option_ids_json:
            question.type === "multiple_choice" ? JSON.stringify(question.correctOptionIds) : null,
          accepted_answers_json:
            question.type === "short_answer" ? JSON.stringify(question.acceptedAnswers) : null,
          left_items_json: question.type === "matching" ? JSON.stringify(question.leftItems) : null,
          right_items_json: question.type === "matching" ? JSON.stringify(question.rightItems) : null,
          correct_pairs_json: question.type === "matching" ? JSON.stringify(question.correctPairs) : null,
          order_items_json: question.type === "ordering" ? JSON.stringify(question.items) : null,
          correct_order_json: question.type === "ordering" ? JSON.stringify(question.correctOrder) : null,
          sort_order: question.sortOrder ?? 0,
          created_by: "system",
          created_at: now,
          updated_at: now,
        });
      }
    }
  });

  tx();
};

seedSubjectPracticeQuestions();

const normalizeOptionsInput = (options: SubjectPracticeOption[], prefix: string): SubjectPracticeOption[] => {
  const result: SubjectPracticeOption[] = [];
  const usedIds = new Set<string>();
  for (let index = 0; index < options.length; index += 1) {
    const text = normalizeText(options[index]?.text ?? "");
    if (!text) {
      continue;
    }
    const rawId = normalizeText(options[index]?.id ?? "");
    const nextId = rawId && !usedIds.has(rawId) ? rawId : `${prefix}-${index + 1}`;
    usedIds.add(nextId);
    result.push({ id: nextId, text });
  }
  return result;
};

const normalizePairsInput = (pairs: SubjectPracticePair[]): SubjectPracticePair[] => {
  const result: SubjectPracticePair[] = [];
  const seenLeftIds = new Set<string>();
  for (const pair of pairs) {
    const leftId = normalizeText(pair.leftId);
    const rightId = normalizeText(pair.rightId);
    if (!leftId || !rightId || seenLeftIds.has(leftId)) {
      continue;
    }
    seenLeftIds.add(leftId);
    result.push({ leftId, rightId });
  }
  return result;
};

const normalizeQuestionInput = (question: SubjectPracticeQuestionInput): SubjectPracticeQuestionInput => {
  const prompt = normalizeText(question.prompt);
  const explanation = question.explanation ? normalizeText(question.explanation) : undefined;
  const sortOrder =
    typeof question.sortOrder === "number" && Number.isFinite(question.sortOrder)
      ? Math.max(0, Math.round(question.sortOrder))
      : 0;

  if (question.type === "single_choice") {
    const options = normalizeOptionsInput(question.options, "opt");
    const hasCorrect = options.some((item) => item.id === question.correctOptionId);
    const correctOptionId = hasCorrect ? question.correctOptionId : options[0]?.id ?? "";
    return {
      type: "single_choice",
      prompt,
      explanation,
      sortOrder,
      options,
      correctOptionId,
    };
  }

  if (question.type === "multiple_choice") {
    const options = normalizeOptionsInput(question.options, "opt");
    const validIds = new Set(options.map((item) => item.id));
    const correctOptionIds = ensureStringList(question.correctOptionIds).filter((id) => validIds.has(id));
    return {
      type: "multiple_choice",
      prompt,
      explanation,
      sortOrder,
      options,
      correctOptionIds,
    };
  }

  if (question.type === "short_answer") {
    const acceptedAnswers = ensureStringList(question.acceptedAnswers);
    return {
      type: "short_answer",
      prompt,
      explanation,
      sortOrder,
      acceptedAnswers,
    };
  }

  if (question.type === "matching") {
    const leftItems = normalizeOptionsInput(question.leftItems, "left");
    const rightItems = normalizeOptionsInput(question.rightItems, "right");
    const leftSet = new Set(leftItems.map((item) => item.id));
    const rightSet = new Set(rightItems.map((item) => item.id));
    const correctPairs = normalizePairsInput(question.correctPairs).filter(
      (pair) => leftSet.has(pair.leftId) && rightSet.has(pair.rightId),
    );
    return {
      type: "matching",
      prompt,
      explanation,
      sortOrder,
      leftItems,
      rightItems,
      correctPairs,
    };
  }

  const items = normalizeOptionsInput(question.items, "step");
  const itemSet = new Set(items.map((item) => item.id));
  const rawOrder = ensureStringList(question.correctOrder);
  const uniqueOrder: string[] = [];
  for (const id of rawOrder) {
    if (!itemSet.has(id) || uniqueOrder.includes(id)) {
      continue;
    }
    uniqueOrder.push(id);
  }
  const missing = items.map((item) => item.id).filter((id) => !uniqueOrder.includes(id));

  return {
    type: "ordering",
    prompt,
    explanation,
    sortOrder,
    items,
    correctOrder: [...uniqueOrder, ...missing],
  };
};

export const academicStoreService = {
  listAchievements(): Achievement[] {
    const rows = db
      .prepare(
        `SELECT
          id, student_id, title, type, badge, date, points,
          proof_url, proof_note, proof_file_name, proof_file_mime, proof_file_data_url, submitted_by, submitted_at,
          verification_status, verified_at, verified_by, verification_method, verification_evidence,
          created_at
        FROM achievements
        ORDER BY date DESC, created_at DESC`,
      )
      .all() as AchievementRow[];
    return rows.map(mapAchievement);
  },

  createAchievement(payload: {
    studentId: string;
    title: string;
    type: Achievement["type"];
    badge: string;
    date: string;
    points: number;
    proofUrl?: string;
    proofNote?: string;
    proofAttachment?: {
      fileName: string;
      mimeType: string;
      dataUrl: string;
    };
    submittedBy?: string;
  }) {
    const id = `ach-${randomUUID().slice(0, 8)}`;
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO achievements (
        id, student_id, title, type, badge, date, points,
        proof_url, proof_note, proof_file_name, proof_file_mime, proof_file_data_url, submitted_by, submitted_at,
        verification_status, verification_method, verification_evidence,
        created_at
      )
      VALUES (
        @id, @student_id, @title, @type, @badge, @date, @points,
        @proof_url, @proof_note, @proof_file_name, @proof_file_mime, @proof_file_data_url, @submitted_by, @submitted_at,
        @verification_status, @verification_method, @verification_evidence,
        @created_at
      )
    `).run({
      id,
      student_id: payload.studentId,
      title: payload.title.trim(),
      type: payload.type,
      badge: payload.badge.trim(),
      date: payload.date,
      points: Math.round(payload.points),
      proof_url: payload.proofUrl?.trim() || null,
      proof_note: payload.proofNote?.trim() || null,
      proof_file_name: payload.proofAttachment?.fileName?.trim() || null,
      proof_file_mime: payload.proofAttachment?.mimeType?.trim() || null,
      proof_file_data_url: payload.proofAttachment?.dataUrl?.trim() || null,
      submitted_by: payload.submittedBy?.trim() || null,
      submitted_at: createdAt,
      verification_status: "pending",
      verification_method: "manual-review",
      verification_evidence:
        payload.proofAttachment?.fileName?.trim() ||
        payload.proofUrl?.trim() ||
        payload.proofNote?.trim() ||
        payload.badge.trim(),
      created_at: createdAt,
    });

    const created = db
      .prepare(
        `SELECT
          id, student_id, title, type, badge, date, points,
          proof_url, proof_note, proof_file_name, proof_file_mime, proof_file_data_url, submitted_by, submitted_at,
          verification_status, verified_at, verified_by, verification_method, verification_evidence,
          created_at
        FROM achievements
        WHERE id = ?`,
      )
      .get(id) as AchievementRow | undefined;

    if (!created) {
      throw new Error("Unable to create achievement");
    }

    return mapAchievement(created);
  },

  verifyAchievement(payload: {
    achievementId: string;
    verifiedBy: string;
    method?: string;
    evidence?: string;
  }) {
    const verifiedAt = new Date().toISOString();
    db.prepare(`
      UPDATE achievements
      SET
        verification_status = 'verified',
        verified_at = @verified_at,
        verified_by = @verified_by,
        verification_method = @verification_method,
        verification_evidence = @verification_evidence
      WHERE id = @id
    `).run({
      id: payload.achievementId,
      verified_at: verifiedAt,
      verified_by: payload.verifiedBy.trim(),
      verification_method: payload.method?.trim() || "manual-review",
      verification_evidence: payload.evidence?.trim() || null,
    });

    const row = db
      .prepare(
        `SELECT
          id, student_id, title, type, badge, date, points,
          proof_url, proof_note, proof_file_name, proof_file_mime, proof_file_data_url, submitted_by, submitted_at,
          verification_status, verified_at, verified_by, verification_method, verification_evidence,
          created_at
        FROM achievements
        WHERE id = ?`,
      )
      .get(payload.achievementId) as AchievementRow | undefined;

    if (!row) {
      throw new Error("Achievement not found");
    }

    return mapAchievement(row);
  },

  listStudentProfiles(): StudentProfile[] {
    const profileRows = db
      .prepare(
        "SELECT student_id, full_name, class_id, average_score, weak_subjects, created_at, updated_at FROM student_profiles ORDER BY class_id ASC, full_name ASC",
      )
      .all() as StudentProfileRow[];

    const progressRows = db
      .prepare(
        "SELECT id, student_id, subject, current_score, trend, risk, history_json, created_at, updated_at FROM student_subject_progress ORDER BY student_id ASC, subject ASC",
      )
      .all() as SubjectProgressRow[];

    const progressByStudent = new Map<string, StudentProfile["progress"]>();

    for (const row of progressRows) {
      const history = normalizeHistory(parseHistory(row.history_json), row.current_score);
      const item = {
        subject: row.subject,
        current: Number(row.current_score.toFixed(2)),
        trend: Number(row.trend.toFixed(2)),
        risk: Boolean(row.risk),
        history,
      };
      const list = progressByStudent.get(row.student_id) ?? [];
      list.push(item);
      progressByStudent.set(row.student_id, list);
    }

    return profileRows.map((row) => {
      const progress = progressByStudent.get(row.student_id) ?? [];
      const weakFromDb = parseJsonArray(row.weak_subjects);
      const weakFromProgress = progress.filter((item) => item.risk).map((item) => item.subject);
      const weakSubjects = [...new Set([...weakFromDb, ...weakFromProgress])];

      const avgFromProgress =
        progress.length > 0 ? progress.reduce((sum, item) => sum + item.current, 0) / progress.length : 0;
      const averageScore = Number(
        Number.isFinite(row.average_score) && row.average_score > 0
          ? row.average_score.toFixed(2)
          : avgFromProgress.toFixed(2),
      );

      return {
        studentId: row.student_id,
        fullName: row.full_name,
        classId: row.class_id,
        averageScore,
        weakSubjects,
        progress,
      };
    });
  },

  upsertStudentProfiles(profiles: StudentProfile[]) {
    if (profiles.length === 0) {
      return;
    }

    const now = new Date().toISOString();

    const upsertProfile = db.prepare(`
      INSERT INTO student_profiles (student_id, full_name, class_id, average_score, weak_subjects, created_at, updated_at)
      VALUES (@student_id, @full_name, @class_id, @average_score, @weak_subjects, @created_at, @updated_at)
      ON CONFLICT(student_id) DO UPDATE SET
        full_name = excluded.full_name,
        class_id = excluded.class_id,
        average_score = excluded.average_score,
        weak_subjects = excluded.weak_subjects,
        updated_at = excluded.updated_at
    `);

    const deleteProgress = db.prepare("DELETE FROM student_subject_progress WHERE student_id = ?");

    const insertProgress = db.prepare(`
      INSERT INTO student_subject_progress
        (id, student_id, subject, current_score, trend, risk, history_json, created_at, updated_at)
      VALUES
        (@id, @student_id, @subject, @current_score, @trend, @risk, @history_json, @created_at, @updated_at)
    `);

    const tx = db.transaction((items: StudentProfile[]) => {
      for (const profile of items) {
        const studentId = profile.studentId.trim();
        if (!studentId) {
          continue;
        }

        const progress = profile.progress
          .filter((item) => item.subject.trim().length > 0)
          .map((item) => {
            const current = Number(Number(item.current).toFixed(2));
            const trend = Number(Number(item.trend).toFixed(2));
            const risk = Boolean(item.risk);
            const history = normalizeHistory(item.history ?? [], current);
            return {
              subject: item.subject.trim(),
              current,
              trend,
              risk,
              history,
            };
          });

        const weakSubjects = [
          ...new Set([
            ...profile.weakSubjects,
            ...progress.filter((item) => item.risk).map((item) => item.subject),
          ]),
        ];

        const avgFromProgress =
          progress.length > 0 ? progress.reduce((sum, item) => sum + item.current, 0) / progress.length : 0;

        upsertProfile.run({
          student_id: studentId,
          full_name: profile.fullName.trim(),
          class_id: profile.classId.trim().toUpperCase(),
          average_score: Number(
            (Number.isFinite(profile.averageScore) ? profile.averageScore : avgFromProgress).toFixed(2),
          ),
          weak_subjects: JSON.stringify(weakSubjects),
          created_at: now,
          updated_at: now,
        });

        deleteProgress.run(studentId);

        for (const subject of progress) {
          insertProgress.run({
            id: `spr-${randomUUID().slice(0, 8)}`,
            student_id: studentId,
            subject: subject.subject,
            current_score: subject.current,
            trend: subject.trend,
            risk: subject.risk ? 1 : 0,
            history_json: JSON.stringify(subject.history),
            created_at: now,
            updated_at: now,
          });
        }
      }
    });

    tx(profiles);
  },

  listStudentJournalGrades(payload: {
    studentId: string;
    scope?: Partial<JournalFilterScope>;
  }): JournalGradeRow[] {
    const studentId = payload.studentId.trim();
    if (!studentId) {
      return [];
    }

    const where: string[] = ["student_id = @student_id"];
    const params: Record<string, unknown> = {
      student_id: studentId,
    };

    if (typeof payload.scope?.eduYear === "number" && Number.isFinite(payload.scope.eduYear)) {
      where.push("edu_year = @edu_year");
      params.edu_year = Math.round(payload.scope.eduYear);
    }
    if (typeof payload.scope?.period === "number" && Number.isFinite(payload.scope.period)) {
      where.push("period = @period");
      params.period = Math.round(payload.scope.period);
    }
    if (typeof payload.scope?.periodType === "string" && payload.scope.periodType.trim()) {
      where.push("period_type = @period_type");
      params.period_type = payload.scope.periodType.trim().toLowerCase();
    }

    const rows = db
      .prepare(
        `SELECT
          id, student_id, edu_year, period, period_type,
          subject_id, subject_uuid, subject_name,
          schedule_uuid, lesson_date, lesson_time, mark_type, mark_max,
          score_raw, score_five, synced_at
        FROM student_journal_grades
        WHERE ${where.join(" AND ")}
        ORDER BY subject_name ASC, lesson_date ASC, lesson_time ASC, mark_type ASC`,
      )
      .all(params) as JournalGradeDbRow[];

    return rows.map(mapJournalGrade);
  },

  listStudentJournalScopes(studentIdRaw: string): JournalScopeInfo[] {
    const studentId = studentIdRaw.trim();
    if (!studentId) {
      return [];
    }

    const rows = db
      .prepare(
        `SELECT
          edu_year,
          period,
          period_type,
          MAX(synced_at) AS last_synced_at,
          COUNT(1) AS grades_count
        FROM student_journal_grades
        WHERE student_id = ?
        GROUP BY edu_year, period, period_type
        ORDER BY edu_year DESC, period DESC, period_type ASC`,
      )
      .all(studentId) as Array<{
      edu_year: number;
      period: number;
      period_type: string;
      last_synced_at: string;
      grades_count: number;
    }>;

    return rows.map((row) => ({
      eduYear: row.edu_year,
      period: row.period,
      periodType: row.period_type,
      lastSyncedAt: row.last_synced_at,
      gradesCount: row.grades_count,
    }));
  },

  replaceStudentJournalGrades(payload: {
    studentId: string;
    scope: JournalFilterScope;
    grades: JournalGradeRow[];
  }) {
    const studentId = payload.studentId.trim();
    if (!studentId) {
      return;
    }

    const scope = {
      eduYear: Math.round(payload.scope.eduYear),
      period: Math.round(payload.scope.period),
      periodType: payload.scope.periodType.trim().toLowerCase(),
    };

    if (!scope.periodType || !Number.isFinite(scope.eduYear) || !Number.isFinite(scope.period)) {
      return;
    }

    const deleteScoped = db.prepare(
      `DELETE FROM student_journal_grades
       WHERE student_id = @student_id
         AND edu_year = @edu_year
         AND period = @period
         AND period_type = @period_type`,
    );

    const insertGrade = db.prepare(
      `INSERT INTO student_journal_grades (
        id, student_id, edu_year, period, period_type,
        subject_id, subject_uuid, subject_name,
        schedule_uuid, lesson_date, lesson_time, mark_type, mark_max,
        score_raw, score_five, synced_at
      )
      VALUES (
        @id, @student_id, @edu_year, @period, @period_type,
        @subject_id, @subject_uuid, @subject_name,
        @schedule_uuid, @lesson_date, @lesson_time, @mark_type, @mark_max,
        @score_raw, @score_five, @synced_at
      )`,
    );

    const tx = db.transaction((rows: JournalGradeRow[]) => {
      deleteScoped.run({
        student_id: studentId,
        edu_year: scope.eduYear,
        period: scope.period,
        period_type: scope.periodType,
      });

      for (const row of rows) {
        const subjectName = row.subjectName.trim();
        const lessonDate = row.lessonDate.trim();
        if (!subjectName || !lessonDate) {
          continue;
        }

        insertGrade.run({
          id: row.id?.trim() || `jgr-${randomUUID().slice(0, 12)}`,
          student_id: studentId,
          edu_year: scope.eduYear,
          period: scope.period,
          period_type: scope.periodType,
          subject_id:
            typeof row.subjectId === "number" && Number.isFinite(row.subjectId) ? Math.round(row.subjectId) : null,
          subject_uuid: row.subjectUuid?.trim() || null,
          subject_name: subjectName,
          schedule_uuid: row.scheduleUuid?.trim() || "",
          lesson_date: lessonDate,
          lesson_time: row.lessonTime?.trim() || "",
          mark_type: row.markType?.trim() || "",
          mark_max:
            typeof row.markMax === "number" && Number.isFinite(row.markMax) ? Number(row.markMax.toFixed(2)) : null,
          score_raw: sanitizeJournalScoreRaw(row.scoreRaw),
          score_five:
            typeof row.scoreFive === "number" && Number.isFinite(row.scoreFive)
              ? Number(row.scoreFive.toFixed(2))
              : null,
          synced_at: row.syncedAt?.trim() || new Date().toISOString(),
        });
      }
    });

    tx(payload.grades);
  },

  listSubjectPracticeQuestions(subjectRaw: string, includeAnswers = false): SubjectPracticeQuestion[] {
    const subject = normalizeText(subjectRaw).toLowerCase();
    if (!subject) {
      return [];
    }

    const rows = db
      .prepare(
        `SELECT
          id, subject, type, prompt, explanation,
          options_json, correct_option_id, correct_option_ids_json, accepted_answers_json,
          left_items_json, right_items_json, correct_pairs_json,
          order_items_json, correct_order_json,
          sort_order, created_by, created_at, updated_at
        FROM subject_practice_questions
        WHERE subject = ?
        ORDER BY sort_order ASC, created_at ASC`,
      )
      .all(subject) as SubjectPracticeQuestionRow[];

    const questions = rows.map(mapSubjectPracticeQuestion);
    if (includeAnswers) {
      return questions;
    }
    return questions.map(withoutAnswers);
  },

  createSubjectPracticeQuestion(payload: {
    subject: string;
    question: SubjectPracticeQuestionInput;
    createdBy?: string;
  }) {
    const subject = normalizeText(payload.subject).toLowerCase();
    if (!subject) {
      throw new Error("Subject is required");
    }

    const normalized = normalizeQuestionInput(payload.question);
    if (!normalized.prompt) {
      throw new Error("Question prompt is required");
    }

    const maxRow = db
      .prepare("SELECT COALESCE(MAX(sort_order), 0) AS value FROM subject_practice_questions WHERE subject = ?")
      .get(subject) as { value: number };
    const normalizedSortOrder = normalized.sortOrder ?? 0;
    const sortOrder = normalizedSortOrder > 0 ? normalizedSortOrder : maxRow.value + 1;

    const id = `spq-${randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO subject_practice_questions (
        id, subject, type, prompt, explanation,
        options_json, correct_option_id, correct_option_ids_json,
        accepted_answers_json,
        left_items_json, right_items_json, correct_pairs_json,
        order_items_json, correct_order_json,
        sort_order, created_by, created_at, updated_at
      ) VALUES (
        @id, @subject, @type, @prompt, @explanation,
        @options_json, @correct_option_id, @correct_option_ids_json,
        @accepted_answers_json,
        @left_items_json, @right_items_json, @correct_pairs_json,
        @order_items_json, @correct_order_json,
        @sort_order, @created_by, @created_at, @updated_at
      )`,
    ).run({
      id,
      subject,
      type: normalized.type,
      prompt: normalized.prompt,
      explanation: normalized.explanation ?? null,
      options_json: normalized.type === "single_choice" ? JSON.stringify(normalized.options) : null,
      correct_option_id: normalized.type === "single_choice" ? normalized.correctOptionId : null,
      correct_option_ids_json:
        normalized.type === "multiple_choice" ? JSON.stringify(normalized.correctOptionIds) : null,
      accepted_answers_json: normalized.type === "short_answer" ? JSON.stringify(normalized.acceptedAnswers) : null,
      left_items_json: normalized.type === "matching" ? JSON.stringify(normalized.leftItems) : null,
      right_items_json: normalized.type === "matching" ? JSON.stringify(normalized.rightItems) : null,
      correct_pairs_json: normalized.type === "matching" ? JSON.stringify(normalized.correctPairs) : null,
      order_items_json: normalized.type === "ordering" ? JSON.stringify(normalized.items) : null,
      correct_order_json: normalized.type === "ordering" ? JSON.stringify(normalized.correctOrder) : null,
      sort_order: sortOrder,
      created_by: payload.createdBy ? normalizeText(payload.createdBy) : null,
      created_at: now,
      updated_at: now,
    });

    const row = db
      .prepare(
        `SELECT
          id, subject, type, prompt, explanation,
          options_json, correct_option_id, correct_option_ids_json, accepted_answers_json,
          left_items_json, right_items_json, correct_pairs_json,
          order_items_json, correct_order_json,
          sort_order, created_by, created_at, updated_at
        FROM subject_practice_questions
        WHERE id = ?`,
      )
      .get(id) as SubjectPracticeQuestionRow | undefined;

    if (!row) {
      throw new Error("Failed to create question");
    }

    return mapSubjectPracticeQuestion(row);
  },

  updateSubjectPracticeQuestion(payload: {
    subject: string;
    questionId: string;
    question: SubjectPracticeQuestionInput;
  }) {
    const subject = normalizeText(payload.subject).toLowerCase();
    const questionId = normalizeText(payload.questionId);
    if (!subject || !questionId) {
      throw new Error("Subject and question id are required");
    }

    const existing = db
      .prepare("SELECT id FROM subject_practice_questions WHERE id = ? AND subject = ?")
      .get(questionId, subject) as { id: string } | undefined;
    if (!existing) {
      throw new Error("Question not found");
    }

    const normalized = normalizeQuestionInput(payload.question);
    if (!normalized.prompt) {
      throw new Error("Question prompt is required");
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE subject_practice_questions
       SET
         type = @type,
         prompt = @prompt,
         explanation = @explanation,
         options_json = @options_json,
         correct_option_id = @correct_option_id,
         correct_option_ids_json = @correct_option_ids_json,
         accepted_answers_json = @accepted_answers_json,
         left_items_json = @left_items_json,
         right_items_json = @right_items_json,
         correct_pairs_json = @correct_pairs_json,
         order_items_json = @order_items_json,
         correct_order_json = @correct_order_json,
         sort_order = @sort_order,
         updated_at = @updated_at
       WHERE id = @id AND subject = @subject`,
    ).run({
      id: questionId,
      subject,
      type: normalized.type,
      prompt: normalized.prompt,
      explanation: normalized.explanation ?? null,
      options_json:
        normalized.type === "single_choice" || normalized.type === "multiple_choice"
          ? JSON.stringify(normalized.options)
          : null,
      correct_option_id: normalized.type === "single_choice" ? normalized.correctOptionId : null,
      correct_option_ids_json:
        normalized.type === "multiple_choice" ? JSON.stringify(normalized.correctOptionIds) : null,
      accepted_answers_json: normalized.type === "short_answer" ? JSON.stringify(normalized.acceptedAnswers) : null,
      left_items_json: normalized.type === "matching" ? JSON.stringify(normalized.leftItems) : null,
      right_items_json: normalized.type === "matching" ? JSON.stringify(normalized.rightItems) : null,
      correct_pairs_json: normalized.type === "matching" ? JSON.stringify(normalized.correctPairs) : null,
      order_items_json: normalized.type === "ordering" ? JSON.stringify(normalized.items) : null,
      correct_order_json: normalized.type === "ordering" ? JSON.stringify(normalized.correctOrder) : null,
      sort_order: normalized.sortOrder,
      updated_at: now,
    });

    const row = db
      .prepare(
        `SELECT
          id, subject, type, prompt, explanation,
          options_json, correct_option_id, correct_option_ids_json, accepted_answers_json,
          left_items_json, right_items_json, correct_pairs_json,
          order_items_json, correct_order_json,
          sort_order, created_by, created_at, updated_at
        FROM subject_practice_questions
        WHERE id = ?`,
      )
      .get(questionId) as SubjectPracticeQuestionRow | undefined;

    if (!row) {
      throw new Error("Question not found");
    }

    return mapSubjectPracticeQuestion(row);
  },

  deleteSubjectPracticeQuestion(subjectRaw: string, questionIdRaw: string) {
    const subject = normalizeText(subjectRaw).toLowerCase();
    const questionId = normalizeText(questionIdRaw);
    if (!subject || !questionId) {
      return false;
    }
    const result = db
      .prepare("DELETE FROM subject_practice_questions WHERE subject = ? AND id = ?")
      .run(subject, questionId);
    return result.changes > 0;
  },

  evaluateSubjectPracticeSubmission(payload: {
    subject: string;
    answers: Array<{ questionId: string; answer: SubjectPracticeAnswerInput }>;
  }) {
    const subject = normalizeText(payload.subject).toLowerCase();
    const rows = db
      .prepare(
        `SELECT
          id, subject, type, prompt, explanation,
          options_json, correct_option_id, correct_option_ids_json, accepted_answers_json,
          left_items_json, right_items_json, correct_pairs_json,
          order_items_json, correct_order_json,
          sort_order, created_by, created_at, updated_at
        FROM subject_practice_questions
        WHERE subject = ?
        ORDER BY sort_order ASC, created_at ASC`,
      )
      .all(subject) as SubjectPracticeQuestionRow[];
    const questions = rows.map(mapSubjectPracticeQuestion);
    const byId = new Map<string, SubjectPracticeQuestion>();
    for (const question of questions) {
      byId.set(question.id, question);
    }

    const items = payload.answers.map((entry) => {
      const questionId = normalizeText(entry.questionId);
      const question = byId.get(questionId);
      if (!question) {
        return {
          questionId,
          correct: false,
          feedback: "Вопрос не найден",
        };
      }

      const answer = entry.answer;
      if (answer.type !== question.type) {
        return {
          questionId,
          correct: false,
          feedback: "Неверный формат ответа",
        };
      }

      if (question.type === "single_choice" && answer.type === "single_choice") {
        const isCorrect = normalizeText(answer.optionId) === question.correctOptionId;
        return {
          questionId,
          correct: isCorrect,
          feedback: isCorrect ? "Верно" : "Неверно",
        };
      }

      if (question.type === "short_answer" && answer.type === "short_answer") {
        const userValue = normalizeAnswerText(answer.text);
        const allowed = question.acceptedAnswers.map((item) => normalizeAnswerText(item));
        const isCorrect = allowed.includes(userValue);
        return {
          questionId,
          correct: isCorrect,
          feedback: isCorrect ? "Верно" : "Неверно",
        };
      }

      if (question.type === "matching" && answer.type === "matching") {
        const expected = new Map(question.correctPairs.map((pair) => [pair.leftId, pair.rightId]));
        const submitted = new Map(
          answer.pairs
            .map((pair: SubjectPracticePair) => ({
              leftId: normalizeText(pair.leftId),
              rightId: normalizeText(pair.rightId),
            }))
            .filter((pair: SubjectPracticePair) => pair.leftId && pair.rightId)
            .map((pair: SubjectPracticePair) => [pair.leftId, pair.rightId]),
        );
        const isCorrect =
          expected.size > 0 &&
          expected.size === submitted.size &&
          [...expected.entries()].every(([leftId, rightId]) => submitted.get(leftId) === rightId);
        return {
          questionId,
          correct: isCorrect,
          feedback: isCorrect ? "Верно" : "Неверно",
        };
      }

      const expectedOrder = question.type === "ordering" ? question.correctOrder : [];
      const submittedOrder =
        answer.type === "ordering"
          ? answer.order.map((item: string) => normalizeText(item)).filter(Boolean)
          : [];
      const isCorrect =
        expectedOrder.length > 0 &&
        expectedOrder.length === submittedOrder.length &&
        expectedOrder.every((item, index) => item === submittedOrder[index]);
      return {
        questionId,
        correct: isCorrect,
        feedback: isCorrect ? "Верно" : "Неверно",
      };
    });

    const total = items.length;
    const correct = items.filter((item) => item.correct).length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    return {
      total,
      correct,
      score,
      items,
    };
  },

  recordSubjectSession(payload: {
    studentId: string;
    subject: string;
    taskId: number;
    score: number;
    timeSpentSeconds: number;
  }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO subject_sessions (id, student_id, subject, task_id, score, time_spent_seconds, completed_at)
       VALUES (@id, @studentId, @subject, @taskId, @score, @timeSpentSeconds, @completedAt)`,
    ).run({
      id,
      studentId: payload.studentId,
      subject: payload.subject,
      taskId: payload.taskId,
      score: Number(payload.score.toFixed(2)),
      timeSpentSeconds: payload.timeSpentSeconds,
      completedAt: now,
    });
    return id;
  },

  listSubjectSessions(studentId: string) {
    const rows = db
      .prepare(
        `SELECT id, student_id, subject, task_id, score, time_spent_seconds, completed_at
         FROM subject_sessions WHERE student_id = ? ORDER BY completed_at DESC`,
      )
      .all(studentId) as {
      id: string;
      student_id: string;
      subject: string;
      task_id: number;
      score: number;
      time_spent_seconds: number;
      completed_at: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      subject: r.subject,
      taskId: r.task_id,
      score: r.score,
      timeSpentSeconds: r.time_spent_seconds,
      completedAt: r.completed_at,
    }));
  },

  getSubjectStats(studentId: string): { subject: string; sessionsCount: number; avgScore: number }[] {
    const rows = db
      .prepare(
        `SELECT subject, COUNT(*) as sessions_count, AVG(score) as avg_score
         FROM subject_sessions WHERE student_id = ?
         GROUP BY subject ORDER BY sessions_count DESC`,
      )
      .all(studentId) as { subject: string; sessions_count: number; avg_score: number }[];
    return rows.map((r) => ({
      subject: r.subject,
      sessionsCount: r.sessions_count,
      avgScore: Number(r.avg_score.toFixed(2)),
    }));
  },
};
