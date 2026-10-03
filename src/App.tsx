import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';

// Заглушка M0 до выбора гаммы и вёрстки: проверяет, что схема и сид живут.
export default function App() {
  const foodCount = useLiveQuery(() => db.foods.filter((f) => !f.deletedAt).count(), []);
  const slotNames = useLiveQuery(
    async () => {
      const slots = await db.slots.filter((s) => !s.deletedAt).toArray();
      return slots.sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.name);
    },
    [],
    [] as string[],
  );

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col items-center justify-center gap-3 p-6">
      <h1 className="text-2xl font-bold tracking-tight">Deep Dish</h1>
      <p className="text-sm text-neutral-500">M0 в разработке — ожидаем выбор цветовой гаммы.</p>
      <p className="text-xs text-neutral-400">
        Продуктов в каталоге: {foodCount ?? '…'} · Слоты: {slotNames.join(' / ') || '…'}
      </p>
    </div>
  );
}
