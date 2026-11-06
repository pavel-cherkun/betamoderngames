/* Betamodern Games — витрина. Данные: games.json (игры и shorts) и data/ratings.json (оценки, лайки, отзывы из Telegram). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const view = $('#view');
  const params = new URLSearchParams(location.search);
  const TG = window.Telegram?.WebApp;
  const inTG = !!TG?.initData;

  const PLATFORM = { phone: 'Телефон', desktop: 'Компьютер', both: 'Телефон и компьютер' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>';
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.5 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.5 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z"/></svg>';
  const BUBBLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5Z"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>';
  const DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>';
  const UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>';

  let DATA, RATINGS = { games: {} }, GENRES = {};
  const state = { genre: 'all', platform: 'all' };
  try { Object.assign(state, JSON.parse(sessionStorage.getItem('bm-filters') || '{}')); } catch {}

  /* ---------- тема ---------- */
  const root = document.documentElement;
  const setTheme = t => { if (t) root.dataset.theme = t; else delete root.dataset.theme; };
  const isDark = () => (root.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) === 'dark';
  try { setTheme(localStorage.getItem('bm-theme')); } catch {}
  if (inTG) setTheme(TG.colorScheme);
  $('#theme').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('bm-theme', next); } catch {}
  });

  /* ---------- Telegram Mini App ---------- */
  if (inTG) {
    TG.ready(); TG.expand();
    TG.onEvent('themeChanged', () => setTheme(TG.colorScheme));
    TG.BackButton.onClick(() => { if (feed?.playing) stopPlay(); else if (history.length > 1) history.back(); else location.hash = '#/'; });
  }
  const openLink = url => {
    if (!inTG) return false;
    if (/^https:\/\/t\.me\//.test(url)) TG.openTelegramLink(url); else TG.openLink(url);
    return true;
  };
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-ext]');
    if (a && openLink(a.href)) e.preventDefault();
  });

  /* ---------- избранное: localStorage, в Mini App ещё и облако Telegram ---------- */
  let FAVS = new Set();
  try { FAVS = new Set(JSON.parse(localStorage.getItem('bm-favs') || '[]')); } catch {}
  const saveFavs = () => {
    const v = JSON.stringify([...FAVS]);
    try { localStorage.setItem('bm-favs', v); } catch {}
    if (inTG && TG.CloudStorage) TG.CloudStorage.setItem('favs', v);
  };
  if (inTG && TG.CloudStorage) TG.CloudStorage.getItem('favs', (err, v) => {
    if (err || !v) return;
    try { JSON.parse(v).forEach(x => FAVS.add(x)); paintLikes(); } catch {}
  });
  const likesOf = id => RATINGS.games?.[id]?.likes || 0;
  const likeBtn = (id, cls = '') => {
    const on = FAVS.has(id), n = likesOf(id) + (on ? 1 : 0);
    return `<button class="like ${cls}" type="button" data-like="${id}" aria-pressed="${on}" aria-label="${on ? 'Убрать из избранного' : 'В избранное'}">${HEART}<span>${n || ''}</span></button>`;
  };
  function paintLikes() {
    document.querySelectorAll('[data-like]').forEach(b => {
      const id = b.dataset.like, on = FAVS.has(id), n = likesOf(id) + (on ? 1 : 0);
      b.setAttribute('aria-pressed', on);
      b.setAttribute('aria-label', on ? 'Убрать из избранного' : 'В избранное');
      $('span', b).textContent = n || '';
    });
    const c = FAVS.size;
    document.querySelectorAll('[data-favcount]').forEach(el => el.textContent = c || '');
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-like]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const id = b.dataset.like;
    FAVS.has(id) ? FAVS.delete(id) : FAVS.add(id);
    saveFavs(); paintLikes();
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    inTG && TG.HapticFeedback?.impactOccurred('light');
  });

  /* ---------- установка на экран «Домой» (только телефон) ---------- */
  let deferredPrompt = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; document.querySelectorAll('.install').forEach(el => el.replaceWith(installCard(el.classList.contains('fixed')))); });
  addEventListener('appinstalled', () => document.querySelectorAll('.install').forEach(el => el.remove()));
  const UA = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(UA);
  const isMobile = isIOS || isAndroid || matchMedia('(pointer: coarse) and (max-width: 900px)').matches;
  const standalone = () => matchMedia('(display-mode: standalone), (display-mode: minimal-ui)').matches || navigator.standalone === true;
  const SHARE = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v9h14v-9h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const DOTS = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
  function installSteps() {
    const inApp = /Instagram|FBAN|FBAV|VKClient|Line\/|OKApp|Snapchat|TikTok|musical_ly/i.test(UA);
    if (inTG) return TG.isVersionAtLeast?.('8.0')
      ? { btn: 'tg', steps: ['Нажми кнопку ниже, Telegram сам добавит иконку на экран.'] }
      : { steps: [`Нажми ${DOTS} вверху справа и выбери «Открыть в браузере».`, 'В браузере снова открой это окно: там будет инструкция.'] };
    if (inApp) return { steps: [`Это встроенный браузер приложения, с него иконку не поставить. Нажми ${DOTS} или «…» и выбери «Открыть в браузере».`] };
    if (isIOS) {
      if (/CriOS|EdgiOS|FxiOS|YaBrowser|OPT\//.test(UA)) return { steps: [`Нажми ${SHARE} «Поделиться» в адресной строке или в меню ${DOTS}.`, 'Пролистай и выбери «На экран «Домой»».', 'Нажми «Добавить». Если пункта нет, открой витрину в Safari.'] };
      return { steps: [`Нажми ${SHARE} «Поделиться» внизу экрана (на iPad — вверху).`, 'Пролистай список и выбери «На экран «Домой»».', 'Нажми «Добавить» в правом верхнем углу.'] };
    }
    if (deferredPrompt) return { btn: 'prompt', steps: ['Нажми кнопку ниже и подтверди установку.'] };
    if (/SamsungBrowser/.test(UA)) return { steps: ['Нажми ☰ внизу справа.', 'Выбери «Добавить страницу на» → «Главный экран».'] };
    if (/YaBrowser|YaSearchBrowser/.test(UA)) return { steps: [`Нажми ${DOTS} рядом с адресной строкой.`, 'Выбери «Добавить ярлык» или «На главный экран».'] };
    if (/Firefox/.test(UA)) return { steps: [`Нажми ${DOTS} в углу.`, 'Выбери «Установить» или «Добавить на главный экран».'] };
    if (/OPR|Opera/.test(UA)) return { steps: [`Нажми ${DOTS} в углу.`, 'Выбери «Главный экран» или «Добавить в…» → «Главный экран».'] };
    return { steps: [`Нажми ${DOTS} в правом верхнем углу браузера.`, 'Выбери «Установить приложение» или «Добавить на главный экран».', 'Подтверди — иконка Betamodern появится среди приложений.'] };
  }
  function installCard(fixed = false) {
    if (!isMobile || standalone()) return document.createComment('install');
    const { btn, steps } = installSteps();
    const el = document.createElement('section');
    el.className = 'install' + (fixed ? ' fixed' : '');
    el.setAttribute('aria-labelledby', 'h-inst');
    el.innerHTML = `<img src="assets/apple-touch-icon.png" alt="" width="56" height="56">
      <div><h2 id="h-inst">Поставь на экран «Домой»</h2>
      <p class="muted">Витрина откроется как приложение: без адресной строки и даже без сети.</p>
      <ol>${steps.map(x => `<li>${x}</li>`).join('')}</ol>
      ${btn ? '<button class="btn" type="button" data-install>Установить</button>' : ''}
      ${fixed ? '' : '<button class="btn-link" type="button" data-install-hide>Не сейчас</button>'}</div>`;
    $('[data-install]', el)?.addEventListener('click', async () => {
      if (btn === 'tg') TG.addToHomeScreen();
      else if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; el.remove(); }
    });
    $('[data-install-hide]', el)?.addEventListener('click', () => { try { localStorage.setItem('bm-install-hide', Date.now()); } catch {} el.remove(); });
    return el;
  }
  const installHidden = () => { try { return Date.now() - Number(localStorage.getItem('bm-install-hide') || 0) < 14 * 864e5; } catch { return false; } };
  if (inTG) TG.onEvent?.('homeScreenAdded', () => document.querySelectorAll('.install').forEach(el => el.remove()));
  if ('serviceWorker' in navigator && location.protocol !== 'file:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  /* ---------- рейтинг ---------- */
  const scoreOf = id => {
    const v = RATINGS.games?.[id]?.votes;
    if (!v) return null;
    const n = v.reduce((a, b) => a + b, 0);
    if (!n) return null;
    return { n, avg: v.reduce((a, b, i) => a + b * (i + 1), 0) / n, votes: v };
  };
  const fmt = x => x.toFixed(1).replace('.', ',');
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };

  /* ---------- окно «Оценить и написать отзыв» ---------- */
  const sheet = $('#sheet');
  function openReview(item) {
    const bot = DATA.catalog.telegram.bot;
    const post = item.tg?.post;
    let stars = 0;
    sheet.innerHTML = `<div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="h-sheet">
      <button class="icon-btn sheet-x" type="button" aria-label="Закрыть">${CLOSE}</button>
      <h2 id="h-sheet">${esc(item.title)}</h2>
      <p class="muted">Сколько звёзд? Потом бот попросит пару слов.</p>
      <div class="pick" role="radiogroup" aria-label="Оценка">${[1, 2, 3, 4, 5].map(k => `<button type="button" role="radio" aria-checked="false" data-star="${k}" aria-label="${k} из 5">${STAR}</button>`).join('')}</div>
      <a class="btn btn-tg send" href="#" aria-disabled="true">Отправить через Telegram</a>
      ${post ? `<a class="btn btn-ghost" href="https://t.me/${post}?comment=1" data-ext>Обсуждение под постом</a>` : ''}
      ${bot ? '' : '<p class="sheet-note">Бот ещё не создан: кнопка заработает, когда в games.json появится его имя (см. ОТЗЫВЫ.md).</p>'}
    </div>`;
    sheet.hidden = false;
    const send = $('.send', sheet);
    sheet.querySelectorAll('[data-star]').forEach(b => b.onclick = () => {
      stars = +b.dataset.star;
      sheet.querySelectorAll('[data-star]').forEach(x => { x.setAttribute('aria-checked', +x.dataset.star <= stars); });
      if (bot) { send.href = `https://t.me/${bot}?start=r_${item.id.replace(/-/g, '_')}_${stars}`; send.dataset.ext = ''; send.removeAttribute('aria-disabled'); }
      inTG && TG.HapticFeedback?.selectionChanged();
    });
    send.onclick = e => { if (send.getAttribute('aria-disabled')) e.preventDefault(); else setTimeout(closeReview, 300); };
    $('.sheet-x', sheet).onclick = closeReview;
    $('[data-star="5"]', sheet).focus();
  }
  const closeReview = () => { sheet.hidden = true; sheet.innerHTML = ''; };
  sheet.addEventListener('click', e => { if (e.target === sheet) closeReview(); });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-review]');
    if (!b) return;
    const id = b.dataset.review;
    openReview(DATA.games.find(x => x.id === id) || DATA.shorts.find(x => x.id === id));
  });

  /* ---------- куски разметки ---------- */
  const echo = (inner, cls = '') => `<div class="echo ${cls}"><span class="e e3"></span><span class="e e2"></span><span class="e e1"></span><div class="face">${inner}</div></div>`;
  const icon = g => `<span class="app-icon" style="--acc:${g.accent}">${g.icon ? `<img src="${g.icon}" alt="" loading="lazy">` : esc(g.title[0])}</span>`;
  const genreNames = g => g.genres.map(id => GENRES[id]).join(', ');
  const tile = (g, i) => {
    const s = scoreOf(g.id);
    return `<article class="tile rise" style="--i:${i % 6};--acc:${g.accent}">
      <a href="#/game/${g.id}" class="tile-link">
        ${echo(`<img src="${g.cover}" alt="${esc(g.title)}: кадр из игры" loading="lazy" style="object-position:${g.focus || '50% 50%'}">${g.status !== 'live' ? '<span class="badge">В разработке</span>' : ''}`)}
        <div class="tile-info">${icon(g)}<div>
          <h3>${esc(g.title)}</h3>
          <p class="hook">${esc(g.hook)}</p>
          <p class="meta">${s ? `<span class="stars">${STAR}${fmt(s.avg)}</span>` : '<span class="muted">Нет оценок</span>'}<span class="muted">${esc(genreNames(g))}</span></p>
        </div></div>
      </a>
      ${likeBtn(g.id, 'on-media')}
    </article>`;
  };
  const shortTile = (s, i) => `<article class="tile short-tile rise" style="--i:${i % 6};--acc:${s.accent}">
      <a href="#/shorts/${s.id}" class="tile-link">
        ${echo(`<img src="${s.poster}" alt="${esc(s.title)}: кадр из игры" loading="lazy" style="object-position:50% 0%">`)}
        <div class="tile-info"><div><h3>${esc(s.title)}</h3><p class="hook">${esc(s.hook)}</p></div></div>
      </a>
      ${likeBtn(s.id, 'on-media')}
    </article>`;
  const playBtn = g => g.status === 'live' && g.url
    ? `<a class="btn" href="${g.url}" data-ext>Играть</a>`
    : `<span class="btn" aria-disabled="true">В разработке</span>`;

  /* ---------- главная ---------- */
  function home() {
    const f = DATA.games.find(g => g.id === DATA.catalog.featured) || DATA.games[0];
    const fs = scoreOf(f.id);
    const list = DATA.games.filter(g =>
      (state.genre === 'all' || g.genres.includes(state.genre)) &&
      (state.platform === 'all' || g.platform === state.platform || g.platform === 'both'));
    const count = id => DATA.games.filter(g => g.genres.includes(id)).length;
    view.innerHTML = `
    <section class="wrap hero" aria-labelledby="h-feat">
      <a href="#/game/${f.id}" class="rise" aria-label="${esc(f.title)}: подробнее">${echo(
        f.video ? `<video src="${f.video}" poster="${f.poster || f.cover}" muted loop playsinline autoplay></video>` : `<img src="${f.cover}" alt="" style="object-position:${f.focus || '50% 50%'}">`,
        'hero-media on')}</a>
      <div class="hero-txt">
        <h1 id="h-feat" class="rise" style="--i:1">${esc(f.title)}</h1>
        <p class="hook rise" style="--i:2">${esc(f.hook)} ${esc(f.description.split('. ')[0])}.</p>
        <p class="meta rise" style="--i:3">${fs ? `<span class="stars">${STAR}${fmt(fs.avg)}</span> · ` : ''}${esc(genreNames(f))} · ${PLATFORM[f.platform]}</p>
        <div class="hero-act rise" style="--i:4">${playBtn(f)}<a class="btn btn-ghost" href="#/game/${f.id}">Кадры и отзывы</a>${likeBtn(f.id, 'big')}</div>
      </div>
    </section>

    <section class="wrap shorts-shelf" aria-labelledby="h-shorts">
      <div class="shelf-head">
        <h2 id="h-shorts" class="rise">Shorts</h2>
        <p class="rise" style="--i:1">Игры на одну минуту. Листай ленту, как ролики, а понравилась — нажми «Играть».</p>
      </div>
      <div class="short-row">${DATA.shorts.map(shortTile).join('')}</div>
    </section>

    <section class="wrap shelf" id="games" aria-labelledby="h-games">
      <div class="shelf-head">
        <h2 id="h-games" class="rise">Все игры</h2>
        <p class="rise" style="--i:1">${DATA.games.length} ${plural(DATA.games.length, 'игра', 'игры', 'игр')} в вечной бете. Играй прямо в браузере, оценки и отзывы — в Telegram.</p>
      </div>
      <div class="filters" role="toolbar" aria-label="Фильтры">
        <button class="chip" data-genre="all" aria-pressed="${state.genre === 'all'}">Все</button>
        ${DATA.genres.map(x => `<button class="chip" data-genre="${x.id}" aria-pressed="${state.genre === x.id}">${x.name}<span class="n">${count(x.id)}</span></button>`).join('')}
        <span class="sep"></span>
        <div class="seg" role="group" aria-label="Где играть">
          ${[['all', 'Везде'], ['phone', 'Телефон'], ['desktop', 'Компьютер']].map(([k, v]) => `<button class="chip" data-platform="${k}" aria-pressed="${state.platform === k}">${v}</button>`).join('')}
        </div>
      </div>
      <div class="grid">${list.length ? list.map(tile).join('') : '<p class="empty">Под такой фильтр пока ничего нет. Сними один из фильтров.</p>'}</div>
    </section>

    <section class="wrap manifest" aria-labelledby="h-how">
      <div>
        <h2 id="h-how" class="rise">Оценки живут в Telegram</h2>
        <p class="lead rise" style="--i:1">Сердечко сохраняет игру в избранное. Звёзды и отзыв уходят боту в Telegram, а сюда цифры и тексты приходят сами раз в час.</p>
      </div>
      <ol class="steps">
        <li class="rise" style="--i:1"><b>Сыграй</b>Прямо здесь, без установки: игры открываются в браузере и в Telegram.</li>
        <li class="rise" style="--i:2"><b>Поставь звёзды</b>Кнопка «Оценить» откроет бота: одна кнопка — и оценка засчитана.</li>
        <li class="rise" style="--i:3"><b>Напиши, что сломалось</b>Пара слов боту или комментарий под постом игры. Автор прочитает всё.</li>
      </ol>
    </section>`;
    if (!installHidden()) $('.hero', view).after(installCard());
    view.querySelectorAll('[data-genre]').forEach(b => b.onclick = () => { state.genre = b.dataset.genre; saveFilters(); home(); });
    view.querySelectorAll('[data-platform]').forEach(b => b.onclick = () => { state.platform = b.dataset.platform; saveFilters(); home(); });
    reveal();
  }
  const saveFilters = () => { try { sessionStorage.setItem('bm-filters', JSON.stringify(state)); } catch {} };

  /* ---------- карточка игры ---------- */
  let shots = [], shotIdx = 0;
  function game(id) {
    const g = DATA.games.find(x => x.id === id);
    if (!g) { location.hash = '#/'; return; }
    const s = scoreOf(g.id);
    const r = RATINGS.games?.[g.id];
    const post = g.tg?.post;
    const portrait = g.orientation === 'portrait';
    shots = g.shots;
    const media = g.video
      ? `<video src="${g.video}" poster="${g.poster || g.cover}" muted loop playsinline autoplay></video>`
      : `<img class="cover" src="${g.cover}" alt="${esc(g.title)}: кадр из игры" style="object-position:${g.focus || '50% 50%'}">`;
    const near = x => x.genres.some(k => g.genres.includes(k));
    const more = DATA.games.filter(x => x.id !== g.id).sort((x, y) => near(y) - near(x)).slice(0, 3);
    view.innerHTML = `
    <div class="wrap"><a class="back" href="#/">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>Все игры</a></div>
    <section class="wrap game-top" style="--acc:${g.accent}" aria-labelledby="h-game">
      ${echo(media, `game-media on rise ${portrait ? 'portrait' : ''}`)}
      <div class="game-side">
        <div class="game-head rise" style="--i:1">${icon(g)}<h1 id="h-game">${esc(g.title)}</h1></div>
        <p class="hook rise" style="--i:2">${esc(g.hook)}</p>
        <div class="game-act rise" style="--i:3">
          ${playBtn(g)}${likeBtn(g.id, 'big')}
          <button class="btn btn-ghost" type="button" data-review="${g.id}">Оценить</button>
          ${g.status !== 'live' ? '<p class="note">Игра в разработке. Когда выйдет, кнопка «Играть» появится здесь, а пока её можно добавить в избранное.</p>' : ''}
        </div>
        <dl class="facts rise" style="--i:4">
          <div><dt>Оценка</dt><dd>${s ? `<span class="stars">${STAR}${fmt(s.avg)}</span> <span class="muted">· ${s.n}</span>` : 'Пока нет'}</dd></div>
          <div><dt>Жанр</dt><dd>${esc(genreNames(g))}</dd></div>
          <div><dt>Где играть</dt><dd>${PLATFORM[g.platform]}</dd></div>
          <div><dt>Мир</dt><dd>${esc(g.world)}</dd></div>
        </dl>
      </div>
    </section>

    <section class="wrap shots" aria-labelledby="h-shots">
      <h2 id="h-shots" class="rise">Кадры</h2>
      <div class="strip">${g.shots.map((src, i) => `<button type="button" data-shot="${i}" aria-label="Открыть кадр ${i + 1}"><img src="${src}" alt="" loading="lazy"></button>`).join('')}</div>
    </section>

    <section class="wrap about-game" style="--acc:${g.accent}" aria-labelledby="h-about">
      <div><h2 id="h-about" class="rise">Об игре</h2><p class="desc rise" style="--i:1">${esc(g.description)}</p></div>
      <div><ul class="feat">${g.features.map((x, i) => `<li class="rise" style="--i:${i + 1}">${esc(x)}</li>`).join('')}</ul>
      <p class="controls rise" style="--i:4">Управление: ${esc(g.controls)}</p></div>
    </section>

    <section class="wrap reviews" aria-labelledby="h-rev">
      <div>
        <h2 id="h-rev" class="rise">Оценки и отзывы</h2>
        ${s ? `<div class="score rise" style="--i:1"><div><div class="big">${fmt(s.avg)}</div><div class="of">${s.n} ${plural(s.n, 'оценка', 'оценки', 'оценок')}</div></div>
          <div class="bars">${[5, 4, 3, 2, 1].map(k => `<div><span>${k}</span><i><b style="width:${(s.votes[k - 1] / Math.max(...s.votes)) * 100}%"></b></i><span>${s.votes[k - 1]}</span></div>`).join('')}</div></div>` : ''}
        <button class="btn btn-tg rate rise" style="--i:2" type="button" data-review="${g.id}">Оценить и написать отзыв</button>
        ${RATINGS.demo ? '<p class="demo-note">Это демо-данные, чтобы посмотреть вёрстку. Настоящие придут из Telegram.</p>' : ''}
      </div>
      <div class="rev-list">
        ${r?.reviews?.length ? r.reviews.map((x, i) => `<article class="rev rise" style="--i:${i}"><p>${esc(x.text)}</p><p class="who">${x.stars ? `<span class="stars">${STAR}${x.stars}</span> · ` : ''}${esc(x.author)} · ${new Date(x.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}${x.link ? ` · <a href="${x.link}" data-ext>в Telegram</a>` : ''}</p></article>`).join('')
          : `<div class="rev-empty rise"><b>Отзывов пока нет</b><p>Будь первым: поставь звёзды и напиши пару слов. Это займёт полминуты.</p></div>`}
        ${post ? `<div class="tg-embed" id="tgEmbed"></div>` : ''}
      </div>
    </section>

    <section class="wrap more" aria-labelledby="h-more"><h2 id="h-more" class="rise">Ещё игры</h2><div class="grid">${more.map(tile).join('')}</div></section>`;

    if (post) {
      const sc = document.createElement('script');
      sc.async = true; sc.src = 'https://telegram.org/js/telegram-widget.js?22';
      sc.dataset.telegramDiscussion = post; sc.dataset.commentsLimit = '5'; sc.dataset.colorful = '1';
      if (isDark()) sc.dataset.dark = '1';
      $('#tgEmbed').append(sc);
    }
    view.querySelectorAll('[data-shot]').forEach(b => b.onclick = () => openShot(+b.dataset.shot));
    reveal();
  }

  /* ---------- избранное ---------- */
  function favorites() {
    const games = DATA.games.filter(g => FAVS.has(g.id));
    const shorts = DATA.shorts.filter(s => FAVS.has(s.id));
    view.innerHTML = `
    <section class="wrap shelf first" aria-labelledby="h-fav">
      <div class="shelf-head">
        <h1 id="h-fav" class="rise">Избранное</h1>
        <p class="rise" style="--i:1">${inTG ? 'Сердечки хранятся в твоём Telegram и видны на любом устройстве.' : 'Сердечки хранятся в этом браузере. Открой витрину в Telegram, и они будут с тобой на любом устройстве.'}</p>
      </div>
      ${games.length || shorts.length ? `
        ${shorts.length ? `<h2 class="sub rise">Shorts</h2><div class="short-row">${shorts.map(shortTile).join('')}</div>` : ''}
        ${games.length ? `<h2 class="sub rise">Игры</h2><div class="grid">${games.map(tile).join('')}</div>` : ''}`
      : `<div class="fav-empty rise"><p>Пока пусто. Нажми на сердечко у любой игры, и она появится здесь.</p><a class="btn" href="#/shorts">Листать Shorts</a></div>
         <h2 class="sub rise">С чего начать</h2><div class="short-row">${DATA.shorts.map(shortTile).join('')}</div>`}
    </section>`;
    reveal();
  }

  /* ---------- Shorts: лента без конфликта со свайпами в игре ----------
     Просмотр: игра идёт за прозрачным щитом, свайп листает ленту.
     Игра: лента замирает, все касания уходят игре. Листать можно только
     по нижней полоске вне игры, кнопкой «Дальше» или клавишами. */
  let feed = null;
  function shortsFeed(startId) {
    const list = DATA.shorts;
    let idx = Math.max(0, list.findIndex(s => s.id === startId));
    document.body.classList.add('feed-open');
    view.innerHTML = `<div class="feed" id="feed" aria-label="Shorts">
      ${list.map((s, i) => `<section class="short" data-i="${i}" style="--acc:${s.accent}" aria-label="${esc(s.title)}">
        <div class="stage">
          <img class="poster" src="${s.poster}" alt="">
          <div class="frame"></div>
          <button class="shield" type="button" data-play="${i}" aria-label="Играть в ${esc(s.title)}"></button>
        </div>
        <div class="info">
          <h2>${esc(s.title)}</h2>
          <p>${esc(s.hook)}</p>
          <button class="btn" type="button" data-play="${i}">Играть</button>
        </div>
        <div class="rail">
          ${likeBtn(s.id, 'round')}
          <button class="round" type="button" data-review="${s.id}" aria-label="Оценить и написать отзыв">${BUBBLE}<span>Отзыв</span></button>
        </div>
      </section>`).join('')}
    </div>
    <div class="feed-top">
      <a class="icon-btn" href="#/" aria-label="Закрыть ленту">${CLOSE}</a>
      <span class="feed-count" aria-live="polite"></span><span class="feed-hint">Стрелки ↑ ↓ листают, Enter запускает, Esc возвращает в ленту</span>
      <div class="feed-nav"><button class="icon-btn" type="button" data-step="-1" aria-label="Предыдущая">${UP}</button><button class="icon-btn" type="button" data-step="1" aria-label="Следующая">${DOWN}</button></div>
    </div>
    <div class="playbar" hidden>
      <button class="icon-btn" type="button" data-stop aria-label="Выйти в ленту">${CLOSE}</button>
      <div class="grip" role="button" tabindex="0" aria-label="Следующая игра: смахни вверх или нажми"><i></i><span>Вверх — следующая</span></div>
      <span class="pb-like"></span>
      <button class="icon-btn" type="button" data-pb-review aria-label="Оценить и написать отзыв">${BUBBLE}</button>
    </div>
    <div class="over" hidden><p>Конец игры</p><div><button class="btn" type="button" data-again>Ещё раз</button><button class="btn btn-ghost" type="button" data-step="1">Следующая</button></div></div>`;

    const el = $('#feed'), cards = [...el.querySelectorAll('.short')];
    const bar = $('.playbar'), over = $('.over');
    feed = { playing: false, idx };
    if (inTG) { TG.disableVerticalSwipes?.(); TG.BackButton.show(); }

    const load = i => {
      cards.forEach((c, k) => {
        const fr = $('.frame', c);
        const near = Math.abs(k - i) <= 0;
        if (near && !fr.firstChild) {
          fr.innerHTML = `<iframe src="${list[k].src}" title="${esc(list[k].title)}" allow="autoplay; fullscreen" loading="eager"></iframe>`;
          $('iframe', fr).onload = () => setTimeout(() => c.classList.add('ready'), 400);
        }
        if (!near && fr.firstChild) { fr.innerHTML = ''; c.classList.remove('ready'); }
        c.classList.toggle('live', near);
      });
    };
    const setIdx = i => {
      idx = feed.idx = (i + list.length) % list.length;
      $('.feed-count').textContent = `${idx + 1} из ${list.length}`;
      history.replaceState(null, '', `#/shorts/${list[idx].id}`);
      load(idx);
    };
    const go = d => {
      const was = feed.playing;
      if (was) stopPlay(true);
      cards[(idx + d + list.length) % list.length].scrollIntoView({ behavior: was ? 'instant' : 'smooth' });
      if (was) setTimeout(() => play(idx), 350);
    };
    const play = i => {
      if (i !== idx) return;
      feed.playing = true; over.hidden = true;
      el.classList.add('playing'); cards[idx].classList.add('playing');
      $('.pb-like', bar).innerHTML = likeBtn(list[idx].id, 'round small');
      bar.hidden = false;
      const fr = $('iframe', cards[idx]); fr?.focus();
      inTG && TG.HapticFeedback?.impactOccurred('medium');
    };
    stopPlay = (keep) => {
      if (!feed?.playing) return;
      feed.playing = false;
      el.classList.remove('playing'); cards.forEach(c => c.classList.remove('playing'));
      bar.hidden = true; over.hidden = true;
      if (!keep) cards[idx].querySelector('[data-play]').focus({ preventScroll: true });
    };

    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && e.intersectionRatio > .6) setIdx(+e.target.dataset.i); }), { root: el, threshold: [.6] });
    cards.forEach(c => io.observe(c));
    el.addEventListener('click', e => { const b = e.target.closest('[data-play]'); if (b) play(+b.dataset.play); });
    document.querySelectorAll('[data-step]').forEach(b => b.onclick = () => go(+b.dataset.step));
    $('[data-stop]').onclick = () => stopPlay();
    $('[data-again]').onclick = () => { const fr = $('iframe', cards[idx]); if (fr) fr.src = fr.src; play(idx); };
    $('[data-pb-review]').onclick = () => openReview(list[idx]);

    // полоска под игрой: смахивание вверх листает, касание по ней — тоже
    const grip = $('.grip');
    let y0 = null;
    grip.addEventListener('pointerdown', e => { y0 = e.clientY; grip.setPointerCapture(e.pointerId); });
    grip.addEventListener('pointerup', e => { if (y0 === null) return; const dy = e.clientY - y0; y0 = null; go(dy > 40 ? -1 : 1); });
    grip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(1); } });

    // игра может сама сказать, что раунд кончился: parent.postMessage({type:'bm:over'}, '*')
    feed.onMsg = e => { if (e.data?.type === 'bm:over' && feed.playing && e.source === $('iframe', cards[idx])?.contentWindow) over.hidden = false; };
    addEventListener('message', feed.onMsg);
    feed.onKey = e => {
      if (!sheet.hidden || !lb.hidden) return;
      if (feed.playing) { if (e.key === 'Escape') stopPlay(); return; }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      if (e.key === 'Enter' && document.activeElement === document.body) play(idx);
    };
    addEventListener('keydown', feed.onKey);
    feed.io = io;

    cards[idx].scrollIntoView({ behavior: 'instant' });
    setIdx(idx);
  }
  let stopPlay = () => {};
  function closeFeed() {
    if (!feed) return;
    feed.io.disconnect();
    removeEventListener('message', feed.onMsg);
    removeEventListener('keydown', feed.onKey);
    feed = null; stopPlay = () => {};
    document.body.classList.remove('feed-open');
    if (inTG) TG.enableVerticalSwipes?.();
  }

  /* ---------- о каталоге ---------- */
  function about() {
    const ch = DATA.catalog.telegram.channel;
    view.innerHTML = `
    <section class="wrap about-page" aria-labelledby="h-ab">
      <div>
        <h1 id="h-ab" class="rise">Игры в вечной бете</h1>
        <p class="lead rise" style="--i:1">Бета — это состояние до релиза, который никогда не наступает. Здесь собраны пет-игры Павла Черкуна: каждая работает, каждая не доделана, и каждая меняется от того, что ты о ней скажешь.</p>
        <p class="lead rise" style="--i:2">У каждой игры своя координата в мультивселенной Бетамодерна: V-002 — наш мир, V-003 — мир импланта, V-001.993 — зима под сферой Дайсона.</p>
        <div class="hero-act rise" style="--i:3">${ch ? `<a class="btn btn-tg" href="https://t.me/${ch}" data-ext>Канал в Telegram</a>` : '<span class="btn" aria-disabled="true">Канал скоро откроется</span>'}<a class="btn btn-ghost" href="#/">Все игры</a></div>
      </div>
      ${echo('<img src="assets/logo-512.png" alt="Логотип Betamodern Games: белая β с тремя цветными контурами">', 'about-logo on rise')}
    </section>`;
    $('.about-page', view).after(installCard(true));
    reveal();
  }

  /* ---------- лайтбокс ---------- */
  const lb = $('#lightbox'), lbImg = $('img', lb);
  function openShot(i) { shotIdx = (i + shots.length) % shots.length; lbImg.src = shots[shotIdx]; lb.hidden = false; $('.lb-close', lb).focus(); }
  const closeShot = () => { lb.hidden = true; };
  $('.lb-close', lb).onclick = closeShot;
  $('.lb-prev', lb).onclick = () => openShot(shotIdx - 1);
  $('.lb-next', lb).onclick = () => openShot(shotIdx + 1);
  lb.onclick = e => { if (e.target === lb) closeShot(); };
  addEventListener('keydown', e => {
    if (!sheet.hidden && e.key === 'Escape') return closeReview();
    if (lb.hidden) return;
    if (e.key === 'Escape') closeShot();
    if (e.key === 'ArrowLeft') openShot(shotIdx - 1);
    if (e.key === 'ArrowRight') openShot(shotIdx + 1);
  });

  /* ---------- появление ---------- */
  let io;
  function reveal() {
    io?.disconnect();
    paintLikes();
    if (!('IntersectionObserver' in window)) { view.querySelectorAll('.rise').forEach(el => el.classList.add('in')); return; }
    io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    view.querySelectorAll('.rise').forEach(el => io.observe(el));
  }

  /* ---------- маршруты ---------- */
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [page, id] = h.split('/');
    if (page === 'shorts' && feed) return; // лента сама переписывает адрес при листании
    closeShot(); closeReview(); closeFeed();
    if (page === 'game') game(id);
    else if (page === 'about') about();
    else if (page === 'favorites') favorites();
    else if (page === 'shorts') shortsFeed(id);
    else home();
    const nav = { '': 'games', game: 'games', about: 'about', favorites: 'favorites', shorts: 'shorts' }[page] || 'games';
    document.querySelectorAll('[data-nav]').forEach(a => a.dataset.nav === nav ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    const g = page === 'game' && DATA.games.find(x => x.id === id);
    document.title = g ? `${g.title} — Betamodern Games` : { about: 'О каталоге', favorites: 'Избранное', shorts: 'Shorts' }[page] ? `${{ about: 'О каталоге', favorites: 'Избранное', shorts: 'Shorts' }[page]} — Betamodern Games` : 'Betamodern Games';
    if (inTG && page !== 'shorts') page ? TG.BackButton.show() : TG.BackButton.hide();
    if (page !== '' || !route.first) scrollTo(0, 0);
    route.first = false;
  }
  route.first = true;

  Promise.all([
    fetch('games.json').then(r => r.json()),
    fetch(params.has('demo') ? 'data/ratings.sample.json' : 'data/ratings.json').then(r => r.ok ? r.json() : { games: {} }).catch(() => ({ games: {} }))
  ]).then(([d, r]) => {
    DATA = d; DATA.shorts ||= []; RATINGS = r; RATINGS.demo = params.has('demo');
    DATA.genres.forEach(x => GENRES[x.id] = x.name);
    const ch = DATA.catalog.telegram.channel;
    if (ch) { const a = $('#tgTop'); a.href = `https://t.me/${ch}`; a.dataset.ext = ''; a.hidden = false; }
    addEventListener('hashchange', route);
    route();
  }).catch(() => { view.innerHTML = '<p class="wrap empty">Не удалось загрузить список игр. Обнови страницу.</p>'; });
})();
