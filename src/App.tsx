import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';

// Заглушка M0 до вёрстки экранов (макеты — public/design/mockups.html).
// Уже в токенах «Графит·сталь»: градиент фона, стекло, кольцо-мотив, без рамок.
export default function App() {
  const foodCount = useLiveQuery(() => db.foods.filter((f) => !f.deletedAt).count(), []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <svg width="110" height="110" viewBox="0 0 96 96" className="-rotate-90">
        <defs>
          <linearGradient id="arcg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--acc)" />
            <stop offset="1" stopColor="var(--acc2)" />
          </linearGradient>
        </defs>
        <circle cx="48" cy="48" r="38" fill="none" stroke="var(--tr)" strokeWidth="10" />
        <circle
          cx="48"
          cy="48"
          r="38"
          fill="none"
          stroke="url(#arcg)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray="172.2 238.8"
        />
      </svg>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Deep Dish</h1>
        <p className="text-sm mt-2" style={{ color: 'var(--mut)' }}>
          M0 в разработке · продуктов в каталоге: {foodCount ?? '…'}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--mut)' }}>
          макеты экранов: lichmanenko.github.io/deep-dish/design/mockups.html
        </p>
      </div>
    </div>
  );
}
