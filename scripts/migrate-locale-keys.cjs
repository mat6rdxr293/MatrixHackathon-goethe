const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const frontendDir = path.join(rootDir, "frontend");
const srcDir = path.join(frontendDir, "src");
const ruPath = path.join(srcDir, "locales", "ru.json");
const kkPath = path.join(srcDir, "locales", "kk.json");

const CYRILLIC_MAP = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  ә: "a",
  ғ: "g",
  қ: "q",
  ң: "ng",
  ө: "o",
  ұ: "u",
  ү: "u",
  һ: "h",
  і: "i",
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const writeJson = (filePath, data) => {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(filePath, text, "utf8");
};

const getKeyNumber = (key) => {
  const match = key.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
};

const transliterate = (text) =>
  [...text]
    .map((char) => {
      const lower = char.toLowerCase();
      if (CYRILLIC_MAP[lower] !== undefined) {
        return CYRILLIC_MAP[lower];
      }
      return lower;
    })
    .join("");

const slugifyKey = (text) => {
  const transliterated = transliterate(text)
    .replace(/&/g, " and ")
    .replace(/%/g, " percent ")
    .replace(/\+/g, " plus ");

  const slug = transliterated
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (!slug) {
    return "text";
  }

  if (/^\d/.test(slug)) {
    return `item_${slug}`;
  }

  return slug.slice(0, 56).replace(/_+$/g, "");
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const walkFiles = (dirPath) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    files.push(fullPath);
  }
  return files;
};

const ruLocale = readJson(ruPath);
const kkLocale = readJson(kkPath);

const ruKeys = Object.keys(ruLocale).sort((a, b) => getKeyNumber(a) - getKeyNumber(b));
const kkKeys = Object.keys(kkLocale).sort((a, b) => getKeyNumber(a) - getKeyNumber(b));

if (ruKeys.length !== kkKeys.length) {
  throw new Error(`Locale size mismatch: ru=${ruKeys.length}, kk=${kkKeys.length}`);
}

for (let i = 0; i < ruKeys.length; i += 1) {
  if (ruKeys[i] !== kkKeys[i]) {
    throw new Error(`Locale key mismatch at index ${i}: ${ruKeys[i]} != ${kkKeys[i]}`);
  }
}

const usedNames = new Set();
const keyMap = {};

for (const oldKey of ruKeys) {
  const ruValue = ruLocale[oldKey];
  const base = slugifyKey(String(ruValue ?? oldKey));

  let candidate = base;
  let index = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }

  usedNames.add(candidate);
  keyMap[oldKey] = candidate;
}

const renamedRu = {};
const renamedKk = {};

for (const oldKey of ruKeys) {
  const newKey = keyMap[oldKey];
  renamedRu[newKey] = ruLocale[oldKey];
  renamedKk[newKey] = kkLocale[oldKey];
}

writeJson(ruPath, renamedRu);
writeJson(kkPath, renamedKk);

const filesToUpdate = walkFiles(srcDir).filter((filePath) => {
  const isLocale = filePath === ruPath || filePath === kkPath;
  if (isLocale) {
    return false;
  }

  return /\.(ts|tsx|js|jsx|json)$/.test(filePath);
});

for (const filePath of filesToUpdate) {
  let content = fs.readFileSync(filePath, "utf8");
  let updated = content;

  for (const oldKey of ruKeys) {
    const quotedPattern = new RegExp(`([\"'\\\`])${escapeRegExp(oldKey)}\\1`, "g");
    updated = updated.replace(quotedPattern, (_, quote) => `${quote}${keyMap[oldKey]}${quote}`);
  }

  if (updated !== content) {
    fs.writeFileSync(filePath, updated, "utf8");
  }
}

console.log(`Migrated ${ruKeys.length} locale keys.`);
