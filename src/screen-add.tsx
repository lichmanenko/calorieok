// Экран добавления еды: sticky-шапка (поиск + «Недавние»/«Проверенные» чипами) + единый несворачиваемый «Все продукты»
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Slot } from './db';
import { getCatalog, getRecent, lastGrams, toggleStar, saveCustomFood, saveRecipe, addEntry, track, type CatalogItem } from './store';
import { nowHM, kbjuSuspicious, fmt } from './lib';
import { Sheet, cx } from './ui';

interface AddScreenProps {
  date: string;
  slot: Slot | null;
  onDone: () => void;
}

export function AddScreen({ date, slot, onDone }: AddScreenProps) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<null | (Pick<EntryEditProps, 'item' | 'presetGrams' | 'presetTime'>)>(null);
  const [creatingFood, setCreatingFood] = useState(false);
  const [creatingRecipe, setCreatingRecipe] = useState(false);

  const catalog = useLiveQuery(() => getCatalog(q), [q], [] as CatalogItem[]);
  const recentKeys = useLiveQuery(() => getRecent(10), [], [] as Array<{ kind: 'food' | 'recipe'; refId: string }>);

  const { recentItems, starred } = useMemo(() => {
    const map = new Map((catalog ?? []).map(i => [`${i.kind}:${i.id}`, i]));
    const rec = (recentKeys ?? []).map(k => map.get(`${k.kind}:${k.refId}`)).filter(Boolean) as CatalogItem[];
    const star = (catalog ?? []).filter(i => i.star);
    return { recentItems: rec, starred: star };
  }, [recentKeys, catalog]);

  // Единый список: свои и рецепты сверху, далее по алфавиту
  const allItems = useMemo(() => {
    const own = (catalog ?? []).filter(i => i.kind === 'recipe' || i.food.source !== 'system');
    const sys = (catalog ?? []).filter(i => i.kind === 'food' && i.food.source === 'system');
    sys.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return [...own, ...sys];
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
    <div className="min-h-screen pb-28">
      {/* Sticky-шапка: поиск + ряды чипов; скроллится только список ниже */}
      <div className="dd-addhead">
        <div className="flex items-center gap-1 px-4 pt-5">
          <button className="dd-link-btn" onClick={onDone}>←</button>
          <div className="flex-1" />
          <button className="dd-link-btn" onClick={() => setCreatingRecipe(true)}>🍳</button>
          <button className="dd-link-btn" onClick={() => setCreatingFood(true)}>＋ продукт</button>
        </div>
        <div className="px-4 pt-1">
          <input
            className="dd-input" placeholder={slot ? `Добавить в «${slot.name}»…` : 'Поиск: название или штрихкод…'}
            value={q} onChange={e => setQ(e.target.value)}
          />
        </div>
        {!searching && (recentItems.length > 0 || starred.length > 0) && (
          <div className="px-4 pt-2">
            {recentItems.length > 0 && (
              <ChipRow title="🕘 Недавние" items={recentItems} onOpen={openItem} onQuick={quickAdd} />
            )}
            {starred.length > 0 && (
              <ChipRow title="⭐ Проверенные" items={starred} onOpen={openItem} onQuick={quickAdd} />
            )}
          </div>
        )}
      </div>

      <div className="px-4">
        {searching ? (
          <>
            {(catalog ?? []).length === 0 && <p className="text-sm mt-6 text-center" style={{ color: 'var(--mut)' }}>Ничего. Создай свой продукт — кнопка「＋ продукт」</p>}
            {(catalog ?? []).map(i => <ItemRow key={`${i.kind}:${i.id}`} item={i} onOpen={() => openItem(i)} onQuick={() => quickAdd(i)} onStar={() => toggleStar(i)} />)}
          </>
        ) : (
          <>
            <div className="dd-allhead">Все продукты</div>
            {allItems.map(i => <ItemRow key={`a-${i.kind}:${i.id}`} item={i} onOpen={() => openItem(i)} onQuick={() => quickAdd(i)} onStar={() => toggleStar(i)} />)}
          </>
        )}
      </div>

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
  if (i.kind === 'food' && i.unit === 'pc') return 100; // 1 порция = 100 условных г
  return i.kind === 'food' ? (i.food.portionG ?? 100) : 150;
}

function ChipRow({ title, items, onOpen, onQuick }: {
  title: string; items: CatalogItem[]; onOpen: (i: CatalogItem) => void; onQuick: (i: CatalogItem) => void;
}) {
  return (
    <div className="mb-1.5">
      <div className="dd-chiprow-title">{title}</div>
      <div className="dd-chiprow">
        {items.map(i => (
          <div key={i.kind + i.id} className="dd-qchip" onClick={() => onOpen(i)}>
            <span className="dd-qchip-nm">{i.name}</span>
            <span className="dd-qchip-kc dd-num">{fmt(i.per100.kcal)}</span>
            <button className="dd-qchip-plus" onClick={e => { e.stopPropagation(); onQuick(i); }}>+</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemRow({ item, onOpen, onQuick, onStar }: { item: CatalogItem; onOpen: () => void; onQuick: () => void; onStar: () => void }) {
  const perLabel = item.unit === 'pc' ? 'ккал/порц.' : 'ккал/100 г';
  return (
    <div className="dd-item" onClick={onOpen} role="button">
      <div className="min-w-0 flex-1">
        <div className="nm flex items-center gap-1.5">
          <span className="dd-star cursor-pointer" onClick={e => { e.stopPropagation(); onStar(); }}>{item.star ? '⭐' : '☆'}</span>
          <span className="truncate">{item.name}</span>
          {item.suspicious && <span className="dd-warnmark" title="КБЖУ под вопросом">⚠️</span>}
        </div>
        <div className="sub">{item.sub} · {fmt(item.per100.kcal)} {perLabel}</div>
      </div>
      <div className="kc dd-num">{fmt(item.per100.p)}/{fmt(item.per100.f)}/{fmt(item.per100.c)}</div>
      <button className="plus" onClick={e => { e.stopPropagation(); onQuick(); }}>+</button>
    </div>
  );
}

// ── Карточка ввода: количество (г или порции) + время + сохранить ──
export interface EntryEditProps {
  date: string; slot: Slot | null; open: boolean;
  item: CatalogItem | null;
  presetGrams?: number; presetTime?: string;
  onClose: () => void;
}

function EntryEdit({ date, slot, open, item, presetGrams, presetTime, onClose }: EntryEditProps) {
  const slots = useLiveQuery(() => db.slots.filter(s => !s.deletedAt).toArray(), [], [] as Slot[]);
  const [qty, setQty] = useState('');        // граммы ИЛИ порции — в зависимости от unit
  const [time, setTime] = useState('');
  const [slotId, setSlotId] = useState('');
  const [warn, setWarn] = useState(false);

  const isPc = item?.unit === 'pc';

  useEffect(() => {
    if (!open || !item) return;
    const g = presetGrams ?? defaultGramsFor(item);
    setQty(isPc ? String(Math.round(g)) : String(Math.round(g)));
    setTime(presetTime ?? nowHM());
    setSlotId(slot?.id ?? 'slot-snack');
    setWarn(false);
  }, [open, item, presetGrams, presetTime, slot, isPc]);

  if (!item) return null;
  const n = parseFloat(qty.replace(',', '.')) || 0;
  const grams = isPc ? n * 100 : n; // порционные: шт × 100 условных г
  const k = grams / 100;
  const cur = slots.find(s => s.id === slotId) ?? slots[0];

  async function doSave(force = false) {
    if (!item || !cur || n <= 0) return;
    if (!force && kbjuSuspicious(item.per100.kcal, item.per100.p, item.per100.f, item.per100.c, item.name)) {
      setWarn(true); return;
    }
    await addEntry({ date, slot: cur, kind: item.kind, refId: item.id, grams, per100: item.per100, timeEaten: time });
    track('entry_added', { kind: item.kind, unit: item.unit, source: 'add-screen' });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={item.name}
      note={isPc
        ? `${fmt(item.per100.kcal)} ккал · Б ${fmt(item.per100.p)} · Ж ${fmt(item.per100.f)} · У ${fmt(item.per100.c)} на порцию`
        : `${fmt(item.per100.kcal)} ккал · Б ${fmt(item.per100.p)} · Ж ${fmt(item.per100.f)} · У ${fmt(item.per100.c)} на 100 г`}>
      <div className="dd-input-row">
        <div className="flex-1 min-w-0">
          <div className="dd-field-label" style={{ marginTop: 0 }}>{isPc ? 'Порций (шт)' : 'Вес порции, г'}</div>
          <input className="dd-input dd-num" type="number" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
        </div>
        <div className="min-w-0" style={{ width: 116 }}>
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
        <div className="text-2xl font-extrabold dd-num">{fmt(item.per100.kcal * k)}</div>
        <div className="text-xs mt-1" style={{ color: 'var(--mut)' }}>
          {isPc ? `${qty || 0} × порция · ` : ''}ккал · Б {fmt(item.per100.p * k)} · Ж {fmt(item.per100.f * k)} · У {fmt(item.per100.c * k)}
        </div>
      </div>

      {warn && (
        <div className="dd-card p-3 mt-3 text-xs" style={{ color: 'var(--warn)' }}>
          ⚠️ КБЖУ выглядят непоследовательно (калории не сходятся с БЖУ). Проверь карточку — или сохрани как есть.
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

// ── Создание своего продукта: граммы или порции (КБЖУ на порцию), категория, EAN-13 ──
function CreateFood({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<'g' | 'pc'>('g');
  const [kcal, setKcal] = useState(''); const [p, setP] = useState(''); const [f, setF] = useState(''); const [c, setC] = useState('');
  const [ean, setEan] = useState('');
  const [cat, setCat] = useState('Свои продукты');
  const cats = useLiveQuery(async () => [...new Set((await db.foods.toArray()).map(x => x.category))].sort(), [], [] as string[]);

  const nums = [kcal, p, f, c].map(x => parseFloat(x.replace(',', '.')) || 0);
  const perLabel = unit === 'pc' ? 'на 1 порцию' : 'на 100 г';
  const suspicious = open && name && nums[0] > 0 && kbjuSuspicious(nums[0], nums[1], nums[2], nums[3], name);
  const eanOk = ean === '' || /^\d{12,13}$/.test(ean);

  async function save() {
    if (!name || nums[0] <= 0 || !eanOk) return;
    // порционные: КБЖУ порции пишутся в per100-поля (1 порция = 100 условных г)
    await saveCustomFood({
      name, category: cat, unit,
      kcalPer100g: nums[0], pPer100g: nums[1], fPer100g: nums[2], cPer100g: nums[3],
      barcode: ean || undefined,
    });
    onClose(); reset();
  }
  function reset() { setName(''); setUnit('g'); setKcal(''); setP(''); setF(''); setC(''); setEan(''); setCat('Свои продукты'); }

  return (
    <Sheet open={open} onClose={() => { onClose(); reset(); }} title="Свой продукт" note="Учёт в граммах или порциями — порционным достаточно КБЖУ на одну порцию.">
      <input className="dd-input" placeholder="Название (напр. Кофе латте)" value={name} onChange={e => setName(e.target.value)} />

      <div className="dd-field-label">Единица учёта</div>
      <div className="dd-seg">
        <button className={unit === 'g' ? 'on' : ''} onClick={() => setUnit('g')}>граммы</button>
        <button className={unit === 'pc' ? 'on' : ''} onClick={() => setUnit('pc')}>порции (шт)</button>
      </div>

      <div className="dd-field-label">КБЖУ {perLabel}</div>
      <div className="dd-input-row">
        <NumCell label="ккал" v={kcal} set={setKcal} />
        <NumCell label="белки" v={p} set={setP} />
        <NumCell label="жиры" v={f} set={setF} />
        <NumCell label="углев." v={c} set={setC} />
      </div>

      <div className="dd-field-label">Категория</div>
      <select className="dd-input dd-select" value={cat} onChange={e => setCat(e.target.value)}>
        <option value="Свои продукты">Свои продукты</option>
        {(cats ?? []).map(x => <option key={x} value={x}>{x}</option>)}
      </select>

      <div className="dd-field-label">Штрихкод EAN-13 (необязательно)</div>
      <input className="dd-input dd-num" type="text" inputMode="numeric" placeholder="напр. 4680036912345"
        value={ean} onChange={e => setEan(e.target.value.replace(/\D/g, '').slice(0, 13))} />
      {!eanOk && <div className="text-xs mt-1" style={{ color: 'var(--warn)' }}>штрихкод — 12–13 цифр</div>}

      {suspicious && <div className="dd-card p-3 mt-3 text-xs" style={{ color: 'var(--warn)' }}>⚠️ Калории не сходятся с БЖУ (расхождение &gt;25%). Проверь цифры.</div>}
      <div className="flex gap-2 mt-4">
        {suspicious
          ? <>
            <button className="dd-action" onClick={() => { onClose(); reset(); }}>Не сохранять</button>
            <button className="dd-action strong" onClick={save}>Сохранить как есть</button>
          </>
          : <button className="dd-action strong" onClick={save}>Сохранить</button>}
      </div>
    </Sheet>
  );
}

function NumCell({ label, v, set }: { label: string; v: string; set: (s: string) => void }) {
  return (
    <div className="flex-1 min-w-0">
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

  const filtered = (foods ?? []).filter(f => !pickQ || f.name.toLowerCase().includes(pickQ.toLowerCase())).slice(0, 40);

  return (
    <Sheet open={open} onClose={onClose} title="Новый рецепт" note="Ингредиенты с граммовками + выход готового веса — КБЖУ посчитаются сами.">
      <input className="dd-input" placeholder="Название (напр. Сырники)" value={name} onChange={e => setName(e.target.value)} />
      <div className="dd-field-label">Ингредиенты</div>
      {items.map((it, i) => {
        const fd = picked[i];
        return (
          <div key={it.foodId} className="dd-item">
            <div className="flex-1 min-w-0">
              <div className="nm truncate">{fd?.name}</div>
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
          Весь рецепт: <b style={{ color: 'var(--tx)' }} className="dd-num">{fmt(totalKcal)} ккал</b> ·
          на 100 г: <b style={{ color: 'var(--tx)' }} className="dd-num">{fmt(totalKcal / parseFloat(yieldG) * 100)} ккал</b>
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
            <div className="flex-1 min-w-0">
              <div className="nm truncate">{f.name}</div>
              <div className="sub">{f.category} · {fmt(f.kcalPer100g)} ккал/100 г</div>
            </div>
          </button>
        ))}
      </Sheet>
    </Sheet>
  );
}
