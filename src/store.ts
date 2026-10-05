// Слой доступа к данным + расчёты нормы + трекер метрик
import { db, newId, LOCAL_USER, type Entry, type Food, type Profile, type Recipe, type Slot, type KbjuSnapshot } from './db';
import { todayISO, nowHM, kbjuSuspicious, fmt } from './lib';

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

export const TODAY = () => todayISO();
export { fmt };
