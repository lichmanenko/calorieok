// Экран «Сегодня»: кольцо нормы, чипы БЖУ, слоты с записями, навигация по датам
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Entry, type Slot } from './db';
import { getEntries, getProfile, calcNorma, deleteEntry, saveEntry, track } from './store';
import { shiftISO, todayISO, humanDate, headDateSub, fromISO, MONTHS_NOM, fmt } from './lib';
import { Ring, Sheet, useSwipe, Slide, Confirm, cx, Modal } from './ui';

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
  const [explain, setExplain] = useState<null | { title: string; text: string }>(null);

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

  const filledDays = useLiveQuery(async () => {
    const es = await db.entries.filter(e => !e.deletedAt).toArray();
    const s = new Set<string>();
    es.forEach((e: Entry) => s.add(e.date));
    return s;
  }, [], new Set<string>());

  return (
    <div className="min-h-screen px-4 pt-6 pb-28" {...swipe}>
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center">
          <button className="dd-arrow" onClick={() => { setDate(shiftISO(date, -1)); setDir(1); }} aria-label="Предыдущий день">‹</button>
          <button onClick={() => setCalOpen(true)} className="text-left px-0.5">
            <div className="text-[18px] font-bold tracking-tight leading-tight">{humanDate(date)}</div>
            {headDateSub(date) && <div className="text-[10.5px]" style={{ color: 'var(--mut)' }}>{headDateSub(date)}</div>}
          </button>
          <button className="dd-arrow" onClick={() => { setDate(shiftISO(date, 1)); setDir(-1); }} aria-label="Следующий день">›</button>
        </div>
        <div className="flex items-center gap-1.5" style={{ color: 'var(--acc-fg)' }}>
          <svg width="20" height="20" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="48" cy="48" r="38" fill="none" stroke="var(--tr)" strokeWidth="12" />
            <circle cx="48" cy="48" r="38" fill="none" stroke="var(--acc)" strokeWidth="12" strokeLinecap="round" strokeDasharray="172 239" />
          </svg>
          <span className="text-[16px] font-bold tracking-tight" style={{ color: 'var(--tx)' }}>deep dish</span>
        </div>
      </div>

      <Slide dir={dir}>
        {!norma && (
          <div className="dd-card p-3 mb-3 text-xs text-center" style={{ color: 'var(--mut)' }}>
            Заполни профиль — появится дневная норма и кольцо. <b style={{ color: 'var(--acc-fg)' }}>Профиль →</b>
          </div>
        )}
        <div className="dd-card p-5 mb-3 flex items-center gap-5">
          <Ring percent={percent}>
            <div className="text-lg font-extrabold dd-num">{fmt(rest)}</div>
            <div className="text-[10px]" style={{ color: 'var(--mut)' }}>осталось</div>
          </Ring>
          <div>
            <div className="text-xl font-bold dd-num">{fmt(totals.kcal)} ккал</div>
            <div className="text-xs mt-1" style={{ color: 'var(--mut)' }}>из {target} · {percent}%</div>
            {percent > 100 && <div className="text-xs mt-1" style={{ color: 'var(--warn)' }}>↑ перебор на {fmt(totals.kcal - target)}</div>}
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <MacroChip v={totals.p} goal={norma?.p} k="белки" onClick={() => setExplain({
            title: 'Белки',
            text: norma
              ? `Белков сегодня — ${fmt(totals.p)} г, а цель на день — ${fmt(norma.p)} г. ${totals.p > norma.p ? 'Это немного больше плана: не страшно, просто информация.' : 'Укладываешься в план.'}`
              : 'Заполни профиль — появятся цели по белкам, жирам и углеводам.',
          })} />
          <MacroChip v={totals.f} goal={norma?.f} k="жиры" onClick={() => setExplain({
            title: 'Жиры',
            text: norma
              ? `Жиров сегодня — ${fmt(totals.f)} г, а цель на день — ${fmt(norma.f)} г. ${totals.f > norma.f ? 'Это немного больше плана: не страшно, просто информация.' : 'Укладываешься в план.'}`
              : 'Заполни профиль — появятся цели по белкам, жирам и углеводам.',
          })} />
          <MacroChip v={totals.c} goal={norma?.c} k="углев." onClick={() => setExplain({
            title: 'Углеводы',
            text: norma
              ? `Углеводов сегодня — ${fmt(totals.c)} г, а цель на день — ${fmt(norma.c)} г. ${totals.c > norma.c ? 'Это немного больше плана: не страшно, просто информация.' : 'Укладываешься в план.'}`
              : 'Заполни профиль — появятся цели по белкам, жирам и углеводам.',
          })} />
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
                  {es.length ? `${fmt(sum)} ккал` : 'ничего'}
                </div>
              </div>
              {es.map(e => (
                <EntryLine key={e.id} e={e} slot={slot} showTime={showTime} onClick={() => setEditEntry(e)} />
              ))}
              <div className="dd-slot-add" onClick={() => onAdd(slot)}>＋ добавить</div>
            </div>
          );
        })}

        <button className="dd-action mt-2" onClick={() => onAdd(null)}>＋ Добавить еду</button>
      </Slide>

      <Calendar open={calOpen} date={date} onClose={() => setCalOpen(false)} onPick={d => { setDate(d); setCalOpen(false); }} filled={filledDays} />

      <EntryEditModal entry={editEntry} onClose={() => setEditEntry(null)} />
      <Modal open={!!explain} onClose={() => setExplain(null)}>
        <div className="text-[15px] font-bold mb-2">{explain?.title}</div>
        <p className="dd-modal-text">{explain?.text}</p>
        <div className="dd-modal-row">
          <button className="dd-action strong" onClick={() => setExplain(null)}>Понятно</button>
        </div>
      </Modal>

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

function MacroChip({ v, goal, k, onClick }: { v: number; goal?: number; k: string; onClick: () => void }) {
  const over = goal !== undefined && v > goal;
  return (
    <div className="dd-card flex-1 text-center py-2.5 cursor-pointer" onClick={onClick}>
      <div className="text-[15px] font-bold dd-num flex items-center justify-center gap-1" style={over ? { color: 'var(--warn)' } : undefined}>
        {fmt(v)} г{over && <span className="text-[11px]">▲</span>}
      </div>
      <div className="text-[11px]" style={{ color: 'var(--mut)' }}>{k}{goal !== undefined ? ` · ${fmt(goal)}` : ''}</div>
    </div>
  );
}


function EntryLine({ e, slot, showTime, onClick }: { e: Entry; slot: Slot; showTime: 'snacks' | 'all'; onClick: () => void }) {
  const [name, setName] = useState<string>('');
  const [isPc, setIsPc] = useState(false);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const f = e.kind === 'food' ? await db.foods.get(e.refId) : await db.recipes.get(e.refId);
      if (alive) { setName(f?.name ?? '—'); setIsPc(e.kind === 'food' && (f as import('./db').Food | undefined)?.unit === 'pc'); }
    })();
    return () => { alive = false; };
  }, [e]);
  const qtyLabel = isPc
    ? ` · ${(Math.round((e.grams / 100) * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} шт`
    : ` · ${fmt(e.grams)} г`;
  const isSnack = slot.defaultTime === null;
  const showT = showTime === 'all' || isSnack;
  return (
    <div className="flex justify-between items-baseline text-[13.5px] py-1 cursor-pointer" onClick={onClick}>
      <span style={{ color: 'var(--mut)' }}>
        {showT && <span className="dd-num" style={{ color: 'var(--acc-fg)' }}>{e.timeEaten} · </span>}
        {name}{qtyLabel}
      </span>
      <span className="dd-num font-medium">{fmt(e.snapshot.kcal)}</span>
    </div>
  );
}

function Calendar({ open, date, onClose, onPick, filled }: { open: boolean; date: string; onClose: () => void; onPick: (d: string) => void; filled: Set<string> }) {
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
    <Sheet open={open} onClose={onClose} title={`${MONTHS_NOM[month.getMonth()]} ${month.getFullYear()}`}>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] mb-1" style={{ color: 'var(--mut)' }}>
        {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(w => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((iso, i) => iso ? (
          <button key={iso} className={cx('dd-cal-cell', iso === date && 'sel', iso === t && 'today')} onClick={() => onPick(iso)}>
            {parseInt(iso.slice(-2), 10)}
            {filled.has(iso) && <span className="dd-cal-dot" />}
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
