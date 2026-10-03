import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base = путь GitHub Pages (репо deep-dish)
export default defineConfig({
  base: '/deep-dish/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Deep Dish — дневник питания',
        short_name: 'Deep Dish',
        description: 'Домашний трекер питания и веса. Работает офлайн.',
        lang: 'ru',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        background_color: '#ffffff',
        theme_color: '#5F7A45', // placeholder — финализируется после выбора гаммы
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        globIgnores: ['design/**'], // витрина палитр — не часть офлайн-приложения
      },
    }),
  ],
});
