// Настройки: гамма, тема, отображение времени, времена слотов, онбординг, экспорт/импорт, сброс
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { Slot } from './db';
import { PALETTES, type DeviceSettings, todayISO } from './lib';
import { exportJSON, exportCSV, download, wipeAll, track } from './store';
import { Segmented, Confirm } from './ui';

export function SettingsScreen({ settings, setSettings, onRestartOnboarding }: {
  settings: DeviceSettings; setSettings: (s: DeviceSettings) => void; onRestartOnboarding: () => void;
}) {
  const [confirmWipe, setConfirmWipe] = useState(false);
  const slots = useLiveQuery(async () =>
    (await db.slots.filter(s => !s.deletedAt).toArray()).sort((a, b) => a.sortOrder - b.sortOrder), [], [] as Slot[]);


  return (
    <div className="min-h-screen px-4 pt-6 pb-28">
      <h1 className="text-xl font-bold mb-4">Настройки</h1>

      <div className="dd-field-label" style={{ marginTop: 0 }}>Цветовая гамма</div>
      <div className="dd-card p-4">
        <div className="dd-seg">
          {PALETTES.map(p => (
            <button key={p.key} className={p.key === settings.palette ? 'on' : ''} onClick={() => { setSettings({ ...settings, palette: p.key }); track('palette_changed', { to: p.key }); }}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="dd-field-label">Тема</div>
        <Segmented value={settings.theme} onChange={v => setSettings({ ...settings, theme: v })} options={[
          { value: 'auto', label: 'авто' }, { value: 'light', label: '☀️ светлая' }, { value: 'dark', label: '🌙 тёмная' },
        ]} />
        <div className="dd-field-label">Показывать время у записей</div>
        <Segmented value={settings.showTime} onChange={v => setSettings({ ...settings, showTime: v })} options={[
          { value: 'snacks', label: 'только перекусы' }, { value: 'all', label: 'все записи' },
        ]} />
      </div>

      <div className="dd-field-label">Времена приёмов пищи (подставляются при вводе)</div>
      <div className="dd-card px-4 py-1">
        {(slots ?? []).map(s => (
          <div key={s.id} className="flex justify-between items-center py-3">
            <div className="text-sm">{s.emoji} {s.name}</div>
            {s.defaultTime
              ? <input type="time" className="dd-input dd-num" style={{ width: 110, padding: '8px 10px' }} value={s.defaultTime}
                  onChange={e => db.slots.update(s.id, { defaultTime: e.target.value, updatedAt: Date.now() })} />
              : <span className="text-xs" style={{ color: 'var(--mut)' }}>текущее время</span>}
          </div>
        ))}
      </div>

      <div className="dd-field-label">Данные</div>
      <div className="dd-card px-4 py-1">
        <Row label="Экспорт JSON (полный бэкап)" hint="все данные одной кнопкой"
          action={<button className="dd-link-btn" onClick={() => exportJSON().then(b => download(b, `deepdish-${todayISO()}.json`))}>→</button>} />
        <Row label="Экспорт CSV (еда)" hint="для Excel"
          action={<button className="dd-link-btn" onClick={() => exportCSV().then(b => download(b, `deepdish-eda-${todayISO()}.csv`))}>→</button>} />
        <Row label="Пройти онбординг заново" hint="как пользоваться + установка"
          action={<button className="dd-link-btn" onClick={onRestartOnboarding}>→</button>} />
        <Row label="Удалить все данные" hint="дневник, каталог, профиль — без возврата"
          action={<button className="dd-link-btn" style={{ color: 'var(--warn)' }} onClick={() => setConfirmWipe(true)}>→</button>} />
      </div>

      <p className="text-[10px] mt-6 text-center" style={{ color: 'var(--mut)' }}>
        Deep Dish · v{__APP_VER__} · сборка {__APP_SHA__} · работает офлайн · синхронизация в M2
      </p>

      <Confirm open={confirmWipe} text="Точно удалить ВСЁ? Дневник, каталог и профиль исчезнут безвозвратно."
        okLabel="Удалить всё" onCancel={() => setConfirmWipe(false)}
        onOk={async () => { setConfirmWipe(false); await wipeAll(); location.reload(); }} />
    </div>
  );
}

function Row({ label, hint, action }: { label: string; hint?: string; action: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[11px]" style={{ color: 'var(--mut)' }}>{hint}</div>}
      </div>
      {action}
    </div>
  );
}
