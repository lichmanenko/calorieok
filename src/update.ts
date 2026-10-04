// Бесшовное обновление PWA: фоновая проверка, тост с кнопкой «Обновить», проверка при выходе в сеть.
// Данные пользователя живут в IndexedDB и переживают любые обновления кода.
import { registerSW } from 'virtual:pwa-register';

let hideTimer: number | undefined;

function showToast(apply: (reload: boolean) => void) {
  if (document.getElementById('dd-update-toast')) return;
  const el = document.createElement('div');
  el.id = 'dd-update-toast';
  el.innerHTML = `
    <div class="dd-upd-card">
      <div class="dd-upd-text">🔄 Доступна новая версия</div>
      <div class="dd-upd-row">
        <button class="dd-upd-later">Позже</button>
        <button class="dd-upd-apply">Обновить</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  const close = () => { el.classList.add('hide'); window.clearTimeout(hideTimer); setTimeout(() => el.remove(), 350); };
  el.querySelector('.dd-upd-later')!.addEventListener('click', close);
  el.querySelector('.dd-upd-apply')!.addEventListener('click', () => { apply(true); });
}

const updateSW = registerSW({
  onNeedRefresh() { showToast(updateSW); },
  onOfflineReady() { /* офлайн-кэш готов — молчим */ },
});

// Вышли в сеть — тихо проверить обновление ( офлайн-пользователи получат его при первом контакте )
window.addEventListener('online', () => { void updateSW(false); });
// И раз в час при долгой открытой сессии
window.setInterval(() => { void updateSW(false); }, 60 * 60 * 1000);
