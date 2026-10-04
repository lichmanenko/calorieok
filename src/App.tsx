// Каркас: фон-радиальные пресеты с кросс-фейдом, таб-бар, онбординг, экраны
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadSettings, saveSettings, applyTheme, RADIALS, todayISO, type DeviceSettings } from './lib';
import { track } from './store';
import { Onboarding } from './onboarding';
import { TodayScreen } from './screen-today';
import { AddScreen } from './screen-add';
import { HistoryScreen } from './screen-history';
import { ProfileScreen } from './screen-profile';
import { SettingsScreen } from './screen-settings';
import type { Slot } from './db';

type Tab = 'today' | 'history' | 'profile';

export default function App() {
  const [settings, setSettingsState] = useState<DeviceSettings>(() => loadSettings());
  const setSettings = (s: DeviceSettings) => { saveSettings(s); setSettingsState(s); };

  const [tab, setTab] = useState<Tab>('today');
  const [date, setDate] = useState(todayISO());
  const [addOpen, setAddOpen] = useState(false);
  const [addSlot, setAddSlot] = useState<Slot | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const dark = useMemo(() => {
    if (settings.theme !== 'auto') return settings.theme === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [settings.theme]);

  useEffect(() => { applyTheme(settings.palette, dark); }, [settings.palette, dark]);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => { if (settings.theme === 'auto') applyTheme(settings.palette, mq.matches); };
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [settings.palette, settings.theme]);

  useEffect(() => { track('app_open', { online: navigator.onLine, cold: true }); }, []);

  // Кросс-фейд фоновых радиальных пресетов при смене экрана
  const screen = addOpen ? 'add' : onboarding ? 'onboarding' : showSettings ? 'settings' : tab;
  const bgA = useRef<HTMLDivElement>(null);
  const bgB = useRef<HTMLDivElement>(null);
  const useA = useRef(true);
  useEffect(() => {
    const spots = RADIALS[screen] ?? RADIALS.today;
    const next = useA.current ? bgB.current : bgA.current;
    const cur = useA.current ? bgA.current : bgB.current;
    if (!next || !cur) return;
    spots.forEach((s, i) => {
      next.style.setProperty(`--r${i + 1}x`, s.x);
      next.style.setProperty(`--r${i + 1}y`, s.y);
      next.style.setProperty(`--r${i + 1}s`, s.size);
    });
    next.style.opacity = '1'; cur.style.opacity = '0';
    useA.current = !useA.current;
  }, [screen]);

  if (!settings.onboarded || onboarding) {
    return (
      <>
        <div ref={bgA} className="dd-bg" />
        <div ref={bgB} className="dd-bg" style={{ opacity: 0 }} />
        <Onboarding onDone={() => { setSettings({ ...settings, onboarded: true }); setOnboarding(false); track('onboarding_done'); }} />
      </>
    );
  }

  return (
    <>
      <div ref={bgA} className="dd-bg" />
      <div ref={bgB} className="dd-bg" style={{ opacity: 0 }} />

      {addOpen
        ? <AddScreen date={date} slot={addSlot} onDone={() => setAddOpen(false)} />
        : showSettings
          ? <SettingsScreen settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)}
              onRestartOnboarding={() => { setShowSettings(false); setOnboarding(true); }} />
          : <>
            {tab === 'today' && (
              <TodayScreen
                date={date} setDate={setDate} showTime={settings.showTime}
                onAdd={slot => { setAddSlot(slot); setAddOpen(true); }}
              />
            )}
            {tab === 'history' && <HistoryScreen onPickDate={iso => { setDate(iso); setTab('today'); }} />}
            {tab === 'profile' && <ProfileScreen />}
          </>}

      <nav className="dd-tabbar">
        <TabBtn on={tab === 'today' && !addOpen} icon="◍" label="Сегодня" onClick={() => { setAddOpen(false); setShowSettings(false); setTab('today'); }} />
        <TabBtn on={tab === 'history'} icon="◫" label="История" onClick={() => { setAddOpen(false); setShowSettings(false); setTab('history'); }} />
        <TabBtn on={tab === 'profile'} icon="◔" label="Профиль" onClick={() => { setAddOpen(false); setShowSettings(false); setTab('profile'); }} />
        <TabBtn on={showSettings} icon="⚙︎" label="Ещё" onClick={() => { setAddOpen(false); setShowSettings(true); }} />
      </nav>
    </>
  );
}

function TabBtn({ on, icon, label, onClick }: { on: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button className={`dd-tab${on ? ' on' : ''}`} onClick={onClick}>
      <span className="ti">{icon}</span>{label}
    </button>
  );
}
