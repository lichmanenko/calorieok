// UI-кит Deep Dish: стекло, кольца, листы, сегменты, тумблеры — в дизайн-языке проекта
import React, { useEffect, useRef, useState } from 'react';

export const cx = (...a: Array<string | false | undefined>) => a.filter(Boolean).join(' ');

export function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx('dd-card', className)}>{children}</div>
  );
}

export function Ring({ percent, size = 96, stroke = 10, children }: { percent: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  const id = useRef(`ring${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <div className="dd-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--acc)" />
            <stop offset="1" stopColor="var(--acc2)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tr)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${(circ * p) / 100} ${circ}`}
        />
      </svg>
      <div className="dd-ring-val">{children}</div>
    </div>
  );
}

export function Sheet({ open, onClose, children, title, note }: {
  open: boolean; onClose: () => void; children: React.ReactNode; title?: string; note?: string;
}) {
  return (
    <>
      <div className={cx('dd-sheet-bg', open && 'show')} onClick={onClose} />
      <div className={cx('dd-sheet', open && 'show')}>
        <div className="dd-grab" />
        {title && <h3 className="dd-sheet-title">{title}</h3>}
        {note && <div className="dd-sheet-note">{note}</div>}
        {children}
      </div>
    </>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="dd-seg">
      {options.map(o => (
        <button key={o.value} className={cx(o.value === value && 'on')} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={cx('dd-sw', on && 'on')} onClick={() => onChange(!on)} aria-pressed={on} />;
}

export function ActionButton({ children, onClick, type }: { children: React.ReactNode; onClick?: () => void; type?: 'submit' }) {
  return <button type={type} className="dd-action" onClick={onClick}>{children}</button>;
}

export function Modal({ open, onClose, children }: { open: boolean; onClose?: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="dd-modal-bg" onClick={onClose}>
      <div className="dd-modal" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function Confirm({ open, text, onOk, onCancel, okLabel = 'Да', cancelLabel = 'Отмена' }: {
  open: boolean; text: string; onOk: () => void; onCancel: () => void; okLabel?: string; cancelLabel?: string;
}) {
  return (
    <Modal open={open} onClose={onCancel}>
      <p className="dd-modal-text">{text}</p>
      <div className="dd-modal-row">
        <button className="dd-action" onClick={onCancel}>{cancelLabel}</button>
        <button className="dd-action strong" onClick={onOk}>{okLabel}</button>
      </div>
    </Modal>
  );
}

/** Сворачиваемая секция (состояние — снаружи, чтобы запоминалось). */
export function Collapse({ title, open, onToggle, children, right }: {
  title: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <div className="dd-collapse">
      <button className="dd-collapse-head" onClick={onToggle}>
        <span className="dd-collapse-title">{title}</span>
        <span className="dd-collapse-right">{right}<span className={cx('dd-chev', open && 'up')}>⌄</span></span>
      </button>
      {open && children}
    </div>
  );
}

export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY }; },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x; const dy = t.clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 50) (dx < 0 ? onLeft : onRight)();
    },
  };
}

export function Slide({ dir, children }: { dir: 0 | -1 | 1; children: React.ReactNode }) {
  const [cls, setCls] = useState('');
  useEffect(() => {
    if (dir === 0) return;
    setCls(dir < 0 ? 'slide-from-r' : 'slide-from-l');
    const t = setTimeout(() => setCls(''), 260);
    return () => clearTimeout(t);
  }, [dir]);
  return <div className={cx('dd-slide', cls)}>{children}</div>;
}
