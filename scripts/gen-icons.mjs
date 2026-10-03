// Генерация PNG-иконок из design/icon*.svg (sharp)
// Запуск: npm run icons
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const jobs = [
  { svg: 'design/icon.svg', size: 512, out: 'public/icons/icon-512.png' },
  { svg: 'design/icon.svg', size: 192, out: 'public/icons/icon-192.png' },
  { svg: 'design/icon-maskable.svg', size: 512, out: 'public/icons/icon-maskable-512.png' },
  { svg: 'design/icon.svg', size: 180, out: 'public/icons/apple-touch-icon.png' },
];

for (const j of jobs) {
  const svg = await readFile(j.svg);
  await sharp(svg, { density: 384 })
    .resize(j.size, j.size)
    .png()
    .toFile(j.out);
  console.log('ok', j.out);
}
