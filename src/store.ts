// Слой доступа к данным + расчёты нормы + трекер метрик
import { db, newId, LOCAL_USER, type Entry, type Food, type Profile, type Recipe, type Slot, type KbjuSnapshot } from './db';
import { todayISO, nowHM, kbjuSuspicious, fmt, guessCategory } from './lib';

// ── Метрики ──
const SESSION = newId();
export function track(name: string, props: Record<string, unknown> = {}) {
  db.events.add({ id: newId(), ts: Date.now(), session: SESSION, name, props: JSON.stringify({ v: __APP_VER__, ...props }) }).catch(() => {});
}

// ── Слоты ──
export async function getSlots(): Promise<Slot[]> {
  const s = await db.slots.filter(x => !x.deletedAt).toArray();
  return s.sort((a, b) => a.sortOrder - b.sortOrder);
}

// ── Записи ──
export async function getEntries(date: string): Promise<Entry[]> {
  return db.entries.where('[userId+date]').equals([LOCAL_USER, date]).filter(e => !e.deletedAt).toArray();
}

export async function saveEntry(e: Entry) {
  const now = Date.now();
  await db.entries.put({ ...e, updatedAt: now });
}

export async function addEntry(params: {
  date: string; slot: Slot; kind: 'food' | 'recipe'; refId: string; grams: number;
  per100: KbjuSnapshot; timeEaten?: string;
}): Promise<Entry> {
  const k = params.grams / 100; // для порционных grams = шт × 100 (условные)
  const entry: Entry = {
    id: newId(), userId: LOCAL_USER, date: params.date,
    timeEaten: params.timeEaten ?? params.slot.defaultTime ?? nowHM(),
    slotId: params.slot.id, kind: params.kind, refId: params.refId, grams: params.grams,
    snapshot: {
      kcal: Math.round(params.per100.kcal * k),
      p: Math.round(params.per100.p * k * 10) / 10,
      f: Math.round(params.per100.f * k * 10) / 10,
      c: Math.round(params.per100.c * k * 10) / 10,
    },
    createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null,
  };
  await db.entries.add(entry);
  return entry;
}

export async function deleteEntry(id: string) {
  await db.entries.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
}

// ── Продукты/рецепты ──
export type CatalogItem =
  | { kind: 'food'; id: string; name: string; sub: string; star: boolean; suspicious: boolean; per100: KbjuSnapshot; unit: 'g' | 'pc'; food: Food }
  | { kind: 'recipe'; id: string; name: string; sub: string; star: boolean; suspicious: boolean; per100: KbjuSnapshot; unit: 'g'; recipe: Recipe };

export async function getCatalog(query: string): Promise<CatalogItem[]> {
  const q = query.trim().toLowerCase();
  const isBarcode = /^\d{8,13}$/.test(q);
  const foods = (await db.foods.filter(f => !f.deletedAt).toArray()).filter(f =>
    !q || f.name.toLowerCase().includes(q) || (f.brand ?? '').toLowerCase().includes(q)
    || (isBarcode && (f.barcode ?? '').includes(q)));
  const recipes = (await db.recipes.filter(r => !r.deletedAt).toArray()).filter(r =>
    !q || r.name.toLowerCase().includes(q));
  const items: CatalogItem[] = [
    ...foods.map<CatalogItem>(f => ({
      kind: 'food', id: f.id, name: f.name,
      sub: f.source === 'system' ? f.category : f.brand ? `${f.brand} · свой` : (f.unit === 'pc' ? 'свой · порционный' : 'свой продукт'),
      star: !!f.star, unit: f.unit === 'pc' ? 'pc' : 'g',
      suspicious: kbjuSuspicious(f.kcalPer100g, f.pPer100g, f.fPer100g, f.cPer100g, f.name),
      per100: { kcal: f.kcalPer100g, p: f.pPer100g, f: f.fPer100g, c: f.cPer100g },
      food: f,
    })),
    ...recipes.map<CatalogItem>(r => ({
      kind: 'recipe', id: r.id, name: r.name, sub: 'рецепт', star: !!r.star, unit: 'g',
      suspicious: false,
      per100: { kcal: r.kcalPer100g, p: r.pPer100g, f: r.fPer100g, c: r.cPer100g },
      recipe: r,
    })),
  ];
  return items;
}

/** Недавние: последние уникальные позиции из дневника (по kind+refId). */
export async function getRecent(limit = 12): Promise<Array<{ kind: 'food' | 'recipe'; refId: string }>> {
  const es = await db.entries.orderBy('createdAt').reverse().filter(e => !e.deletedAt).limit(200).toArray();
  const seen = new Set<string>(); const out: Array<{ kind: 'food' | 'recipe'; refId: string }> = [];
  for (const e of es) {
    const key = `${e.kind}:${e.refId}`;
    if (!seen.has(key)) { seen.add(key); out.push({ kind: e.kind, refId: e.refId }); if (out.length >= limit) break; }
  }
  return out;
}

/** Последняя порция позиции (для предзаполнения при повторе). */
export async function lastGrams(kind: 'food' | 'recipe', refId: string): Promise<number | undefined> {
  const es = await db.entries.orderBy('createdAt').reverse()
    .filter(e => !e.deletedAt && e.kind === kind && e.refId === refId).limit(1).toArray();
  return es[0]?.grams;
}

export async function toggleStar(item: CatalogItem) {
  if (item.kind === 'food') await db.foods.update(item.id, { star: !item.star, updatedAt: Date.now() });
  else await db.recipes.update(item.id, { star: !item.star, updatedAt: Date.now() });
}

export async function getFood(id: string): Promise<Food | undefined> { return db.foods.get(id); }
export async function getRecipe(id: string): Promise<Recipe | undefined> { return db.recipes.get(id); }

export async function saveCustomFood(f: Omit<Food, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'ownerId' | 'source' | 'isPublic'>): Promise<Food> {
  const food: Food = { ...f, id: newId(), source: 'custom', ownerId: LOCAL_USER, isPublic: true, star: false, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null };
  await db.foods.add(food);
  track('food_created', { suspicious: kbjuSuspicious(food.kcalPer100g, food.pPer100g, food.fPer100g, food.cPer100g, food.name) });
  return food;
}

export async function saveRecipe(name: string, items: Array<{ foodId: string; grams: number }>, yieldG: number): Promise<Recipe> {
  const foods = await Promise.all(items.map(i => db.foods.get(i.foodId)));
  let kcal = 0, p = 0, f = 0, c = 0;
  items.forEach((it, i) => {
    const fd = foods[i];
    if (!fd) return;
    const k = it.grams / 100;
    kcal += fd.kcalPer100g * k; p += fd.pPer100g * k; f += fd.fPer100g * k; c += fd.cPer100g * k;
  });
  const y = Math.max(yieldG, 1);
  const recipe: Recipe = {
    id: newId(), name, items, yieldG: y,
    kcalPer100g: Math.round(kcal / y * 100) / 100,
    pPer100g: Math.round(p / y * 1000) / 10,
    fPer100g: Math.round(f / y * 1000) / 10,
    cPer100g: Math.round(c / y * 1000) / 10,
    ownerId: LOCAL_USER, isPublic: true, star: false,
    createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null,
  };
  await db.recipes.add(recipe);
  track('recipe_created', { items: items.length });
  return recipe;
}

// ── Профиль и норма ──
export async function getProfile(): Promise<Profile | undefined> { return db.profiles.get(LOCAL_USER); }
export async function saveProfile(p: Profile) { await db.profiles.put({ ...p, userId: LOCAL_USER, updatedAt: Date.now() }); }

const ACT: Record<Profile['activity'], number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };

export interface Norma { kcal: number; p: number; f: number; c: number; bmr: number; tdee: number; adj: number; }

export function calcNorma(pr: Profile): Norma | null {
  const weight = pr.weightKg ?? (pr.goalWeightKg && pr.goal === 'maintain' ? pr.goalWeightKg : undefined);
  if (weight === undefined && !(pr.formula === 'manual' && pr.manualTdee)) return null; // нет точки отсчёта
  let tdee: number; let bmr: number;
  if (pr.formula === 'manual' && pr.manualTdee) {
    tdee = pr.manualTdee;
    bmr = Math.round(tdee / ACT[pr.activity]);
  } else {
    bmr = Math.round(10 * weight! + 6.25 * pr.heightCm - 5 * pr.age + (pr.gender === 'male' ? 5 : -161));
    tdee = bmr * ACT[pr.activity];
  }
  let adj = 0;
  if (pr.goal === 'lose') adj = -Math.min(Math.round(pr.paceKgPerWeek * 7700 / 7), 750);
  if (pr.goal === 'gain') adj = Math.min(Math.round(pr.paceKgPerWeek * 7700 / 7), 500);
  let kcal = tdee + adj;
  kcal = Math.max(Math.round(kcal / 10) * 10, Math.round(bmr * 1.1));
  const pct = pr.macroPct ?? { p: 25, f: 30, c: 45 };
  return {
    kcal, p: Math.round(kcal * pct.p / 100 / 4), f: Math.round(kcal * pct.f / 100 / 9),
    c: Math.round(kcal * pct.c / 100 / 4), bmr, tdee: Math.round(tdee), adj,
  };
}

// ── Экспорт ──
export async function exportJSON(): Promise<Blob> {
  const dump = {
    app: 'deep-dish', version: 1, exportedAt: new Date().toISOString(),
    foods: await db.foods.toArray(), recipes: await db.recipes.toArray(),
    savedMeals: await db.savedMeals.toArray(), slots: await db.slots.toArray(),
    entries: await db.entries.toArray(), weightLogs: await db.weightLogs.toArray(),
    profiles: await db.profiles.toArray(),
  };
  return new Blob([JSON.stringify(dump, null, 1)], { type: 'application/json' });
}

export async function exportCSV(): Promise<Blob> {
  const slots = await getSlots();
  const slotName = new Map(slots.map(s => [s.id, s.name]));
  const foods = await db.foods.toArray(); const recipes = await db.recipes.toArray();
  const nm = (e: Entry) =>
    e.kind === 'food' ? (foods.find(f => f.id === e.refId)?.name ?? e.refId)
      : (recipes.find(r => r.id === e.refId)?.name ?? e.refId);
  const es = (await db.entries.filter(e => !e.deletedAt).toArray()).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.timeEaten < b.timeEaten ? -1 : 1);
  const rows = [['дата', 'время', 'приём', 'блюдо', 'граммы', 'ккал', 'белки', 'жиры', 'углеводы'].join(';')];
  for (const e of es) rows.push([e.date, e.timeEaten, slotName.get(e.slotId) ?? '', nm(e), String(e.grams), String(e.snapshot.kcal), String(e.snapshot.p), String(e.snapshot.f), String(e.snapshot.c)].join(';'));
  return new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv' });
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  track('export_done', { name });
}

export async function wipeAll() {
  await db.transaction('rw', [db.foods, db.recipes, db.savedMeals, db.slots, db.entries, db.weightLogs, db.profiles], async () => {
    await Promise.all([db.foods.clear(), db.recipes.clear(), db.savedMeals.clear(), db.slots.clear(), db.entries.clear(), db.weightLogs.clear(), db.profiles.clear()]);
  });
  track('wipe_all');
}

// ── Сохранённые приёмы («мой завтрак» одним тапом) ────────────────────────────

export async function saveMealFromSlot(name: string, slotId: string, date: string): Promise<number> {
  const es = (await db.entries.where('date').equals(date).toArray())
    .filter(e => e.slotId === slotId && !e.deletedAt && e.kind === 'food');
  if (!es.length) return 0;
  await db.savedMeals.add({
    id: newId(), name, items: es.map(e => ({ foodId: e.refId, grams: e.grams })),
    slotHint: slotId, ownerId: LOCAL_USER, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null,
  });
  track('meal_saved', { items: es.length });
  return es.length;
}

export async function applyMeal(mealId: string, date: string, slot: Slot): Promise<number> {
  const meal = await db.savedMeals.get(mealId);
  if (!meal || meal.deletedAt) return 0;
  let n = 0;
  for (const it of meal.items) {
    const f = await db.foods.get(it.foodId);
    if (!f || f.deletedAt) continue;
    await addEntry({ date, slot, kind: 'food', refId: it.foodId, grams: it.grams,
      per100: { kcal: f.kcalPer100g, p: f.pPer100g, f: f.fPer100g, c: f.cPer100g } });
    n++;
  }
  if (n) track('meal_applied', { items: n });
  return n;
}

export async function deleteMeal(id: string) {
  await db.savedMeals.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
}

// ── Импорт JSON (восстановление бэкапа) ───────────────────────────────────────

export async function importJSONText(text: string): Promise<Record<string, number>> {
  const d = JSON.parse(text) as Record<string, unknown>;
  if (d?.app !== 'deep-dish') throw new Error('это не бэкап Deep Dish');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tabs: Array<[any, string]> = [
    [db.foods, 'foods'], [db.recipes, 'recipes'], [db.savedMeals, 'savedMeals'],
    [db.slots, 'slots'], [db.entries, 'entries'], [db.weightLogs, 'weightLogs'], [db.profiles, 'profiles'],
  ];
  const counts: Record<string, number> = {};
  for (const [t, k] of tabs) {
    const arr = d[k];
    if (!Array.isArray(arr) || !arr.length) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (t as any).bulkPut(arr);
    counts[k] = arr.length;
  }
  track('import_json', counts);
  return counts;
}

// ── Импорт из MyFitnessPal (CSV-выгрузка Premium) ─────────────────────────────

export interface MfpRow { date: string; slotId: string; name: string; brand: string; kcal: number; p: number; f: number; c: number; }
export interface MfpPreview { rows: MfpRow[]; newFoods: number; reusedFoods: number; from: string; to: string; }

function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
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
function mfpDate(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return '';
  let a = m[1], b = m[2];
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  if (parseInt(a, 10) > 12 && parseInt(b, 10) <= 12) { const t = a; a = b; b = t; }
  const p = (n: string) => n.padStart(2, '0');
  return `${y}-${p(a)}-${p(b)}`;
}

const MFP_SLOTS: Array<[RegExp, string]> = [
  [/breakfast|завтрак/i, 'slot-breakfast'],
  [/lunch|обед/i, 'slot-lunch'],
  [/dinner|ужин/i, 'slot-dinner'],
];

export async function parseMfpCsv(text: string): Promise<MfpPreview> {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('в файле нет строк с едой');
  const head = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  const col = (...names: string[]) => head.findIndex(h => names.some(n => h.includes(n)));
  const ci = {
    date: col('date', 'дата'), meal: col('meal', 'приём'),
    name: col('food name', 'food', 'блюдо', 'название'),
    brand: col('brand', 'производитель'),
    kcal: col('calories', 'ккал', 'калор'),
    f: col('fat', 'жир'), c: col('carbohydrate', 'carbs', 'углев'), p: col('protein', 'белк', 'протеин'),
  };
  if (ci.date < 0 || ci.name < 0 || ci.kcal < 0) throw new Error('не нашёл колонки «дата/блюдо/калории» — это точно выгрузка MFP?');
  const num = (s: string | undefined) => parseFloat((s ?? '').replace(',', '.')) || 0;
  const keyOf = (n: string, b: string) => `${n.toLowerCase().trim()}|${b.toLowerCase().trim()}`;
  const existKeys = new Set((await db.foods.toArray()).map(f => keyOf(f.name, f.brand ?? '')));
  const uniq = new Set<string>();
  let reused = 0;
  const rows: MfpRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    const date = mfpDate(c[ci.date] ?? '');
    const name = c[ci.name] ?? '';
    if (!date || !name) continue;
    const mealRaw = ci.meal >= 0 ? (c[ci.meal] ?? '') : '';
    const slotId = MFP_SLOTS.find(([re]) => re.test(mealRaw))?.[1] ?? 'slot-snack';
    const brand = ci.brand >= 0 ? (c[ci.brand] ?? '') : '';
    const k = keyOf(name, brand);
    if (!uniq.has(k)) { uniq.add(k); if (existKeys.has(k)) reused++; }
    rows.push({ date, slotId, name, brand,
      kcal: num(c[ci.kcal]), p: ci.p >= 0 ? num(c[ci.p]) : 0,
      f: ci.f >= 0 ? num(c[ci.f]) : 0, c: ci.c >= 0 ? num(c[ci.c]) : 0 });
  }
  if (!rows.length) throw new Error('не распознана ни одна строка');
  const dates = rows.map(r => r.date).sort();
  return { rows, newFoods: uniq.size - reused, reusedFoods: reused, from: dates[0], to: dates[dates.length - 1] };
}

export async function applyMfpImport(pv: MfpPreview, replaceRange: boolean): Promise<{ entries: number; foods: number }> {
  let made = 0, n = 0;
  await db.transaction('rw', [db.foods, db.entries, db.slots], async () => {
    const slots = await getSlots();
    const slotById = new Map(slots.map(s => [s.id, s]));
    const byKey = new Map<string, Food>((await db.foods.toArray())
      .map(f => [`${f.name.toLowerCase().trim()}|${(f.brand ?? '').toLowerCase().trim()}`, f] as const));
    if (replaceRange) {
      const inRange = (await db.entries.toArray()).filter(e => e.date >= pv.from && e.date <= pv.to);
      await db.entries.bulkDelete(inRange.map(e => e.id));
    }
    const getFood = (r: MfpRow): Food => {
      const key = `${r.name.toLowerCase().trim()}|${r.brand.toLowerCase().trim()}`;
      const ex = byKey.get(key);
      if (ex) return ex;
      const f: Food = {
        id: newId(), name: r.name, brand: r.brand || undefined,
        category: guessCategory(r.name) ?? 'Импорт MFP',
        kcalPer100g: r.kcal, pPer100g: r.p, fPer100g: r.f, cPer100g: r.c,
        unit: 'pc', source: 'mfp', ownerId: LOCAL_USER, isPublic: false,
        createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null,
      };
      byKey.set(key, f); made++;
      return f;
    };
    const pendingFoods: Food[] = [];
    for (const r of pv.rows) {
      const slot = slotById.get(r.slotId);
      if (!slot) continue;
      const f = getFood(r);
      if (!pendingFoods.includes(f)) pendingFoods.push(f);
      // граммовки в выгрузке MFP нет: каждая строка — порция; снапшот записи = КБЖУ строки
      await addEntry({ date: r.date, slot, kind: 'food', refId: f.id, grams: 100,
        per100: { kcal: r.kcal, p: r.p, f: r.f, c: r.c } });
      n++;
    }
    if (pendingFoods.length) await db.foods.bulkPut(pendingFoods);
  });
  track('import_mfp', { entries: n, foods: made });
  return { entries: n, foods: made };
}

export const TODAY = () => todayISO();
export { fmt };
