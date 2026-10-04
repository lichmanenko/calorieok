// Экран «Сегодня»: кольцо нормы, чипы БЖУ, слоты с записями, навигация по датам
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Entry, Slot } from './db';
import { getEntries, getProfile, calcNorma, deleteEntry, saveEntry, track } from './store';
import { shiftISO, todayISO, humanDate, fromISO, MONTHS, WD_SHORT } from './lib';
import { Ring, Sheet, useSwipe, Slide, Confirm, cx } from './ui';

export function TodayScreen({ date, setDate, onAdd, showTime }: {
  date: string; setDate: (d: string) => void; onAdd: (slot: Slot | null) => void; showTime: 'snacks' | 'all';
}) {
  const entries = useLiveQuery(() => getEntries(date), [date], [] as Entry[]);
  const slots = useLiveQuery(() => dbSlots(), [], [] as Slot[]);
  const profile = useLiveQuery(() => getProfile(), []);
  const norma = profile ? calcNorma(profile) : null;

  const [dir, setDir] = useState<0 | -1 | 1>(0);
  const [calOpen, setCalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [confirmDel, setConfirmDel] = useState<Entry | null>(null);

  const totals = useMemo(() => entries.reduce((s, e) => ({
    kcal: s.kcal + e.snapshot.kcal, p: s.p + e.snapshot.p, f: s.f + e.snapshot.f, c: s.c + e.snapshot.c,
  }), { kcal: 0, p: 0, f: 0, c: 0 }), [entries]);

  const target = norma?.kcal ?? 2100;
  const percent = target ? Math.min(999, Math.round(totals.kcal / target * 100)) : 0;
  const rest = Math.max(0, target - totals.kcal);

  const swipe = useSwipe(
    () => { setDate(shiftISO(date, 1)); setDir(-1); },
    () => { setDate(shiftISO(date, -1)); setDir(1); },
  );

  const d = fromISO(date);

  return (
    <div className="min-h-screen px-4 pt-6 pb-28" {...swipe}>
      <div className="flex items-center justify-between mb-4">
        <button className="dd-link-btn" onClick={() => { setDate(shiftISO(date, -1)); setDir(1); }}>‹</button>
        <button className="dd-link-btn" style={{ fontSize: 17, fontWeight: 700 }} onClick={() => setCalOpen(true)}>
          {humanDate(date)} <span style={{ color: 'var(--mut)', fontWeight: 500, fontSize: 13 }}>{WD_SHORT[d.getDay()]}, {d.getDate()} {MONTHS[d.getMonth()].slice(0, 3)}</span>
        </button>
        <button className="dd-link-btn" onClick={() => { setDate(shiftISO(date, 1)); setDir(-1); }}>›</button>
      </div>

      <Slide dir={dir}>
        {!norma && (
          <div className="dd-card p-3 mb-3 text-xs text-center" style={{ color: 'var(--mut)' }}>
            Заполни профиль — появится дневная норма и кольцо. <b style={{ color: 'var(--acc-fg)' }}>Профиль →</b>
          </div>
        )}
        <div className="dd-card p-5 mb-3 flex items-center gap-5">
          <Ring percent={percent}>
            <div className="text-lg font-extrabold dd-num">{rest}</div>
            <div className="text-[10px]" style={{ color: 'var(--mut)' }}>осталось</div>
          </Ring>
          <div>
            <div className="text-xl font-bold dd-num">{Math.round(totals.kcal)} ккал</div>
            <div className="text-xs mt-1" style={{ color: 'var(--mut)' }}>из {target} · {percent}%</div>
            {percent > 100 && <div className="text-xs mt-1" style={{ color: 'var(--warn)' }}>↑ перебор на {Math.round(totals.kcal - target)}</div>}
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <Chip v={`${Math.round(totals.p)} г`} k={`белки${norma ? ` · ${norma.p}` : ''}`} />
          <Chip v={`${Math.round(totals.f)} г`} k={`жиры${norma ? ` · ${norma.f}` : ''}`} />
          <Chip v={`${Math.round(totals.c)} г`} k={`углев.${norma ? ` · ${norma.c}` : ''}`} />
        </div>

        {(slots ?? []).map(slot => {
          const es = entries.filter(e => e.slotId === slot.id);
          const sum = es.reduce((s, e) => s + e.snapshot.kcal, 0);
          return (
            <div key={slot.id} className="dd-card px-4 pt-4 pb-3 mb-2.5" onClick={() => es.length === 0 && onAdd(slot)}>
              <div className="flex justify-between items-baseline mb-1">
                <div className="text-[15px] font-semibold flex items-baseline gap-2">
                  <span>{slot.emoji}</span>{slot.name}
                </div>
                <div className="text-xs dd-num" style={{ color: 'var(--mut)' }}>
                  {es.length ? `${Math.round(sum)} ккал` : 'ничего'}
                </div>
              </div>
              {es.map(e => (
                <EntryLine key={e.id} e={e} slot={slot} showTime={showTime} onClick={() => setEditEntry(e)} />
              ))}
              {es.length === 0 && (
                <div className="text-xs pt-1.5" style={{ color: 'var(--mut)', opacity: .8 }} onClick={() => onAdd(slot)}>＋ добавить</div>
              )}
            </div>
          );
        })}

        <button className="dd-action mt-2" onClick={() => onAdd(null)}>＋ Добавить еду</button>
      </Slide>

      <Calendar open={calOpen} date={date} onClose={() => setCalOpen(false)} onPick={d => { setDate(d); setCalOpen(false); }} />

      <EntryEditModal entry={editEntry} onClose={() => setEditEntry(null)} />
      <Confirm
        open={!!confirmDel}
        text="Удалить запись?"
        onCancel={() => setConfirmDel(null)}
        onOk={() => { if (confirmDel) { deleteEntry(confirmDel.id); track('entry_deleted'); setConfirmDel(null); } }}
      />
    </div>
  );
}

async function dbSlots(): Promise<Slot[]> {
  const { db } = await import('./db');
  const s = await db.slots.filter(x => !x.deletedAt).toArray();
  return s.sort((a, b) => a.sortOrder - b.sortOrder);
}

function Chip({ v, k }: { v: string; k: string }) {
  return (
    <div className="dd-card flex-1 text-center py-2.5">
      <div className="text-[15px] font-bold dd-num">{v}</div>
      <div className="text-[11px]" style={{ color: 'var(--mut)' }}>{k}</div>
    </div>
  );
}

function EntryLine({ e, slot, showTime, onClick }: { e: Entry; slot: Slot; showTime: 'snacks' | 'all'; onClick: () => void }) {
  const [name, setName] = useState<string>('');
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const { db } = await import('./db');
      const f = e.kind === 'food' ? await db.foods.get(e.refId) : await db.recipes.get(e.refId);
      if (alive) setName(f?.name ?? '—');
    })();
    return () => { alive = false; };
  }, [e]);
  const isSnack = slot.defaultTime === null;
  const showT = showTime === 'all' || isSnack;
  return (
    <div className="flex justify-between items-baseline text-[13.5px] py-1 cursor-pointer" onClick={onClick}>
      <span style={{ color: 'var(--mut)' }}>
        {showT && <span className="dd-num" style={{ color: 'var(--acc-fg)' }}>{e.timeEaten} · </span>}
        {name} · {Math.round(e.grams)} г
      </span>
      <span className="dd-num font-medium">{Math.round(e.snapshot.kcal)}</span>
    </div>
  );
}

function Calendar({ open, date, onClose, onPick }: { open: boolean; date: string; onClose: () => void; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(() => { const d = fromISO(date); return new Date(d.getFullYear(), d.getMonth(), 1); });
  React.useEffect(() => { if (open) { const d = fromISO(date); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); } }, [open, date]);
  const grid = useMemo(() => {
    const first = new Date(month); first.setDate(1);
    const shift = (first.getDay() + 6) % 7; // Пн=0
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: Array<string | null> = Array(shift).fill(null);
    for (let i = 1; i <= days; i++) {
      const dd = new Date(month.getFullYear(), month.getMonth(), i);
      cells.push(`${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
    }
    return cells;
  }, [month]);
  const t = todayISO();

  return (
    <Sheet open={open} onClose={onClose} title={`${MONTHS[month.getMonth()]} ${month.getFullYear()}`}>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] mb-1" style={{ color: 'var(--mut)' }}>
        {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(w => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((iso, i) => iso ? (
          <button key={iso} className={cx('dd-cal-cell', iso === date && 'sel', iso === t && 'today')} onClick={() => onPick(iso)}>
            {parseInt(iso.slice(-2), 10)}
          </button>
        ) : <div key={`e${i}`} />)}
      </div>
      <div className="flex justify-between mt-3">
        <button className="dd-link-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹ пред.</button>
        <button className="dd-link-btn" onClick={() => onPick(t)}>сегодня</button>
        <button className="dd-link-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>след. ›</button>
      </div>
    </Sheet>
  );
}

function EntryEditModal({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const [grams, setGrams] = useState('');
  const [time, setTime] = useState('');
  React.useEffect(() => {
    if (entry) { setGrams(String(Math.round(entry.grams))); setTime(entry.timeEaten); }
  }, [entry]);
  if (!entry) return null;
  const g = parseFloat(grams.replace(',', '.')) || 0;
  const ratio = g / Math.max(entry.grams, 0.01);
  return (
    <Sheet open={!!entry} onClose={onClose} title="Запись" note="Поправь вес или время — пересчитается автоматически.">
      <div className="dd-input-row">
        <div className="flex-1">
          <div className="dd-field-label" style={{ marginTop: 0 }}>Вес, г</div>
          <input className="dd-input dd-num" type="number" inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)} />
        </div>
        <div style={{ width: 120 }}>
          <div className="dd-field-label" style={{ marginTop: 0 }}>Время</div>
          <input className="dd-input dd-num" type="time" value={time} onChange={e => setTime(e.target.value)} />
        </div>
      </div>
      <div className="dd-card p-3 mt-3 text-center text-xs" style={{ color: 'var(--mut)' }}>
        станет: <b className="dd-num" style={{ color: 'var(--tx)' }}>{Math.round(entry.snapshot.kcal * ratio)} ккал</b>
      </div>
      <div className="flex gap-2 mt-4">
        <button className="dd-action" onClick={async () => { await deleteEntry(entry.id); track('entry_deleted'); onClose(); }}>Удалить</button>
        <button className="dd-action strong" onClick={async () => {
          const k = g / Math.max(entry.grams, 0.01);
          await saveEntry({ ...entry, grams: g, timeEaten: time, snapshot: {
            kcal: Math.round(entry.snapshot.kcal * k), p: Math.round(entry.snapshot.p * k * 10) / 10,
            f: Math.round(entry.snapshot.f * k * 10) / 10, c: Math.round(entry.snapshot.c * k * 10) / 10,
          } });
          track('entry_edited'); onClose();
        }}>Сохранить</button>
      </div>
    </Sheet>
  );
}
