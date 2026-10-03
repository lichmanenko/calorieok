import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Тема: авто по системе (ручной переключатель — в настройках, M0-вёрстка)
const mq = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => document.documentElement.classList.toggle('dark', mq.matches);
applyTheme();
mq.addEventListener('change', applyTheme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
