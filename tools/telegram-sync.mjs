#!/usr/bin/env node
/* Забирает из Telegram оценки, отзывы и реакции и пишет data/ratings.json.
   Запускается GitHub Action по расписанию (см. .github/workflows/telegram.yml), сервер не нужен.

   Как это устроено:
   - сайт открывает бота ссылкой t.me/<bot>?start=r_<игра>_<звёзды>, Telegram шлёт боту «/start r_palitra_5»;
   - следующее обычное сообщение того же человека в течение двух суток — его отзыв;
   - реакции на посты игр в канале (если канал есть) идут в счётчик лайков;
   - getUpdates хранит обновления сутки, поэтому запуск раз в 10–60 минут ничего не теряет.

   Переменные: TG_BOT_TOKEN (секрет), TG_SALT (секрет, любая строка — солит id людей),
   TG_ADMIN_ID (необязательно — id Паши, ему уходят новые отзывы и работает /hide <номер>). */
import fs from 'node:fs';
import crypto from 'node:crypto';

const TOKEN = process.env.TG_BOT_TOKEN;
const SALT = process.env.TG_SALT || 'betamodern';
const ADMIN = process.env.TG_ADMIN_ID ? Number(process.env.TG_ADMIN_ID) : null;
if (!TOKEN) { console.error('Нет TG_BOT_TOKEN'); process.exit(1); }

const read = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const api = async (method, body = {}) => {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) console.warn(method, j.description);
  return j.result;
};
const hash = id => crypto.createHash('sha256').update(SALT + ':' + id).digest('hex').slice(0, 16);

const catalog = read('games.json', { games: [], shorts: [] });
const items = [...catalog.games, ...(catalog.shorts || [])];
const byKey = new Map(items.map(g => [g.id.replace(/-/g, '_'), g]));
const byPost = new Map(items.filter(g => g.tg?.post).map(g => [g.tg.post.split('/')[1], g.id]));

// state.json хранит сырые данные: голоса по людям (хешам), ожидания отзыва, реакции. В репозитории нет ни имён, ни id.
const STATE = 'data/tg-state.json';
const st = read(STATE, { offset: 0, votes: {}, pending: {}, reviews: [], likes: {}, seq: 0 });

const updates = (await api('getUpdates', { offset: st.offset, timeout: 0, allowed_updates: ['message', 'message_reaction_count'] })) || [];
const replies = [];
for (const u of updates) {
  st.offset = u.update_id + 1;

  if (u.message_reaction_count) {
    const m = u.message_reaction_count, id = byPost.get(String(m.message_id));
    if (id) st.likes[id] = m.reactions.reduce((a, r) => a + r.total_count, 0);
    continue;
  }
  const m = u.message;
  if (!m?.text || m.chat.type !== 'private') continue;
  const who = hash(m.from.id), text = m.text.trim();

  if (ADMIN && m.from.id === ADMIN && /^\/hide\s+\d+/.test(text)) {
    const n = Number(text.split(/\s+/)[1]);
    st.reviews = st.reviews.filter(r => r.n !== n);
    replies.push([m.chat.id, `Отзыв №${n} скрыт.`]);
    continue;
  }
  const start = text.match(/^\/start\s+r_([a-z0-9_]+)_([1-5])$/i);
  if (start) {
    const g = byKey.get(start[1].toLowerCase());
    if (!g) { replies.push([m.chat.id, 'Не нашёл такую игру. Открой витрину и нажми «Оценить» ещё раз.']); continue; }
    const stars = Number(start[2]);
    (st.votes[g.id] ||= {})[who] = stars; // один человек — один голос, последний перезаписывает
    st.pending[who] = { game: g.id, stars, ts: m.date };
    replies.push([m.chat.id, `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} для «${g.title}» засчитано. Напиши одним сообщением, что понравилось или что сломалось — это появится на витрине.`]);
    continue;
  }
  if (text.startsWith('/')) { replies.push([m.chat.id, 'Привет! Чтобы оценить игру, открой её на витрине Betamodern Games и нажми «Оценить».']); continue; }

  const p = st.pending[who];
  if (p && m.date - p.ts < 2 * 86400) {
    delete st.pending[who];
    const n = ++st.seq;
    st.reviews.unshift({ n, game: p.game, stars: p.stars, author: (m.from.first_name || 'Игрок').slice(0, 32), text: text.slice(0, 600), date: new Date(m.date * 1000).toISOString().slice(0, 10) });
    replies.push([m.chat.id, 'Спасибо! Отзыв появится на витрине в течение часа.']);
    if (ADMIN) replies.push([ADMIN, `Новый отзыв №${n} — ${p.game}, ${p.stars}★:\n${text.slice(0, 600)}\n\nСкрыть: /hide ${n}`]);
  } else {
    replies.push([m.chat.id, 'Чтобы оставить отзыв, сначала поставь звёзды: кнопка «Оценить» на странице игры.']);
  }
}
// протухшие ожидания отзыва
const now = Date.now() / 1000;
for (const [k, p] of Object.entries(st.pending)) if (now - p.ts > 2 * 86400) delete st.pending[k];

for (const [chat_id, text] of replies) await api('sendMessage', { chat_id, text });

// публичный файл для сайта: только суммы и тексты
const out = { updated: new Date().toISOString(), source: 'Пишет tools/telegram-sync.mjs. Руками не править.', games: {} };
for (const g of items) {
  const v = Object.values(st.votes[g.id] || {});
  const votes = [1, 2, 3, 4, 5].map(k => v.filter(x => x === k).length);
  const reviews = st.reviews.filter(r => r.game === g.id).slice(0, 20).map(({ author, text, date, stars }) => ({ author, text, date, stars, link: null }));
  const likes = st.likes[g.id] || 0;
  if (v.length || reviews.length || likes) out.games[g.id] = { votes, likes, reviews };
}
write(STATE, st);
write('data/ratings.json', out);
console.log(`updates: ${updates.length}, replies: ${replies.length}, games with data: ${Object.keys(out.games).length}`);
