export type SubjectLang = "ru" | "kk";

type SubjectNameEntry = {
  ru: string;
  kk: string;
  aliases?: string[];
};

const SUBJECT_NAME_ENTRIES: SubjectNameEntry[] = [
  {
    ru: "Алгебра и начала анализа",
    kk: "Алгебра және анализ бастамалары",
    aliases: ["алгебра", "алгебра және анализ бастамалары", "алгебра и начала анализа"],
  },
  { ru: "Геометрия", kk: "Геометрия" },
  {
    ru: "Всемирная история",
    kk: "Дүниежүзі тарихы",
    aliases: ["дүниежүзі тарихы", "всемирная история", "дүние жүзі тарихы"],
  },
  { ru: "Информатика", kk: "Информатика" },
  {
    ru: "Казахский язык и литература",
    kk: "Қазақ тілі мен әдебиеті",
    aliases: ["қазақ тілі мен әдебиеті", "казахский язык и литература"],
  },
  {
    ru: "История Казахстана",
    kk: "Қазақстан тарихы",
    aliases: ["қазақстан тарихы", "история казахстана"],
  },
  {
    ru: "Основы права",
    kk: "Құқық негіздері",
    aliases: ["құқық негіздері", "основы права"],
  },
  {
    ru: "Русский язык",
    kk: "Орыс тілі",
    aliases: ["орыс тілі", "русский язык"],
  },
  {
    ru: "Русская литература",
    kk: "Орыс әдебиеті",
    aliases: ["русская литература", "орыс әдебиеті"],
  },
  { ru: "Физика", kk: "Физика" },
  { ru: "Химия", kk: "Химия" },
  {
    ru: "Иностранный язык",
    kk: "Шетел тілі",
    aliases: ["иностранный язык", "шетел тілі"],
  },
  {
    ru: "Английский язык",
    kk: "Ағылшын тілі",
    aliases: ["английский язык", "ағылшын тілі"],
  },
  {
    ru: "Физическая культура",
    kk: "Дене шынықтыру",
    aliases: ["физическая культура", "дене шынықтыру", "физкультура"],
  },
  { ru: "Биология", kk: "Биология" },
  { ru: "География", kk: "География" },
  { ru: "История", kk: "Тарих" },
  { ru: "Математика", kk: "Математика" },
  { ru: "Литература", kk: "Әдебиет" },
];

const normalizeSubjectName = (value: string) =>
  value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[(){}[\],.;:!?'"`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const subjectNameIndex = (() => {
  const index = new Map<string, SubjectNameEntry>();
  for (const entry of SUBJECT_NAME_ENTRIES) {
    const aliases = [entry.ru, entry.kk, ...(entry.aliases ?? [])];
    for (const alias of aliases) {
      const key = normalizeSubjectName(alias);
      if (!key) {
        continue;
      }
      index.set(key, entry);
    }
  }
  return index;
})();

const findSubjectNameEntry = (subjectName: string) => {
  const key = normalizeSubjectName(subjectName);
  if (!key) {
    return null;
  }

  const exact = subjectNameIndex.get(key);
  if (exact) {
    return exact;
  }

  for (const [alias, entry] of subjectNameIndex.entries()) {
    if ((alias.length >= 6 && key.includes(alias)) || (key.length >= 6 && alias.includes(key))) {
      return entry;
    }
  }

  return null;
};

export const localizeSubjectName = (subjectName: string, lang: SubjectLang) => {
  const clean = subjectName.trim();
  if (!clean) {
    return subjectName;
  }
  const entry = findSubjectNameEntry(clean);
  if (!entry) {
    return clean;
  }
  return lang === "kk" ? entry.kk : entry.ru;
};
