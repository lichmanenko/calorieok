#!/usr/bin/env node
// Конвертер выгрузки MyFitnessPal (CSV Premium) в JSON-бэкап Deep Dish.
// Запускается агентом, вне приложения (решение В. 06.10: импорт MFP — «здесь», не в UI).
//
//   node tools/mfp2dd.mjs <food.csv> [backup.json] [-o out.json]
//
//   food.csv     — выгрузка MFP (Account Settings → Export Data → CSV)
//   backup.json  — необязательно: текущий экспорт Deep Dish (Настройки → Данные → Экспорт JSON).
//                  Если задан — записи DD в диапазоне дат CSV заменяются импортируемыми
//                  (защита от дублей с тестовыми записями), остальные данные проходят как есть.
//                  Если не задан — на выходе только новые продукты и записи MFP
//                  (заливка добавит их к существующему дневнику).
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const SLOT_DEFAULTS = { breakfast: ['slot-breakfast', '08:00'], lunch: ['slot-lunch', '13:00'], dinner: ['slot-dinner', '19:00'] };
const KEYWORDS = JSON.parse(readFileSync(new URL('../data/category-keywords.json', import.meta.url), 'utf-8'));

// ── утилиты (паритет с приложением) ──
function splitCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// MFP пишет даты как MM/DD/YYYY (или DD/MM/YYYY в локали) — различаем по невозможному месяцу
function mfpDate(raw) {
  const m = raw.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return '';
  let a = m[1], b = m[2];
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  if (parseInt(a, 10) > 12 && parseInt(b, 10) <= 12) { const t = a; a = b; b = t; }
  const p = n => String(n).padStart(2, '0');
  return `${y}-${p(a)}-${p(b)}`;
}

function guessCategory(name) {
  const n = name.toLowerCase();
  for (const { cat, words } of KEYWORDS) if (words.some(w => n.includes(w))) return cat;
  return 'Импорт MFP';
}

function uuid() { return crypto.randomUUID(); }
const num = s => parseFloat(String(s ?? '').replace(',', '.')) || 0;

// ── разбор CSV ──
function parseMfp(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('в файле нет строк с едой');
  const head = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  const col = (...names) => head.findIndex(h => names.some(n => h.includes(n)));
  const ci = {
    date: col('date', 'дата'), meal: col('meal', 'приём'),
    name: col('food name', 'food', 'блюдо', 'название'),
    brand: col('brand', 'производитель'),
    kcal: col('calories', 'ккал', 'калор'),
    f: col('fat', 'жир'), c: col('carbohydrate', 'carbs', 'углев'), p: col('protein', 'белк', 'протеин'),
  };
  if (ci.date < 0 || ci.name < 0 || ci.kcal < 0) throw new Error('не нашёл колонки «дата/блюдо/калории» — это точно выгрузка MFP?');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    const date = mfpDate(c[ci.date] ?? '');
    const name = c[ci.name] ?? '';
    if (!date || !name) continue;
    const mealRaw = ci.meal >= 0 ? (c[ci.meal] ?? '') : '';
    const slotKey = /breakfast|завтрак/i.test(mealRaw) ? 'breakfast'
      : /lunch|обед/i.test(mealRaw) ? 'lunch'
      : /dinner|ужин/i.test(mealRaw) ? 'dinner' : 'snack';
    rows.push({ date, slotKey, name, brand: ci.brand >= 0 ? (c[ci.brand] ?? '') : '',
      kcal: num(c[ci.kcal]), p: ci.p >= 0 ? num(c[ci.p]) : 0,
      f: ci.f >= 0 ? num(c[ci.f]) : 0, c: ci.c >= 0 ? num(c[ci.c]) : 0 });
  }
  if (!rows.length) throw new Error('не распознана ни одна строка');
  return rows;
}

// ── сборка бэкапа ──
const args = argv.slice(2);
const outIdx = args.indexOf('-o');
const outFile = outIdx >= 0 ? args.splice(outIdx, 2)[1] : null;
const [csvPath, backupPath] = args;
if (!csvPath) { console.error('node tools/mfp2dd.mjs <food.csv> [backup.json] [-o out.json]'); exit(1); }

const rows = parseMfp(readFileSync(csvPath, 'utf-8'));
const dates = rows.map(r => r.date).sort();
const from = dates[0], to = dates[dates.length - 1];

const backup = backupPath ? JSON.parse(readFileSync(backupPath, 'utf-8')) : null;
if (backupPath && backup?.app !== 'deep-dish') throw new Error('backup.json — не бэкап Deep Dish');

const foods = backup?.foods ? [...backup.foods] : [];
const backupEntries = backup?.entries ?? [];
const byKey = new Map(foods.map(f => [`${f.name.toLowerCase().trim()}|${(f.brand ?? '').toLowerCase().trim()}`, f]));
const replaced = new Set(backupEntries.filter(e => !e.deletedAt && e.date >= from && e.date <= to).map(e => e.id));
// замена диапазона: тестовые записи DD за даты CSV уходят, остальные — остаются
const keptEntries = backupEntries.filter(e => !replaced.has(e.id));

const now = Date.now();
let madeFoods = 0, reused = 0;
const importedEntries = [];
for (const r of rows) {
  const key = `${r.name.toLowerCase().trim()}|${r.brand.toLowerCase().trim()}`;
  let f = byKey.get(key);
  if (!f) {
    f = { id: uuid(), name: r.name, brand: r.brand || undefined, category: guessCategory(r.name),
      kcalPer100g: r.kcal, pPer100g: r.p, fPer100g: r.f, cPer100g: r.c,
      unit: 'pc', source: 'mfp', ownerId: 'local', isPublic: false,
      createdAt: now, updatedAt: now, deletedAt: null };
    byKey.set(key, f); foods.push(f); madeFoods++;
  } else reused++;
  const [slotId, defTime] = SLOT_DEFAULTS[r.slotKey] ?? ['slot-snack', '12:00'];
  // граммовки в выгрузке MFP нет: строка = порция (граммы 100 в условных единицах порционных продуктов)
  importedEntries.push({ id: uuid(), userId: 'local', date: r.date, timeEaten: defTime, slotId,
    kind: 'food', refId: f.id, grams: 100,
    snapshot: { kcal: Math.round(r.kcal), p: Math.round(r.p * 10) / 10, f: Math.round(r.f * 10) / 10, c: Math.round(r.c * 10) / 10 },
    createdAt: now, updatedAt: now, deletedAt: null });
}

const dump = {
  app: 'deep-dish', version: 1, exportedAt: new Date().toISOString(),
  foods, recipes: backup?.recipes ?? [], savedMeals: backup?.savedMeals ?? [],
  slots: backup?.slots ?? [],
  entries: backup ? [...keptEntries, ...importedEntries] : importedEntries,
  weightLogs: backup?.weightLogs ?? [], profiles: backup?.profiles ?? [],
};

const out = outFile ?? `deepdish-mfp-${from}.json`;
writeFileSync(out, JSON.stringify(dump, null, 1), 'utf-8');
console.log(`MFP → Deep Dish: ${rows.length} записей за ${from}..${to}; продуктов: ${madeFoods} новых, ${reused} совпало с каталогом${backup ? `; заменено записей DD за диапазон: ${replaced.size}` : ' (бэкап не задан — только добавление)'}`);
console.log(`Файл: ${out} — залить в приложении: Настройки → Данные → Импорт JSON`);
