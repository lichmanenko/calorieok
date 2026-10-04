// Экран добавления еды: поиск → Недавние → Проверенные ⭐ → Каталог; быстрый «+» с правкой порции и времени
import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Slot } from './db';
import { getCatalog, getRecent, lastGrams, toggleStar, saveCustomFood, saveRecipe, addEntry, track, type CatalogItem } from './store';
import { nowHM, kbjuSuspicious } from './lib';
import { Sheet, Collapse, cx } from './ui';

interface AddScreenProps {
  date: string;
  slot: Slot | null;          // выбранный слот (из «Сегодня»)
  onDone: () => void;         // возврат
}

// локальное состояние свёрнутости секций (запоминается на устройстве)
const collapseState: Record<string, boolean> = JSON.parse(localStorage.getItem('dd-collapse') ?? '{}');
function persistCollapse() { localStorage.setItem('dd-collapse', JSON.stringify(collapseState)); }

export function AddScreen({ date, slot, onDone }: AddScreenProps) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<null | (Pick<EntryEditProps, 'item' | 'presetGrams' | 'presetTime'>)>(null);
  const [creatingFood, setCreatingFood] = useState(false);
  const [creatingRecipe, setCreatingRecipe] = useState(false);

  const catalog = useLiveQuery(() => getCatalog(q), [q], [] as CatalogItem[]);
  const recentKeys = useLiveQuery(() => getRecent(10), [], [] as Array<{ kind: 'food' | 'recipe'; refId: string }>);

  const recentItems = useMemo(() => {
    if (!recentKeys?.length || !catalog) return [];
    const map = new Map(catalog.map(i => [`${i.kind}:${i.id}`, i]));
    return recentKeys.map(k => map.get(`${k.kind}:${k.refId}`)).filter(Boolean) as CatalogItem[];
  }, [recentKeys, catalog]);

  const starred = useMemo(() => (catalog ?? []).filter(i => i.star), [catalog]);
  const byCategory = useMemo(() => {
    const m = new Map<string, CatalogItem[]>();
    for (const i of catalog ?? []) {
      const cat = i.kind === 'food' ? (i.food.source === 'system' ? i.food.category : 'Свои продукты') : 'Рецепты';
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(i);
    }
    return [...m.entries()].sort((a, b) => (a[0] === 'Свои продукты' || a[0] === 'Рецепты' ? 1 : 0) - (b[0] === 'Свои продукты' || b[0] === 'Рецепты' ? 1 : 0));
  }, [catalog]);

  const searching = q.trim().length > 0;

  async function quickAdd(item: CatalogItem) {
    const grams = (await lastGrams(item.kind, item.id)) ?? defaultGramsFor(item);
    setEditing({ item, presetGrams: grams, presetTime: slot?.defaultTime ?? nowHM() });
    track('quick_add_tap', { kind: item.kind });
  }

  function openItem(item: CatalogItem) {
    setEditing({ item, presetGrams: defaultGramsFor(item), presetTime: slot?.defaultTime ?? nowHM() });
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-28">
      <div className="flex items-center gap-2 mb-4">
        <button className="dd-link-btn" onClick={onDone}>← Назад</button>
        <div className="flex-1" />
        <button className="dd-link-btn" onClick={() => setCreatingRecipe(true)}>🍳 Рецепт</button>
        <button className="dd-link-btn" onClick={() => setCreatingFood(true)}>＋ Продукт</button>
      </div>

      <input
        className="dd-input mb-4" placeholder={slot ? `Добавить в «${slot.name}»…` : 'Поиск по каталогу…'}
        value={q} onChange={e => setQ(e.target.value)} autoFocus={false}
      />

      {searching ? (
        <>
          {(catalog ?? []).length === 0 && <p className="text-sm mt-6 text-center" style={{ color: 'var(--mut)' }}>Ничего не нашлось. Можно создать свой продукт →「＋ Продукт」</p>}
          {(catalog ?? []).map(i => <ItemRow key={`${i.kind}:${i.id}`} item={i} onOpen={() => openItem(i)} onQuick={() => quickAdd(i)} onStar={() => toggleStar(i)} />)}
        </>
      ) : (
        <>
          <Section title={`🕘 Недавние`} count={recentItems.length} id="recent">
            {recentItems.map(i => <ItemRow key={`r-${i.kind}:${i.id}`} item={i} onOpen={() => openItem(i)} onQuick={() => quickAdd(i)} onStar={() => toggleStar(i)} />)}
            {recentItems.length === 0 && <Empty text="Пока пусто — добавь первое блюдо" />}
          </Section>

          <Section title={`⭐ Проверенные`} count={starred.length} id="starred">
            {starred.map(i => <ItemRow key={`s-${i.kind}:${i.id}`} item={i} onOpen={() => openItem(i)} onQuick={() => quickAdd(i)} onStar={() => toggleStar(i)} />)}
            {starred.length === 0 && <Empty text="Отметь звездой то, чему доверяешь — будет всегда под рукой" />}
          </Section>

          {byCategory.map(([cat, items]) => (
            <Section key={cat} title={cat} count={items.length} id={`cat-${cat}`}>
              {items.map(i => <ItemRow key={`${cat}-${i.kind}:${i.id}`} item={i} onOpen={() => openItem(i)} onQuick={() => quickAdd(i)} onStar={() => toggleStar(i)} />)}
            </Section>
          ))}
        </>
      )}

      <EntryEdit
        date={date} slot={slot} open={!!editing}
        item={editing?.item ?? null} presetGrams={editing?.presetGrams} presetTime={editing?.presetTime}
        onClose={() => setEditing(null)}
      />
      <CreateFood open={creatingFood} onClose={() => setCreatingFood(false)} />
      <CreateRecipe open={creatingRecipe} onClose={() => setCreatingRecipe(false)} />
    </div>
  );
}

function defaultGramsFor(i: CatalogItem): number {
  return i.kind === 'food' ? (i.food.portionG ?? 100) : 150;
}

function Section({ title, count, id, children }: { title: string; count: number; id: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(collapseState[id] ?? true);
  return (
    <Collapse
      title={title}
      right={count ? `${count}` : undefined}
      open={open}
      onToggle={() => { collapseState[id] = !open; persistCollapse(); setOpen(!open); }}
    >
      {children}
    </Collapse>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs px-4 py-3" style={{ color: 'var(--mut)' }}>{text}</p>;
}

function ItemRow({ item, onOpen, onQuick, onStar }: { item: CatalogItem; onOpen: () => void; onQuick: () => void; onStar: () => void }) {
  return (
    <div className="dd-item" onClick={onOpen} role="button">
      <div className="min-w-0 flex-1">
        <div className="nm flex items-center gap-1.5">
          <span className="dd-star cursor-pointer" onClick={e => { e.stopPropagation(); onStar(); }}>{item.star ? '⭐' : '☆'}</span>
          <span className="truncate">{item.name}</span>
          {item.suspicious && <span className="dd-warnmark" title="КБЖУ под вопросом">⚠️</span>}
        </div>
        <div className="sub">{item.sub} · {Math.round(item.per100.kcal)} ккал/100 г</div>
      </div>
      <div className="kc dd-num">{Math.round(item.per100.p)}/{Math.round(item.per100.f)}/{Math.round(item.per100.c)}</div>
      <button className="plus" onClick={e => { e.stopPropagation(); onQuick(); }}>+</button>
    </div>
  );
}

// ── Карточка ввода: граммы + время + сохранить ──
export interface EntryEditProps {
  date: string; slot: Slot | null; open: boolean;
  item: CatalogItem | null;
  presetGrams?: number; presetTime?: string;
  onClose: () => void;
}

function EntryEdit({ date, slot, open, item, presetGrams, presetTime, onClose }: EntryEditProps) {
  const slots = useLiveQuery(() => db.slots.filter(s => !s.deletedAt).toArray(), [], [] as Slot[]);
  const [grams, setGrams] = useState('');
  const [time, setTime] = useState('');
  const [slotId, setSlotId] = useState('');
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setGrams(String(presetGrams ?? defaultGramsFor(item)));
    setTime(presetTime ?? nowHM());
    setSlotId(slot?.id ?? 'slot-snack');
    setWarn(false);
  }, [open, item, presetGrams, presetTime, slot]);

  if (!item) return null;
  const g = parseFloat(grams.replace(',', '.')) || 0;
  const k = g / 100;
  const cur = slots.find(s => s.id === slotId) ?? slots[0];

  async function doSave(force = false) {
    if (!item || !cur || g <= 0) return;
    if (!force && kbjuSuspicious(item.per100.kcal, item.per100.p, item.per100.f, item.per100.c, item.name)) {
      setWarn(true); return;
    }
    await addEntry({ date, slot: cur, kind: item.kind, refId: item.id, grams: g, per100: item.per100, timeEaten: time });
    track('entry_added', { kind: item.kind, source: 'add-screen' });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={item.name} note={`${Math.round(item.per100.kcal)} ккал · Б/${Math.round(item.per100.p)} · Ж/${Math.round(item.per100.f)} · У/${Math.round(item.per100.c)} на 100 г`}>
      <div className="dd-input-row">
        <div className="flex-1">
          <div className="dd-field-label" style={{ marginTop: 0 }}>Вес порции, г</div>
          <input className="dd-input dd-num" type="number" inputMode="decimal" value={grams}
            onChange={e => setGrams(e.target.value)} />
        </div>
        <div style={{ width: 120 }}>
          <div className="dd-field-label" style={{ marginTop: 0 }}>Время</div>
          <input className="dd-input dd-num" type="time" value={time} onChange={e => setTime(e.target.value)} />
        </div>
      </div>

      <div className="dd-field-label">Приём пищи</div>
      <div className="dd-seg">
        {slots.sort((a, b) => a.sortOrder - b.sortOrder).map(s => (
          <button key={s.id} className={cx(s.id === slotId && 'on')} onClick={() => setSlotId(s.id)}>{s.emoji} {s.name}</button>
        ))}
      </div>

      <div className="dd-card p-4 mt-4 text-center">
        <div className="text-2xl font-extrabold dd-num">{Math.round(item.per100.kcal * k)}</div>
        <div className="text-xs mt-1" style={{ color: 'var(--mut)' }}>
          ккал · Б {Math.round(item.per100.p * k)} · Ж {Math.round(item.per100.f * k)} · У {Math.round(item.per100.c * k)}
        </div>
      </div>

      {warn && (
        <div className="dd-card p-3 mt-3 text-xs" style={{ color: 'var(--warn)' }}>
          ⚠️ КБЖУ этого блюда выглядят непоследовательно (калории не сходятся с белками/жирами/углеводами).
          Проверь карточку — или сохрани как есть.
        </div>
      )}

      <div className="flex gap-2 mt-4">
        {warn
          ? <>
            <button className="dd-action" onClick={onClose}>Не сохранять</button>
            <button className="dd-action strong" onClick={() => doSave(true)}>Сохранить как есть</button>
          </>
          : <button className="dd-action strong" onClick={() => doSave()}>Сохранить</button>}
      </div>
    </Sheet>
  );
}

// ── Создание своего продукта ──
function CreateFood({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState(''); const [p, setP] = useState(''); const [f, setF] = useState(''); const [c, setC] = useState('');
  const [portion, setPortion] = useState('');
  const [warn, setWarn] = useState(false);
  const cats = useLiveQuery(async () => [...new Set((await db.foods.toArray()).map(x => x.category))].sort(), [], [] as string[]);
  const [cat, setCat] = useState('Свои продукты');

  const nums = [kcal, p, f, c].map(x => parseFloat(x.replace(',', '.')) || 0);
  const suspicious = open && name && kbjuSuspicious(nums[0], nums[1], nums[2], nums[3], name);

  async function save(force = false) {
    if (!name || nums[0] <= 0) return;
    if (!force && suspicious) { setWarn(true); return; }
    const food = await saveCustomFood({
      name, category: cat, kcalPer100g: nums[0], pPer100g: nums[1], fPer100g: nums[2], cPer100g: nums[3],
      portionG: parseFloat(portion) || undefined,
    });
    track('food_created');
    onClose(); reset();
    void food;
  }
  function reset() { setName(''); setKcal(''); setP(''); setF(''); setC(''); setPortion(''); setWarn(false); }

  return (
    <Sheet open={open} onClose={() => { onClose(); reset(); }} title="Свой продукт" note="КБЖУ на 100 г. Продукт появится в каталоге семьи.">
      <input className="dd-input" placeholder="Название (напр. Творог 9%)" value={name} onChange={e => setName(e.target.value)} />
      <div className="dd-field-label">Категория</div>
      <select className="dd-input" value={cat} onChange={e => setCat(e.target.value)}>
        <option value="Свои продукты">Свои продукты</option>
        {(cats ?? []).map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <div className="dd-input-row mt-2">
        <NumCell label="ккал" v={kcal} set={setKcal} />
        <NumCell label="белки" v={p} set={setP} />
        <NumCell label="жиры" v={f} set={setF} />
        <NumCell label="углев." v={c} set={setC} />
      </div>
      <div className="dd-field-label">Порция по умолчанию, г (необязательно)</div>
      <input className="dd-input dd-num" type="number" inputMode="numeric" value={portion} onChange={e => setPortion(e.target.value)} />
      {suspicious && <div className="dd-card p-3 mt-3 text-xs" style={{ color: 'var(--warn)' }}>⚠️ Калории не сходятся с БЖУ (расхождение &gt;25%). Проверь цифры.</div>}
      <div className="flex gap-2 mt-4">
        {suspicious || warn
          ? <>
            <button className="dd-action" onClick={() => { onClose(); reset(); }}>Не сохранять</button>
            <button className="dd-action strong" onClick={() => save(true)}>Сохранить как есть</button>
          </>
          : <button className="dd-action strong" onClick={() => save()}>Сохранить</button>}
      </div>
    </Sheet>
  );
}

function NumCell({ label, v, set }: { label: string; v: string; set: (s: string) => void }) {
  return (
    <div className="flex-1">
      <div className="dd-field-label" style={{ marginTop: 0 }}>{label}</div>
      <input className="dd-input dd-num" type="number" inputMode="decimal" value={v} onChange={e => set(e.target.value)} />
    </div>
  );
}

// ── Редактор рецепта ──
function CreateRecipe({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [items, setItems] = useState<Array<{ foodId: string; grams: number }>>([]);
  const [yieldG, setYield] = useState('');
  const [picking, setPicking] = useState(false);
  const [pickQ, setPickQ] = useState('');
  const [err, setErr] = useState('');

  const foods = useLiveQuery(() => db.foods.filter(f => !f.deletedAt && f.source === 'system').toArray(), [], []);
  const picked = items.map(i => foods?.find(f => f.id === i.foodId)).filter(Boolean) as NonNullable<typeof foods>;
  const totalKcal = items.reduce((s, it, i) => s + (picked[i] ? picked[i].kcalPer100g * it.grams / 100 : 0), 0);

  async function save() {
    if (!name || items.length === 0 || !parseFloat(yieldG)) { setErr('Нужны название, хотя бы один ингредиент и выход готового веса'); return; }
    await saveRecipe(name, items, parseFloat(yieldG));
    onClose(); setName(''); setItems([]); setYield(''); setErr('');
  }

  const filtered = (foods ?? []).filter(f => !pickQ || f.name.toLowerCase().includes(pickQ.toLowerCase())).slice(0, 30);

  return (
    <Sheet open={open} onClose={onClose} title="Новый рецепт" note="Ингредиенты с граммовками + выход готового веса — КБЖУ посчитаются сами.">
      <input className="dd-input" placeholder="Название (напр. Сырники)" value={name} onChange={e => setName(e.target.value)} />
      <div className="dd-field-label">Ингредиенты</div>
      {items.map((it, i) => {
        const fd = picked[i];
        return (
          <div key={it.foodId} className="dd-item">
            <div className="flex-1">
              <div className="nm">{fd?.name}</div>
              <input className="dd-input dd-num mt-1" style={{ padding: '8px 10px' }} type="number" inputMode="numeric"
                value={it.grams}
                onChange={e => setItems(items.map((x, j) => j === i ? { ...x, grams: parseFloat(e.target.value) || 0 } : x))} />
            </div>
            <button className="plus" onClick={() => setItems(items.filter((_, j) => j !== i))}>−</button>
          </div>
        );
      })}
      <button className="dd-action" onClick={() => setPicking(true)}>＋ Добавить ингредиент</button>

      <div className="dd-field-label">Выход готового веса, г (весь рецепт)</div>
      <input className="dd-input dd-num" type="number" inputMode="numeric" value={yieldG} onChange={e => setYield(e.target.value)} placeholder="напр. 520" />

      {items.length > 0 && parseFloat(yieldG) > 0 && (
        <div className="dd-card p-3 mt-3 text-center text-xs" style={{ color: 'var(--mut)' }}>
          Весь рецепт: <b style={{ color: 'var(--tx)' }} className="dd-num">{Math.round(totalKcal)} ккал</b> ·
          на 100 г: <b style={{ color: 'var(--tx)' }} className="dd-num">{Math.round(totalKcal / parseFloat(yieldG) * 100)} ккал</b>
        </div>
      )}
      {err && <div className="text-xs mt-2" style={{ color: 'var(--warn)' }}>{err}</div>}
      <div className="flex gap-2 mt-4">
        <button className="dd-action" onClick={onClose}>Отмена</button>
        <button className="dd-action strong" onClick={save}>Сохранить рецепт</button>
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Ингредиент">
        <input className="dd-input mb-3" placeholder="Поиск продукта…" value={pickQ} onChange={e => setPickQ(e.target.value)} />
        {filtered.map(f => (
          <button key={f.id} className="dd-item" onClick={() => { setItems([...items, { foodId: f.id, grams: 100 }]); setPicking(false); setPickQ(''); }}>
            <div className="flex-1">
              <div className="nm">{f.name}</div>
              <div className="sub">{f.category} · {Math.round(f.kcalPer100g)} ккал/100 г</div>
            </div>
          </button>
        ))}
      </Sheet>
    </Sheet>
  );
}
