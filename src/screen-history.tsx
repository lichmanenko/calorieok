// История: список дней с итогами, тап — переход на «Сегодня» с датой
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { fromISO, WD_SHORT, MONTHS, todayISO } from './lib';

export function HistoryScreen({ onPickDate }: { onPickDate: (iso: string) => void }) {
  const days = useLiveQuery(async () => {
    const es = await db.entries.filter(e => !e.deletedAt).toArray();
    const slots = await db.slots.toArray();
    const byDay = new Map<string, { kcal: number; count: number }>();
    for (const e of es) {
      const cur = byDay.get(e.date) ?? { kcal: 0, count: 0 };
      cur.kcal += e.snapshot.kcal; cur.count++;
      byDay.set(e.date, cur);
    }
    const t = todayISO();
    const list: Array<{ iso: string; kcal: number; count: number }> = [];
    for (let i = 0; i < 60; i++) {
      const d = fromISO(t); d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const v = byDay.get(iso);
      list.push({ iso, kcal: v?.kcal ?? 0, count: v?.count ?? 0 });
    }
    void slots;
    return list;
  }, []);

  return (
    <div className="min-h-screen px-4 pt-6 pb-28">
      <h1 className="text-xl font-bold mb-1">История</h1>
      <p className="text-xs mb-4" style={{ color: 'var(--mut)' }}>60 дней · тап по дню — открыть</p>
      {(days ?? []).map(d0 => {
        const d = fromISO(d0.iso);
        const empty = d0.count === 0;
        return (
          <button key={d0.iso} className="dd-item" onClick={() => onPickDate(d0.iso)}>
            <div className="flex-1">
              <div className="nm">
                {d.getDate()} {MONTHS[d.getMonth()]} <span style={{ color: 'var(--mut)', fontWeight: 400 }}>({WD_SHORT[d.getDay()]})</span>
              </div>
              <div className="sub">{empty ? 'нет записей' : `${d0.count} записей`}</div>
            </div>
            <div className="kc dd-num" style={{ color: empty ? 'var(--mut)' : 'var(--tx)', fontWeight: 600 }}>
              {empty ? '—' : `${Math.round(d0.kcal)} ккал`}
            </div>
          </button>
        );
      })}
    </div>
  );
}
