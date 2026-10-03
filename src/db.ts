import Dexie, { type EntityTable } from 'dexie';
import productsSeed from '../data/products_v2.json';

// ── Типы данных (единая модель, см. SPEC.md §3) ──────────────────────────────

export type FoodSource = 'system' | 'custom' | 'off' | 'fork';

export interface Food {
  id: string;
  name: string;
  brand?: string;
  category: string;
  kcalPer100g: number;
  pPer100g: number;
  fPer100g: number;
  cPer100g: number;
  portionG?: number;
  portionLabel?: string;
  barcode?: string;
  source: FoodSource;
  ownerId: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface RecipeItem {
  foodId: string;
  grams: number;
}

export interface Recipe {
  id: string;
  name: string;
  items: RecipeItem[];
  yieldG: number;
  kcalPer100g: number;
  pPer100g: number;
  fPer100g: number;
  cPer100g: number;
  ownerId: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface SavedMeal {
  id: string;
  name: string;
  items: RecipeItem[];
  slotHint?: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Slot {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface KbjuSnapshot {
  kcal: number;
  p: number;
  f: number;
  c: number;
}

export interface Entry {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD, локальная
  timeEaten: string; // HH:MM
  slotId: string;
  kind: 'food' | 'recipe';
  refId: string;
  grams: number;
  snapshot: KbjuSnapshot;
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface WeightLog {
  id: string;
  userId: string;
  date: string;
  weightKg: number;
  bodyFatPct?: number;
  source: 'manual' | 'health';
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Profile {
  userId: string;
  gender: 'male' | 'female';
  age: number;
  heightCm: number;
  formula: 'mifflin' | 'katch' | 'manual';
  manualTdee?: number;
  bodyFatPct?: number;
  activity: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose' | 'maintain' | 'gain';
  paceKgPerWeek: number;
  goalWeightKg?: number;
  updatedAt: number;
}

// ── Идентификаторы ───────────────────────────────────────────────────────────

/** UUIDv7: сортируем по времени, уникальен без сервера. */
export function newId(): string {
  const t = Date.now();
  const rnd = crypto.getRandomValues(new Uint8Array(10));
  const b = new Uint8Array(16);
  b[0] = (t / 2 ** 40) & 255;
  b[1] = (t / 2 ** 32) & 255;
  b[2] = (t / 2 ** 24) & 255;
  b[3] = (t / 2 ** 16) & 255;
  b[4] = (t / 2 ** 8) & 255;
  b[5] = t & 255;
  b[6] = 0x70 | (rnd[0] & 0x0f);
  b[7] = rnd[1];
  b[8] = 0x80 | (rnd[2] & 0x3f);
  for (let i = 9; i < 16; i++) b[i] = rnd[i - 6];
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Локальный юзер до появления сервера (M2 подменит на серверный id). */
export const LOCAL_USER = 'local';

const SYSTEM_EPOCH = 1; // «время» системных записей — раньше любых пользовательских

// ── База ──────────────────────────────────────────────────────────────────────

class DeepDishDb extends Dexie {
  foods!: EntityTable<Food, 'id'>;
  recipes!: EntityTable<Recipe, 'id'>;
  savedMeals!: EntityTable<SavedMeal, 'id'>;
  slots!: EntityTable<Slot, 'id'>;
  entries!: EntityTable<Entry, 'id'>;
  weightLogs!: EntityTable<WeightLog, 'id'>;
  profiles!: EntityTable<Profile, 'userId'>;

  constructor() {
    super('deepdish');
    this.version(1).stores({
      foods: 'id, name, category, barcode, ownerId, source, deletedAt',
      recipes: 'id, name, ownerId, deletedAt',
      savedMeals: 'id, name, ownerId, deletedAt',
      slots: 'id, ownerId, sortOrder, deletedAt',
      entries: 'id, userId, date, slotId, refId, deletedAt, [userId+date]',
      weightLogs: 'id, userId, date, deletedAt, [userId+date]',
      profiles: 'userId',
    });
  }
}

export const db = new DeepDishDb();

const DEFAULT_SLOTS: Array<Pick<Slot, 'id' | 'name' | 'sortOrder'>> = [
  { id: 'slot-breakfast', name: 'Завтрак', sortOrder: 1 },
  { id: 'slot-lunch', name: 'Обед', sortOrder: 2 },
  { id: 'slot-dinner', name: 'Ужин', sortOrder: 3 },
  { id: 'slot-snack', name: 'Перекус', sortOrder: 4 },
];

db.on('populate', (tx) => {
  const foods: Food[] = (productsSeed as Array<Record<string, unknown>>).map((p) => ({
    id: String(p.id),
    name: String(p.name),
    category: String(p.category),
    kcalPer100g: Number(p.caloriesPer100g),
    pPer100g: Number(p.proteinPer100g),
    fPer100g: Number(p.fatPer100g),
    cPer100g: Number(p.carbsPer100g),
    source: 'system',
    ownerId: 'system',
    isPublic: true,
    createdAt: SYSTEM_EPOCH,
    updatedAt: SYSTEM_EPOCH,
    deletedAt: null,
  }));
  tx.table('foods').bulkAdd(foods);
  tx.table('slots').bulkAdd(
    DEFAULT_SLOTS.map((s) => ({
      ...s,
      isDefault: true,
      ownerId: LOCAL_USER,
      createdAt: SYSTEM_EPOCH,
      updatedAt: SYSTEM_EPOCH,
      deletedAt: null,
    })),
  );
});
