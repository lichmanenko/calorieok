// Профиль: биометрия (с текущим весом), формула, цель + норма с раскладкой; «Сохранить» активна только при изменениях
import { useEffect, useState } from 'react';
import { getProfile, saveProfile, calcNorma, track } from './store';
import type { Profile } from './db';
import { Segmented } from './ui';
import { fmt } from './lib';
import { NumField } from './onboarding';

const MACRO_PRESETS = [
  { key: 'balanced', pct: { p: 25, f: 30, c: 45 } },
  { key: 'mfp', pct: { p: 20, f: 30, c: 50 } },
  { key: 'protein', pct: { p: 30, f: 30, c: 40 } },
] as const;

function macroModeOf(pr: Profile): 'balanced' | 'mfp' | 'protein' | 'custom' { return pr.macroMode ?? 'balanced'; }

const DEFAULT: Profile = {
  userId: 'local', gender: 'male', age: 35, heightCm: 175,
  formula: 'mifflin', activity: 'light', goal: 'none', paceKgPerWeek: 0.5, updatedAt: 0,
};

export function ProfileScreen() {
  const [pr, setPr] = useState<Profile | null>(null);
  const [baseline, setBaseline] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { getProfile().then(p => { setPr(p ?? DEFAULT); setBaseline(JSON.stringify(p ?? DEFAULT)); }); }, []);
  if (!pr) return <div className="min-h-screen" />;

  const norma = calcNorma(pr);
  const dirty = JSON.stringify({ ...pr, updatedAt: 0 }) !== JSON.stringify({ ...JSON.parse(baseline || '{}'), updatedAt: 0 });
  const set = (patch: Partial<Profile>) => { setPr({ ...pr, ...patch }); setSaved(false); };

  async function save() {
    await saveProfile(pr!);
    setBaseline(JSON.stringify(pr!));
    setSaved(true);
    track('profile_saved', { goal: pr!.goal, formula: pr!.formula });
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-28">
      <h1 className="text-xl font-bold mb-4">Профиль и норма</h1>

      <div className="dd-card p-4 mb-4">
        <div className="dd-field-label" style={{ marginTop: 0 }}>Пол</div>
        <Segmented value={pr.gender} onChange={v => set({ gender: v })} options={[{ value: 'male', label: '♂ мужской' }, { value: 'female', label: '♀ женский' }]} />

        <div className="dd-input-row mt-2">
          <NumField label="возраст" value={pr.age} onChange={n => set({ age: n ?? 0 })} />
          <NumField label="рост, см" value={pr.heightCm} onChange={n => set({ heightCm: n ?? 0 })} />
          <NumField label="вес, кг" value={pr.weightKg} onChange={n => set({ weightKg: n })} />
        </div>
        <div className="text-[10px] mt-2" style={{ color: 'var(--mut)' }}>текущий вес — точка отсчёта нормы; лог веса и динамика — в M1</div>
      </div>

      <div className="dd-card p-4 mb-4">
        <div className="dd-field-label" style={{ marginTop: 0 }}>Активность</div>
        <Segmented value={pr.activity} onChange={v => set({ activity: v })} options={[
          { value: 'sedentary', label: 'сидячая' }, { value: 'light', label: 'лёгкая' },
          { value: 'moderate', label: 'средняя' }, { value: 'active', label: 'высокая' }, { value: 'very_active', label: 'очень высокая' },
        ]} />

        <div className="dd-field-label">Расход энергии</div>
        <Segmented value={pr.formula} onChange={v => set({ formula: v })} options={[
          { value: 'mifflin', label: 'формула (Миффлин)' }, { value: 'manual', label: 'вручную' },
        ]} />
        {pr.formula === 'manual' && (
          <div className="mt-2">
            <NumField label="расход (TDEE), ккал/день" value={pr.manualTdee} onChange={n => set({ manualTdee: n })} />
          </div>
        )}
      </div>

      <div className="dd-card p-4 mb-4">
        <div className="dd-field-label" style={{ marginTop: 0 }}>Цель</div>
        <Segmented value={pr.goal} onChange={v => set({ goal: v })} options={[
          { value: 'none', label: 'без цели' }, { value: 'lose', label: '📉 худеть' },
          { value: 'maintain', label: '⚖️ держать' }, { value: 'gain', label: '📈 набирать' },
        ]} />
        {pr.goal !== 'none' && (
          <>
            <div className="dd-field-label">Темп, кг в неделю</div>
            <Segmented value={String(pr.paceKgPerWeek)} onChange={v => set({ paceKgPerWeek: parseFloat(v) })} options={[
              { value: '0.25', label: '0,25' }, { value: '0.5', label: '0,5' }, { value: '0.75', label: '0,75' }, { value: '1', label: '1,0' },
            ]} />
            <div className="dd-field-label">Целевой вес, кг</div>
            <NumField label="" value={pr.goalWeightKg} onChange={n => set({ goalWeightKg: n })} />
          </>
        )}
      </div>

      <div className="dd-card p-4 mb-4">
        <div className="dd-field-label" style={{ marginTop: 0 }}>Распределение БЖУ</div>
        <Segmented value={macroModeOf(pr)} onChange={k => set({
          macroMode: k as 'balanced' | 'mfp' | 'protein' | 'custom',
          macroPct: k === 'custom' ? (pr.macroPct ?? { p: 30, f: 30, c: 40 }) : MACRO_PRESETS.find(x => x.key === k)!.pct,
        })} options={[
          { value: 'balanced', label: '25/30/45' }, { value: 'mfp', label: '20/30/50' },
          { value: 'protein', label: '30/30/40' }, { value: 'custom', label: 'вручную' },
        ]} />
        {macroModeOf(pr) === 'custom' && (
          <div className="dd-input-row mt-2">
            <NumField label="белки, %" value={pr.macroPct?.p} onChange={n => set({ macroPct: { ...(pr.macroPct ?? { p: 30, f: 30, c: 40 }), p: n ?? 0 } })} />
            <NumField label="жиры, %" value={pr.macroPct?.f} onChange={n => set({ macroPct: { ...(pr.macroPct ?? { p: 30, f: 30, c: 40 }), f: n ?? 0 } })} />
            <NumField label="углев., %" value={pr.macroPct?.c} onChange={n => set({ macroPct: { ...(pr.macroPct ?? { p: 30, f: 30, c: 40 }), c: n ?? 0 } })} />
          </div>
        )}
      </div>

      {norma ? (
        <div className="dd-card p-5 text-center mb-4">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--mut)' }}>Дневная норма</div>
          <div className="text-3xl font-extrabold dd-num mt-1" style={{ color: 'var(--acc-fg)' }}>{fmt(norma.kcal)}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--mut)' }}>ккал · Б {fmt(norma.p)} г · Ж {fmt(norma.f)} г · У {fmt(norma.c)} г</div>
          <div className="text-[10px] mt-2 dd-num" style={{ color: 'var(--mut)' }}>
            расход ≈ {norma.tdee}{norma.adj !== 0 ? ` → ${norma.adj > 0 ? '+' : ''}${norma.adj} по темпу` : ' · без поправки'} · не ниже {Math.round(norma.bmr * 1.1)}
          </div>
        </div>
      ) : (
        <div className="dd-card p-4 mb-4 text-center text-xs" style={{ color: 'var(--mut)' }}>
          укажи текущий вес — посчитается норма
        </div>
      )}

      <button className="dd-action strong" disabled={!dirty} onClick={save}>{saved ? '✓ Сохранено' : 'Сохранить'}</button>
    </div>
  );
}
