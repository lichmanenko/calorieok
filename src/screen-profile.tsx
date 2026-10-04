// Профиль: биометрия, формула, цель, темп + стартовая норма КБЖУ
import React, { useEffect, useState } from 'react';
import { getProfile, saveProfile, calcNorma, track } from './store';
import type { Profile } from './db';
import { Segmented } from './ui';

const DEFAULT: Profile = {
  userId: 'local', gender: 'male', age: 35, heightCm: 175,
  formula: 'mifflin', activity: 'light', goal: 'none', paceKgPerWeek: 0.5, updatedAt: 0,
};

export function ProfileScreen() {
  const [pr, setPr] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { getProfile().then(p => setPr(p ?? DEFAULT)); }, []);
  if (!pr) return <div className="min-h-screen" />;

  const norma = calcNorma(pr);
  const set = (patch: Partial<Profile>) => { setPr({ ...pr, ...patch }); setSaved(false); };

  async function save() {
    await saveProfile(pr!);
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
          <Num label="возраст" v={pr.age} set={v => set({ age: v })} />
          <Num label="рост, см" v={pr.heightCm} set={v => set({ heightCm: v })} />
          {pr.goalWeightKg !== undefined && <Num label="цель, кг" v={pr.goalWeightKg} set={v => set({ goalWeightKg: v })} />}
        </div>
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
            <Num label="расход (TDEE), ккал/день" v={pr.manualTdee ?? 2400} set={v => set({ manualTdee: v })} />
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
            <Num label="" v={pr.goalWeightKg ?? 75} set={v => set({ goalWeightKg: v })} />
          </>
        )}
      </div>

      {norma && (
        <div className="dd-card p-5 text-center mb-4">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--mut)' }}>Дневная норма</div>
          <div className="text-3xl font-extrabold dd-num mt-1" style={{ color: 'var(--acc-fg)' }}>{norma.kcal}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--mut)' }}>ккал · Б {norma.p} г · Ж {norma.f} г · У {norma.c} г</div>
          <div className="text-[10px] mt-2" style={{ color: 'var(--mut)' }}>
            стартовая норма от {pr.formula === 'manual' ? 'ручного расхода' : 'формулы'}; через 2 недели начнёт подстраиваться под факт (M1)
          </div>
        </div>
      )}

      <button className="dd-action strong" onClick={save}>{saved ? '✓ Сохранено' : 'Сохранить'}</button>
    </div>
  );
}

function Num({ label, v, set }: { label: string; v: number; set: (n: number) => void }) {
  const [s, setS] = React.useState(String(v));
  React.useEffect(() => setS(String(v)), [v]);
  return (
    <div className="flex-1">
      {label && <div className="dd-field-label" style={{ marginTop: 0 }}>{label}</div>}
      <input
        className="dd-input dd-num" type="number" inputMode="numeric" value={s}
        onChange={e => { setS(e.target.value); const n = parseFloat(e.target.value); if (!Number.isNaN(n)) set(n); }}
      />
    </div>
  );
}
