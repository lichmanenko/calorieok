// Настройки: гамма, тема, отображение времени, времена слотов, онбординг, экспорт/импорт, сброс
import React, { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { Slot } from './db';
import { PALETTES, type DeviceSettings, todayISO, fromISO, MONTHS } from './lib';
import { exportJSON, exportCSV, download, wipeAll, track, importJSONText, parseMfpCsv, applyMfpImport, type MfpPreview } from './store';
import { Segmented, Confirm, Modal, Toggle } from './ui';

export function SettingsScreen({ settings, setSettings, onRestartOnboarding }: {
  settings: DeviceSettings; setSettings: (s: DeviceSettings) => void; onRestartOnboarding: () => void;
}) {
  const [confirmWipe, setConfirmWipe] = useState(false);
  const slots = useLiveQuery(async () =>
    (await db.slots.filter(s => !s.deletedAt).toArray()).sort((a, b) => a.sortOrder - b.sortOrder), [], [] as Slot[]);

  // импорт: JSON-бэкап и CSV из MyFitnessPal
  const fileJson = useRef<HTMLInputElement>(null);
  const fileMfp = useRef<HTMLInputElement>(null);
  const [mfpPrev, setMfpPrev] = useState<MfpPreview | null>(null);
  const [mfpReplace, setMfpReplace] = useState(true);
  const [mfpBusy, setMfpBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState(false);

  const ruDate = (iso: string) => { const d = fromISO(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

  async function onJsonFile(f: File) {
    try {
      const counts = await importJSONText(await f.text());
      const parts = Object.entries(counts).map(([k, v]) => `${v} ${k === 'entries' ? 'записей' : k === 'foods' ? 'продуктов' : k}`);
      setImportErr(false);
      setImportMsg(`Бэкап восстановлен: ${parts.join(', ') || 'файл пуст'}.`);
    } catch (e) { setImportErr(true); setImportMsg(`Импорт не удался: ${(e as Error).message}.`); }
  }
  async function onMfpFile(f: File) {
    try { setMfpPrev(await parseMfpCsv(await f.text())); }
    catch (e) { setImportErr(true); setImportMsg(`Файл не распознан: ${(e as Error).message}.`); }
  }
  async function doMfpApply() {
    if (!mfpPrev || mfpBusy) return;
    setMfpBusy(true);
    try {
      const r = await applyMfpImport(mfpPrev, mfpReplace);
      setMfpPrev(null); setImportErr(false);
      setImportMsg(`Из MFP импортировано: ${r.entries} записей, ${r.foods} новых продуктов.`);
    } catch (e) { setMfpPrev(null); setImportErr(true); setImportMsg(`Импорт не удался: ${(e as Error).message}.`); }
    setMfpBusy(false);
  }

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
        <Row label="Импорт JSON (восстановление)" hint="из файла бэкапа"
          action={<button className="dd-link-btn" onClick={() => fileJson.current?.click()}>→</button>} />
        <Row label="Импорт из MFP (CSV)" hint="история из выгрузки MyFitnessPal"
          action={<button className="dd-link-btn" onClick={() => fileMfp.current?.click()}>→</button>} />
        <input ref={fileJson} type="file" accept=".json,application/json" hidden
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onJsonFile(f); }} />
        <input ref={fileMfp} type="file" accept=".csv,text/csv,text/plain" hidden
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onMfpFile(f); }} />
        <Row label="Пройти онбординг заново" hint="как пользоваться + установка"
          action={<button className="dd-link-btn" onClick={onRestartOnboarding}>→</button>} />
        <Row label="Удалить все данные" hint="дневник, каталог, профиль — без возврата"
          action={<button className="dd-link-btn" style={{ color: 'var(--warn)' }} onClick={() => setConfirmWipe(true)}>→</button>} />
      </div>

      <p className="text-[10px] mt-6 text-center" style={{ color: 'var(--mut)' }}>
        Deep Dish · v{__APP_VER__} · сборка {__APP_SHA__} · работает офлайн · синхронизация в M2
      </p>

      <Modal open={!!mfpPrev} onClose={() => setMfpPrev(null)}>
        {mfpPrev && (
          <>
            <p className="dd-modal-text">
              Выгрузка MFP: <b>{mfpPrev.rows.length} записей</b> за {ruDate(mfpPrev.from)} — {ruDate(mfpPrev.to)}.
              Продукты: {mfpPrev.newFoods} новых, {mfpPrev.reusedFoods} уже есть в каталоге.
              Граммовки в выгрузке нет — каждая строка сохранится порцией с её КБЖУ.
            </p>
            <div className="flex items-center justify-between py-2">
              <div className="text-sm">Заменить записи Deep Dish за эти даты</div>
              <Toggle on={mfpReplace} onChange={setMfpReplace} />
            </div>
            <div className="dd-modal-row">
              <button className="dd-action strong" disabled={mfpBusy} onClick={doMfpApply}>
                {mfpBusy ? 'Импортирую…' : 'Импортировать'}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!importMsg} onClose={() => { if (!importErr) location.reload(); else setImportMsg(null); }}>
        <p className="dd-modal-text">{importMsg}{!importErr && ' Экран перезагрузится.'}</p>
        <div className="dd-modal-row">
          <button className="dd-action strong" onClick={() => { if (!importErr) location.reload(); else setImportMsg(null); }}>Готово</button>
        </div>
      </Modal>

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
