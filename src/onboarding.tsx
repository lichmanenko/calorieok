// Онбординг: знакомство → как вносить → профиль (опционально) → установка на «Домой»
import React, { useState } from 'react';
import { saveProfile, getProfile, calcNorma, track } from './store';
import type { Profile } from './db';
import { Segmented } from './ui';

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const next = () => { setStep(s => Math.min(s + 1, 3)); track('onboarding_step', { step }); };

  return (
    <div className="min-h-screen flex flex-col px-6 pt-10 pb-8">
      <div className="flex gap-2 justify-center mb-8">
        {[0, 1, 2, 3].map(i => <span key={i} className="dd-dot" style={{ background: i === step ? 'var(--acc)' : 'var(--tr)' }} />)}
      </div>

      {step === 0 && <Step emoji="🍽" title="Добро пожаловать в Deep Dish" text="Дневник питания и веса для всей семьи. Главный принцип — запись еды за пару секунд, всё остальное приложение берёт на себя." />}
      {step === 1 && <Step emoji="⚡️" title="Как вносить еду" text="Внизу — слоты приёмов пищи. «+» на карточке добавляет с последней порцией, вес поправится в той же карточке. Частое лежит в «Недавних», доверенное — отмечай ⭐." />}
      {step === 2 && <GoalStep onDone={next} skip={next} />}
      {step === 3 && <InstallStep onDone={onDone} />}

      {step < 2 && (
        <div className="mt-auto flex gap-2">
          <button className="dd-action" onClick={onDone}>Пропустить</button>
          <button className="dd-action strong" onClick={next}>Далее</button>
        </div>
      )}
    </div>
  );
}

function Step({ emoji, title, text }: { emoji: string; title: string; text: string }) {
  return (
    <div className="text-center pt-10">
      <div className="text-[56px] mb-6">{emoji}</div>
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--mut)' }}>{text}</p>
    </div>
  );
}

function GoalStep({ onDone, skip }: { onDone: () => void; skip: () => void }) {
  const [pr, setPr] = useState<Profile | null>(null);
  React.useEffect(() => { getProfile().then(p => setPr(p ?? {
    userId: 'local', gender: 'male', age: 35, heightCm: 175, formula: 'mifflin',
    activity: 'light', goal: 'none', paceKgPerWeek: 0.5, updatedAt: 0,
  })); }, []);
  if (!pr) return null;
  const set = (patch: Partial<Profile>) => setPr({ ...pr, ...patch });
  const norma = calcNorma(pr);

  return (
    <div>
      <div className="text-center mb-4">
        <div className="text-[44px]">🎯</div>
        <h2 className="text-[22px] font-bold">Цель — по желанию</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--mut)' }}>Можно просто вести дневник. А с целью появится динамика и норма.</p>
      </div>
      <div className="dd-card p-4">
        <Segmented value={pr.goal} onChange={v => set({ goal: v })} options={[
          { value: 'none', label: 'без цели' }, { value: 'lose', label: 'худеть' }, { value: 'maintain', label: 'держать' }, { value: 'gain', label: 'набирать' },
        ]} />
        {pr.goal !== 'none' && <>
          <div className="dd-field-label">Темп</div>
          <Segmented value={String(pr.paceKgPerWeek)} onChange={v => set({ paceKgPerWeek: parseFloat(v) })} options={[
            { value: '0.25', label: '0,25 кг/нед' }, { value: '0.5', label: '0,5' }, { value: '1', label: '1,0' },
          ]} />
        </>}
        <div className="dd-input-row mt-3">
          <div className="flex-1"><div className="dd-field-label" style={{ marginTop: 0 }}>Возраст</div>
            <input className="dd-input dd-num" type="number" inputMode="numeric" value={pr.age} onChange={e => set({ age: parseInt(e.target.value) || 0 })} /></div>
          <div className="flex-1"><div className="dd-field-label" style={{ marginTop: 0 }}>Рост, см</div>
            <input className="dd-input dd-num" type="number" inputMode="numeric" value={pr.heightCm} onChange={e => set({ heightCm: parseInt(e.target.value) || 0 })} /></div>
          <div className="flex-1"><div className="dd-field-label" style={{ marginTop: 0 }}>Цель, кг</div>
            <input className="dd-input dd-num" type="number" inputMode="decimal" value={pr.goalWeightKg ?? ''} onChange={e => set({ goalWeightKg: parseFloat(e.target.value) || undefined })} /></div>
        </div>
        {norma && <div className="text-center text-xs mt-3" style={{ color: 'var(--mut)' }}>
          норма: <b className="dd-num" style={{ color: 'var(--acc-fg)' }}>{norma.kcal} ккал</b> в день
        </div>}
      </div>
      <div className="flex gap-2 mt-4">
        <button className="dd-action" onClick={skip}>Позже</button>
        <button className="dd-action strong" onClick={async () => { await saveProfile(pr); track('profile_saved', { from: 'onboarding' }); onDone(); }}>Готово</button>
      </div>
    </div>
  );
}

function InstallStep({ onDone }: { onDone: () => void }) {
  return (
    <div className="text-center">
      <div className="text-[56px] mb-6">📲</div>
      <h2 className="text-2xl font-bold tracking-tight">Добавь на экран «Домой»</h2>
      <div className="dd-card p-4 mt-5 text-left text-[13px] leading-relaxed" style={{ color: 'var(--mut)' }}>
        <div className="mb-2"><b style={{ color: 'var(--tx)' }}>1.</b> Нажми «Поделиться» <span className="dd-num">(квадрат со стрелкой)</span> внизу Safari</div>
        <div className="mb-2"><b style={{ color: 'var(--tx)' }}>2.</b> «На экран Домой» → «Добавить»</div>
        <div><b style={{ color: 'var(--tx)' }}>3.</b> Готово — приложение работает без интернета, иконка как у «родных»</div>
      </div>
      <p className="text-xs mt-4" style={{ color: 'var(--mut)' }}>Установка также защищает данные от чистки кэша Safari.</p>
      <button className="dd-action strong mt-6" onClick={onDone}>Начать пользоваться</button>
    </div>
  );
}
