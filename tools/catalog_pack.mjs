#!/usr/bin/env node
// Каталог-пак: из экспорта Deep Dish собирает файл переноса каталога на другое устройство
// (второй пользователь семьи). Включает свои продукты (без служебных hidden) и рецепты —
// с их id и звёздами; дневник, вес, профиль и снапшоты норм НЕ включаются.
//
//   node tools/catalog_pack.mjs <deepdish-export.json> [-o pack.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const args = argv.slice(2);
const outIdx = args.indexOf('-o');
const outFile = outIdx >= 0 ? args.splice(outIdx, 2)[1] : null;
const [srcPath] = args;
if (!srcPath) { console.error('node tools/catalog_pack.mjs <deepdish-export.json> [-o pack.json]'); exit(1); }

const d = JSON.parse(readFileSync(srcPath, 'utf-8'));
if (d?.app !== 'deep-dish') throw new Error('это не бэкап Deep Dish');

const foods = (d.foods ?? []).filter(f => !f.deletedAt && !f.hidden && f.source !== 'system');
const recipes = (d.recipes ?? []).filter(r => !r.deletedAt);
const pack = {
  app: 'deep-dish', version: 1, exportedAt: new Date().toISOString(),
  foods, recipes,
  savedMeals: [], slots: [], entries: [], weightLogs: [], profiles: [],
};
const out = outFile ?? 'deepdish-catalog-pack.json';
writeFileSync(out, JSON.stringify(pack, null, 1), 'utf-8');
console.log(`Каталог-пак: ${foods.length} продуктов (своих), ${recipes.length} рецептов → ${out}`);
console.log('На новом устройстве: Настройки → Данные → Импорт JSON → выбрать этот файл.');
