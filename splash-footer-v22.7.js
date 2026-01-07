// BASELINE — Global submit guard + junk filter verified (Jan 2026)
// - No-change submits do not update timestamps
// - Junk input is blocked from polluting global_items
// Safe rollback anchor

/* SPLASH FOOTER JS — V22.9
   Baseline: V22.8
   Changes: (3) Share Button Ownership Lock (prevents resharing someone else’s island)
            (4) Separate viewerListId (local identity) from islandListId (URL identity on /island)
*/

document.addEventListener('DOMContentLoaded', () => {

  /* =========================
     CONFIG
  ========================== */
  const RESULTS_PATH = '/results';
  const ISLAND_PATH  = '/island';

  const SUPABASE_URL = 'https://ygptwdmgdpvkjopbtwaj.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dRfpqxP_1-oRmTGr2BN8rw_pb3FyoL0';

  const supabase = window.__SPLASH_SUPABASE__ ||
    (window.__SPLASH_SUPABASE__ = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY));

  const PARENT_ROUTES = {
    music:  '/music',
    movies: '/movies',
    books:  '/books',
    tv:     '/tv',
    travel: '/travel',
    food:   '/food',
    cars:   '/cars',
    games:  '/games'
  };

  const PARENT_ALIASES = {
    book: 'books', books: 'books',
    movie: 'movies', movies: 'movies',
    music: 'music',
    tv: 'tv',
    travel: 'travel',
    food: 'food',
    cars: 'cars', car: 'cars',
    games: 'games', game: 'games'
  };

  const PARENT_DISPLAY = {
    music: 'Music',
    movies: 'Movies',
    books: 'Books',
    tv: 'TV',
    travel: 'Travel',
    food: 'Food',
    cars: 'Cars',
    games: 'Games'
  };

  const enc = encodeURIComponent;
  const stripTrailingSlash = (p) => (p || '').replace(/\/$/, '');
  const pathNow = () => stripTrailingSlash(window.location.pathname);
  const isResultsPage = () => pathNow() === RESULTS_PATH;
  const isIslandPage  = () => pathNow() === ISLAND_PATH;

  const normalizeParentKey = (k) => PARENT_ALIASES[(k||'').toLowerCase()] || (k||'').toLowerCase();
  const getParentFromCategory = (c) => normalizeParentKey((c||'').split('-')[0]);
  const getParentFromPath = () => normalizeParentKey(pathNow().replace(/^\//,'').split('-')[0]);

  function getSubKey(category) {
    const parts = (category || '').split('-');
    return (parts.slice(1).join('-') || '').toLowerCase();
  }
  function isAlbumsCategory(category) {
    return getParentFromCategory(category) === 'music' && getSubKey(category) === 'albums';
  }

  /* =========================
     LIST ID (V22.9 — Ownership-safe)
     - viewerListId: ALWAYS local identity (localStorage)
     - islandListId: ONLY the ?listId= we are viewing on /island
     - listId: the "active" listId used by the current page:
       - /island uses islandListId (if present), otherwise viewerListId
       - all other pages use viewerListId
  ========================== */
  const LIST_ID_KEY = 'splash_list_id';

  function getOrCreateListId() {
    let id = localStorage.getItem(LIST_ID_KEY);
    if (!id) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : (Date.now() + '-' + Math.random().toString(16).slice(2));
      localStorage.setItem(LIST_ID_KEY, id);
    }
    return id;
  }

  const viewerListId = getOrCreateListId();
  const urlParams = new URLSearchParams(window.location.search);
  const categoryFromQuery = urlParams.get('category') || '';

  const islandListId = isIslandPage() ? (urlParams.get('listId') || '') : '';
  const listId = (isIslandPage() && islandListId) ? islandListId : viewerListId;

  const isIslandOwner = !isIslandPage()
    ? true
    : ((islandListId || viewerListId) === viewerListId);

  /* =========================
     ISLAND "CAPTURED ON" DATE (V22.7)
     - Uses earliest lists.created_at for this listId (Supabase truth)
     - Falls back to localStorage only if the query fails
  ========================== */
  (async function fixCapturedOnDate(){
    if (!isIslandPage()) return;

    const formatIso = (iso) => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { day:'2-digit', month:'short', year:'numeric' });
    };

    const setUI = (formatted) => {
      if (!formatted) return;

      const elById = document.getElementById('capturedOn') || document.getElementById('capturedOnDate');
      if (elById) {
        elById.textContent = `Captured on ${formatted}`;
        return;
      }

      const candidates = Array.from(document.querySelectorAll('body *'))
        .filter(n => n && n.childElementCount === 0 && typeof n.textContent === 'string' && /captured on/i.test(n.textContent));

      const target = candidates[0];
      if (target) {
        target.textContent = target.textContent.replace(/captured on\s+.*/i, `Captured on ${formatted}`);
      }
    };

    // 1) Supabase truth: earliest created_at from lists for this listId
    try {
      const { data, error } = await supabase
        .from('lists')
        .select('created_at')
        .eq('user_id', listId)
        .order('created_at', { ascending: true })
        .limit(1);

      if (!error && data && data[0] && data[0].created_at) {
        const formatted = formatIso(data[0].created_at);
        if (formatted) {
          try { localStorage.setItem(`splash_island_captured_at_${listId}`, data[0].created_at); } catch(e) {}
          setUI(formatted);
          return;
        }
      }
    } catch(e) {}

    // 2) Fallback: local cached value (legacy behavior) but does NOT advance once set
    try {
      const KEY = `splash_island_captured_at_${listId}`;
      const iso = localStorage.getItem(KEY) || '';
      const formatted = formatIso(iso);
      if (formatted) setUI(formatted);
    } catch(e) {}
  })();

  /* =========================
     LAST PARENT MEMORY
  ========================== */
  const LAST_PARENT_KEY = 'splash_last_parent';

  function setLastParent(parentKey) {
    if (!parentKey) return;
    try { localStorage.setItem(LAST_PARENT_KEY, parentKey); } catch(e) {}
  }

  function getLastParent() {
    try { return localStorage.getItem(LAST_PARENT_KEY) || ''; } catch(e) { return ''; }
  }

  (function recordParentFromPath() {
    const currentPath = pathNow();
    const matched = Object.entries(PARENT_ROUTES).find(([k, route]) => stripTrailingSlash(route) === currentPath);
    if (matched) setLastParent(matched[0]);
  })();

  /* =========================
     FIELD REPOPULATION (LOCAL "LAST TOP 5")
  ========================== */
  const LAST_LIST_PREFIX = 'splash_last_';

  function lastListKey(category) { return LAST_LIST_PREFIX + String(category || '').trim().toLowerCase(); }
  function safeJsonParse(raw) { try { return JSON.parse(raw); } catch (e) { return null; } }

  function getRankInputs(formEl) {
    return [1,2,3,4,5].map(i => formEl.querySelector(`input[name="rank${i}"]`)).filter(Boolean);
  }

  function allRankInputsEmpty(inputs) { return inputs.every(inp => !String(inp.value || '').trim()); }

  function loadLastList(category) {
    try {
      const raw = localStorage.getItem(lastListKey(category));
      if (!raw) return null;
      return safeJsonParse(raw);
    } catch (e) { return null; }
  }

  function saveLastList(category, values) {
    const payload = {
      category: String(category || '').trim().toLowerCase(),
      rank1: (values[0] || '').trim(),
      rank2: (values[1] || '').trim(),
      rank3: (values[2] || '').trim(),
      rank4: (values[3] || '').trim(),
      rank5: (values[4] || '').trim(),
      updatedAt: new Date().toISOString()
    };
    try { localStorage.setItem(lastListKey(category), JSON.stringify(payload)); } catch (e) {}
  }

  function enablePrefilledBehavior(inputEl) {
    if (!inputEl || inputEl.__SPLASH_PREFILL_BOUND__) return;
    inputEl.__SPLASH_PREFILL_BOUND__ = true;

    inputEl.addEventListener('focus', () => {
      if (inputEl.dataset.splashPrefilled === '1') {
        setTimeout(() => { try { inputEl.select(); } catch (e) {} }, 0);
      }
    });

    const clearPrefilledFlag = () => {
      if (inputEl.dataset.splashPrefilled === '1') {
        inputEl.dataset.splashPrefilled = '0';
        inputEl.classList.remove('splash-prefilled');
      }
    };

    inputEl.addEventListener('input', clearPrefilledFlag);
    inputEl.addEventListener('paste', clearPrefilledFlag);
    inputEl.addEventListener('keydown', (e) => {
      const navKeys = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Shift','Control','Alt','Meta','Enter','Escape'];
      if (!navKeys.includes(e.key)) clearPrefilledFlag();
    });
  }

  function applyLastListToForm(formEl) {
    const category = (formEl.getAttribute('data-category') || '').trim().toLowerCase();
    if (!category) return;

    const inputs = getRankInputs(formEl);
    if (!inputs.length) return;

    inputs.forEach(enablePrefilledBehavior);

    if (!allRankInputsEmpty(inputs)) return;

    const snap = loadLastList(category);
    if (!snap) return;

    const vals = [snap.rank1, snap.rank2, snap.rank3, snap.rank4, snap.rank5];
    vals.forEach((val, idx) => {
      if (!inputs[idx]) return;
      const existing = String(inputs[idx].value || '').trim();
      const nextVal  = String(val || '').trim();
      if (!existing && nextVal) {
        inputs[idx].value = nextVal;
        inputs[idx].classList.add('splash-prefilled');
        inputs[idx].dataset.splashPrefilled = '1';
      }
    });
  }

  /* =========================
     iOS KEYBOARD OVERLAP / SCROLL ASSIST
  ========================== */
  (function bindKeyboardAssist(){
    const rankInputs = Array.from(document.querySelectorAll('input[name^="rank"]'));
    if (!rankInputs.length) return;

    if (window.__SPLASH_KEYBOARD_ASSIST__) return;
    window.__SPLASH_KEYBOARD_ASSIST__ = true;

    const spacer = document.createElement('div');
    spacer.id = 'splash-keyboard-spacer';
    spacer.style.height = '0px';
    spacer.style.pointerEvents = 'none';
    document.body.appendChild(spacer);

    const submitBtn = document.querySelector('form [type="submit"], form button[type="submit"], form input[type="submit"]');

    function getKeyboardOverlap(){
      if (window.visualViewport) {
        const vv = window.visualViewport;
        return Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      }
      return 0;
    }

    function setSpacer(px){
      const extra = 90;
      spacer.style.height = px > 0 ? `${px + extra}px` : '0px';
    }

    let lastScrollAt = 0;

    function hardScrollIntoSafeZone(el){
      const now = Date.now();
      if (now - lastScrollAt < 180) return;

      const overlap = getKeyboardOverlap();
      setSpacer(overlap);

      const viewportH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const safeBottom = viewportH - 110;
      const desiredTop = 110;

      const rect = el.getBoundingClientRect();

      let delta = 0;
      if (rect.bottom > safeBottom) delta = rect.bottom - safeBottom;
      else if (rect.top < desiredTop) delta = rect.top - desiredTop;

      if (Math.abs(delta) > 12) {
        lastScrollAt = now;
        window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
      }
    }

    function onFocus(el){
      setTimeout(() => hardScrollIntoSafeZone(el), 120);
    }

    rankInputs.forEach(el => {
      el.addEventListener('focus', () => onFocus(el), { passive: true });
      el.addEventListener('blur',  () => setTimeout(() => setSpacer(0), 160), { passive: true });

      if (el.name === 'rank5' && submitBtn) {
        el.addEventListener('focus', () => {
          setTimeout(() => {
            const r = submitBtn.getBoundingClientRect();
            const viewportH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            const safeBottom = viewportH - 110;

            const delta = r.bottom - safeBottom;
            if (delta > 12) window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
          }, 160);
        }, { passive: true });
      }
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        setSpacer(getKeyboardOverlap());
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          hardScrollIntoSafeZone(active);
        }
      }, { passive: true });
    }
  })();

  /* =========================
     MUSICBRAINZ PREDICT (Albums only)
     (Unchanged)
  ========================== */
  function debounce(fn, wait) {
    let t = null;
    return function(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function ensureSuggestBox(inputEl) {
    if (!inputEl || inputEl.__SPLASH_SUGGEST_BOX__) return inputEl.__SPLASH_SUGGEST_BOX__;

    const box = document.createElement('div');
    box.className = 'splash-suggest';
    box.setAttribute('role', 'listbox');
    box.dataset.open = '0';
    box.__activeIndex = -1;
    box.__items = [];

    const parent = inputEl.parentElement;
    if (parent) {
      const cs = window.getComputedStyle(parent);
      if (cs.position === 'static') parent.style.position = 'relative';
      parent.appendChild(box);
    } else {
      document.body.appendChild(box);
    }

    inputEl.__SPLASH_SUGGEST_BOX__ = box;
    return box;
  }

  function closeSuggest(inputEl) {
    const box = inputEl && inputEl.__SPLASH_SUGGEST_BOX__;
    if (!box) return;
    box.dataset.open = '0';
    box.innerHTML = '';
    box.__items = [];
    box.__activeIndex = -1;
  }

  function setActiveRow(inputEl, index) {
    const box = inputEl && inputEl.__SPLASH_SUGGEST_BOX__;
    if (!box || !box.__items.length) return;

    const rows = Array.from(box.querySelectorAll('.row'));
    rows.forEach(r => r.dataset.active = '0');

    const bounded = Math.max(0, Math.min(index, rows.length - 1));
    box.__activeIndex = bounded;
    if (rows[bounded]) rows[bounded].dataset.active = '1';
  }

  function acceptSuggestion(inputEl, item) {
    if (!inputEl || !item) return;
    inputEl.value = item.display || item.label || '';
    inputEl.dataset.canonicalId = item.id || '';
    inputEl.dataset.canonicalSource = item.source || '';
  }

  function renderSuggest(inputEl, items) {
    const box = ensureSuggestBox(inputEl);
    box.innerHTML = '';
    box.__items = items || [];
    box.__activeIndex = -1;

    if (!items || !items.length) {
      box.dataset.open = '0';
      return;
    }

    items.slice(0, 6).forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.index = String(idx);

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = it.label || '';

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = it.meta || '';

      row.appendChild(title);
      row.appendChild(meta);

      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        acceptSuggestion(inputEl, it);
        closeSuggest(inputEl);
      });

      box.appendChild(row);
    });

    box.dataset.open = '1';
  }

  async function musicBrainzAlbumSearch(query) {
    const q = String(query || '').trim();
    if (q.length < 2) return [];

    const dashParts = q.split(/\s[-–—]\s/);
    let title = (dashParts[0] || '').trim();
    let artist = (dashParts.slice(1).join(' - ') || '').trim();

    const strict = artist
      ? `releasegroup:"${title}" AND artist:"${artist}"`
      : `releasegroup:"${title}"`;

    const loose = artist
      ? `releasegroup:${title} AND artist:${artist}`
      : `releasegroup:${title}`;

    const fetchRG = async (mbq) => {
      const url = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(mbq)}&fmt=json&limit=12`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);

      try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: controller.signal });
        if (!res.ok) return [];
        const json = await res.json();
        const rgs = (json && json['release-groups']) ? json['release-groups'] : [];
        return Array.isArray(rgs) ? rgs : [];
      } catch {
        return [];
      } finally {
        clearTimeout(timer);
      }
    };

    let rgs = await fetchRG(strict);
    if (!rgs.length) rgs = await fetchRG(loose);

    const rgArtistName = (rg) => {
      const ac = rg && rg['artist-credit'];
      if (!ac || !ac.length) return '';
      return String(ac[0].name || '');
    };

    return rgs
      .filter(rg => rg && rg.id && rg.title)
      .map(rg => {
        const primaryArtist = rgArtistName(rg);
        const year = rg['first-release-date'] ? String(rg['first-release-date']).slice(0,4) : '';
        const meta = [primaryArtist, year].filter(Boolean).join(' • ');
        const display = primaryArtist ? `${rg.title} - ${primaryArtist}` : rg.title;

        return { id: rg.id, source: 'musicbrainz', label: rg.title, display, meta };
      })
      .slice(0, 6);
  }

  function bindPredictToInput(inputEl, category) {
    if (!inputEl || inputEl.__SPLASH_MB_PREDICT__) return;
    inputEl.__SPLASH_MB_PREDICT__ = true;

    ensureSuggestBox(inputEl);

    const doSearch = debounce(async () => {
      if (inputEl.dataset.splashPrefilled === '1') return;
      const v = String(inputEl.value || '').trim();
      if (v.length < 3) { closeSuggest(inputEl); return; }
      if (!isAlbumsCategory(category)) return;

      const items = await musicBrainzAlbumSearch(v);
      renderSuggest(inputEl, items);
    }, 180);

    inputEl.addEventListener('input', doSearch);

    inputEl.addEventListener('keydown', (e) => {
      const box = inputEl.__SPLASH_SUGGEST_BOX__;
      const open = box && box.dataset.open === '1';
      if (!open) return;

      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveRow(inputEl, (box.__activeIndex < 0 ? 0 : box.__activeIndex + 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveRow(inputEl, (box.__activeIndex < 0 ? 0 : box.__activeIndex - 1)); return; }
      if (e.key === 'Tab' || e.key === 'Enter') {
        if (box.__activeIndex >= 0 && box.__items[box.__activeIndex]) {
          e.preventDefault();
          acceptSuggestion(inputEl, box.__items[box.__activeIndex]);
          closeSuggest(inputEl);
        }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); closeSuggest(inputEl); return; }
    });

    inputEl.addEventListener('blur', () => { setTimeout(() => closeSuggest(inputEl), 120); });
  }

  /* =========================
     BACK BUTTONS (SMART ROUTING)
     Class required: .back-button
  ========================== */
  document.querySelectorAll('.back-button').forEach((btn) => {
    const currentPath = pathNow();
    const isParentPage = Object.values(PARENT_ROUTES).some(route => stripTrailingSlash(route) === currentPath);

    let parent = '';
    if (isResultsPage() || isIslandPage()) {
      parent = getParentFromCategory(categoryFromQuery) || getLastParent();
    } else {
      parent = getParentFromPath() || getLastParent();
    }

    if ((isResultsPage() || isIslandPage()) && parent && PARENT_ROUTES[parent]) {
      btn.textContent = '← Back to choices';
    } else if (!isParentPage && parent && PARENT_ROUTES[parent]) {
      btn.textContent = `← Back to ${PARENT_DISPLAY[parent] || parent}`;
    } else {
      btn.textContent = '← Back to Home';
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if ((isResultsPage() || isIslandPage()) && parent && PARENT_ROUTES[parent]) { window.location.href = window.location.origin + PARENT_ROUTES[parent]; return; }
      if (!isParentPage && parent && PARENT_ROUTES[parent]) { window.location.href = window.location.origin + PARENT_ROUTES[parent]; return; }
      window.location.href = window.location.origin + '/';
    });
  });

  /* =========================
     RESULTS → ISLAND BUTTON
     Class required: .island-button
  ========================== */
  document.querySelectorAll('.island-button').forEach((btn) => {
    btn.textContent = 'My Desert Island →';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      // Always go to YOUR island (viewerListId)
      window.location.href = window.location.origin + ISLAND_PATH + `?listId=${enc(viewerListId)}`;
    });
  });

  /* =========================
     SHARE BUTTON (ISLAND) — V22.9 OWNERSHIP LOCK
     Class required: .share-button
  ========================== */
  document.querySelectorAll('.share-button').forEach((btn) => {

    // If viewing someone else’s island, replace share with "Make your own Splash"
    if (isIslandPage() && !isIslandOwner) {
      btn.textContent = 'Make your own Splash';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = window.location.origin + '/';
      });
      return;
    }

    // Owner view (or non-island pages): normal share
    btn.textContent = 'Share my island';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();

      // Always share YOUR island (viewerListId), never the viewed island id
      const shareUrl = window.location.origin + ISLAND_PATH + `?listId=${enc(viewerListId)}`;
      const original = 'Share my island';

      try {
        if (navigator.share) {
          await navigator.share({ title: 'My Desert Island', text: 'A snapshot of what I’d take with me — captured in time.', url: shareUrl });
          return;
        }
        await navigator.clipboard.writeText(shareUrl);
        btn.textContent = 'Link copied';
        setTimeout(() => (btn.textContent = original), 1200);
      } catch (err) {
        window.prompt('Copy this link:', shareUrl);
      }
    });
  });

  /* =========================
     LINK RESOLVER (NO SPOTIFY API)
  ========================== */
  function parseTitleArtist(raw) {
    const s = (raw || '').trim();
    const parts = s.split(/\s[-–—]\s/);
    if (parts.length >= 2) return { title: parts[0].trim(), artist: parts.slice(1).join(' - ').trim() };
    return { title: s, artist: '' };
  }

  function toTitleCase(str) {
    return (str || '')
      .replace(/[-_]+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function resolveLinks(itemText, category) {
    const raw = (itemText || '').trim();
    if (!raw) return { aLabel:'', aUrl:'', bLabel:'', bUrl:'' };

    const parent = getParentFromCategory(category);
    const sub = getSubKey(category);
    const { title, artist } = parseTitleArtist(raw);

    const google = (q) => `https://www.google.com/search?q=${enc(q)}`;
    const maps   = (q) => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;

    if (parent === 'music') {
      const plain = (artist ? `${title} ${artist}` : title).trim();
      if (sub === 'albums') return { aLabel:'Spotify', aUrl:`https://open.spotify.com/search/${enc(plain)}`, bLabel:'Apple Music', bUrl:`https://music.apple.com/search?term=${enc(plain)}&entity=album` };
      if (sub === 'songs')  return { aLabel:'Spotify', aUrl:`https://open.spotify.com/search/${enc(plain)}`, bLabel:'Apple Music', bUrl:`https://music.apple.com/search?term=${enc(plain)}&entity=song` };
      if (sub === 'artists')return { aLabel:'Spotify', aUrl:`https://open.spotify.com/search/${enc(title)}`, bLabel:'Apple Music', bUrl:`https://music.apple.com/search?term=${enc(title)}&entity=musicArtist` };
      return { aLabel:'Spotify', aUrl:`https://open.spotify.com/search/${enc(title)}`, bLabel:'Google', bUrl: google(`${title} music`) };
    }

    if (parent === 'movies') return { aLabel:'IMDb', aUrl:`https://www.imdb.com/find/?q=${enc(title)}`, bLabel:'Google', bUrl: google(`${title} movie`) };
    if (parent === 'books')  return { aLabel:'Goodreads', aUrl:`https://www.goodreads.com/search?q=${enc(title)}`, bLabel:'Google Books', bUrl:`https://www.google.com/search?tbm=bks&q=${enc(title)}` };
    if (parent === 'tv')     return { aLabel:'JustWatch', aUrl:`https://www.justwatch.com/search?q=${enc(title)}`, bLabel:'Google', bUrl: google(`${title} tv series`) };
    if (parent === 'travel') return { aLabel:'Maps', aUrl: maps(title), bLabel:'Google', bUrl: google(`${title} travel`) };
    if (parent === 'food')   return { aLabel:'Maps', aUrl: maps(title), bLabel:'Google', bUrl: google(`${title} recipe`) };
    if (parent === 'cars')   return { aLabel:'Wikipedia', aUrl:`https://en.wikipedia.org/wiki/Special:Search?search=${enc(title)}`, bLabel:'Google', bUrl: google(`${title} car`) };
    if (parent === 'games')  return { aLabel:'Steam', aUrl:`https://store.steampowered.com/search/?term=${enc(title)}`, bLabel:'Google', bUrl: google(`${title} game`) };

    return { aLabel:'Google', aUrl: google(title), bLabel:'Search', bUrl: google(title) };
  }

  /* =========================
     SHARED BUTTON STYLE
  ========================== */
  function styleOpenButton(btn) {
    btn.classList.add('di-action-pill');
    btn.style.flex = '0 0 auto';
  }

  function styleRowLi(li) {
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.justifyContent = 'space-between';
    li.style.gap = '12px';
  }

  /* =========================
     OPEN DIALOG (CREATE ONCE + LOCK SCROLL)
     - V22.7: lock/unlock also touches <html> overflow for desktop resilience
  ========================== */
  function ensureOpenDialog(){
    let sheet = document.querySelector('.di-open-sheet');
    if (sheet) return sheet;

    sheet = document.createElement('div');
    sheet.className = 'di-open-sheet';
    sheet.setAttribute('aria-hidden','true');

    sheet.innerHTML = `
      <div class="di-open-backdrop"></div>
      <div class="di-open-panel" role="dialog" aria-modal="true">
        <div class="di-open-head">
          <div class="di-open-title">OPEN</div>
          <button type="button" class="di-open-x" data-di-close aria-label="Close">×</button>
        </div>
        <div class="di-open-body" id="diOpenBody"></div>
      </div>
    `;
    document.body.appendChild(sheet);

    const backdrop = sheet.querySelector('.di-open-backdrop');
    const closeBtn = sheet.querySelector('.di-open-x');
    const panel    = sheet.querySelector('.di-open-panel');

    const onClose = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      hideOpenDialog();
    };

    if (closeBtn) {
      closeBtn.addEventListener('pointerdown', onClose, { passive: false });
      closeBtn.addEventListener('click', onClose, { passive: false });
      closeBtn.addEventListener('touchend', onClose, { passive: false });
    }

    if (backdrop) {
      backdrop.addEventListener('pointerdown', onClose, { passive: false });
      backdrop.addEventListener('click', onClose, { passive: false });
      backdrop.addEventListener('touchend', onClose, { passive: false });
    }

    if (panel) {
      panel.addEventListener('pointerdown', (e) => e.stopPropagation(), { passive: true });
      panel.addEventListener('click', (e) => e.stopPropagation(), { passive: true });
      panel.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
    }

    const mo = new MutationObserver(() => {
      const hiddenByAria = sheet.getAttribute('aria-hidden') === 'true';
      const hiddenByStyle = sheet.style.display === 'none' || getComputedStyle(sheet).display === 'none';
      if (hiddenByAria || hiddenByStyle) unlockScroll();
    });
    mo.observe(sheet, { attributes: true, attributeFilter: ['style','aria-hidden'] });
    sheet.__SPLASH_OBSERVER__ = mo;

    return sheet;
  }

  function lockScroll(){
    const b = document.body;
    const h = document.documentElement;

    if (!b.dataset.__diPrevOverflow) b.dataset.__diPrevOverflow = b.style.overflow || '';
    if (!b.dataset.__diPrevTouchAction) b.dataset.__diPrevTouchAction = b.style.touchAction || '';
    if (!b.dataset.__diPrevHtmlOverflow) b.dataset.__diPrevHtmlOverflow = h.style.overflow || '';

    b.style.overflow = 'hidden';
    h.style.overflow = 'hidden';
    b.style.touchAction = 'none';
  }

  function unlockScroll(){
    const b = document.body;
    const h = document.documentElement;

    const prevOverflow = b.dataset.__diPrevOverflow;
    const prevTouch = b.dataset.__diPrevTouchAction;
    const prevHtmlOverflow = b.dataset.__diPrevHtmlOverflow;

    b.style.overflow = (prevOverflow !== undefined) ? prevOverflow : '';
    b.style.touchAction = (prevTouch !== undefined) ? prevTouch : '';
    h.style.overflow = (prevHtmlOverflow !== undefined) ? prevHtmlOverflow : '';

    delete b.dataset.__diPrevOverflow;
    delete b.dataset.__diPrevTouchAction;
    delete b.dataset.__diPrevHtmlOverflow;
  }

  function showOpenDialog(links){
    const sheet = ensureOpenDialog();
    const body = sheet.querySelector('#diOpenBody');
    if (!body) return;

    const aLabel = (links && links.aLabel) ? String(links.aLabel) : '';
    const aUrl   = (links && links.aUrl) ? String(links.aUrl) : '';
    const bLabel = (links && links.bLabel) ? String(links.bLabel) : '';
    const bUrl   = (links && links.bUrl) ? String(links.bUrl) : '';

    body.innerHTML = '';

    const mkRow = (label, url) => {
      const row = document.createElement('div');
      row.className = 'di-open-row';

      const left = document.createElement('div');
      left.className = 'lbl';
      left.textContent = label || 'Open';

      const btn = document.createElement('a');
      btn.className = 'di-action-pill';
      btn.textContent = 'Open';
      btn.href = url || '#';
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';

      row.appendChild(left);
      row.appendChild(btn);
      return row;
    };

    if (aUrl) body.appendChild(mkRow(aLabel || 'Link 1', aUrl));
    if (bUrl) body.appendChild(mkRow(bLabel || 'Link 2', bUrl));

    const cancelRow = document.createElement('div');
    cancelRow.className = 'di-open-row';
    const cancelLbl = document.createElement('div');
    cancelLbl.className = 'lbl';
    cancelLbl.textContent = 'Cancel';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'di-action-pill';
    cancelBtn.textContent = 'Close';
    cancelBtn.setAttribute('data-di-close','');
    cancelBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); hideOpenDialog(); }, { passive:false });
    cancelRow.appendChild(cancelLbl);
    cancelRow.appendChild(cancelBtn);
    body.appendChild(cancelRow);

    if (!aUrl && !bUrl) body.textContent = 'No links available.';

    lockScroll();
    sheet.style.display = 'block';
    sheet.setAttribute('aria-hidden','false');
  }

  function hideOpenDialog() {
    const sheet = document.querySelector('.di-open-sheet');
    if (!sheet) { unlockScroll(); return; }
    sheet.style.display = 'none';
    sheet.setAttribute('aria-hidden', 'true');
    unlockScroll();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[data-di-open]');
    if (!btn) return;

    const raw = btn.getAttribute('data-di-links') || '';
    let links = null;

    try { links = JSON.parse(raw.replace(/'/g,'"')); } catch { links = null; }

    e.preventDefault();
    showOpenDialog(links || {});
  });

  document.addEventListener('pointerdown', (e) => {
    const t = e.target;
    if (!t) return;

    const sheet = document.querySelector('.di-open-sheet');
    if (!sheet) return;

    const isOpen = sheet.getAttribute('aria-hidden') === 'false' && getComputedStyle(sheet).display !== 'none';
    if (!isOpen) return;

    const closeHit =
      t.closest('.di-open-x') ||
      t.closest('.di-open-sheet [aria-label="Close"]') ||
      t.closest('.di-open-sheet [data-di-close]') ||
      t.closest('.di-open-sheet .w-close, .di-open-sheet .close, .di-open-sheet .modal-close');

    if (!closeHit) return;

    e.preventDefault();
    e.stopPropagation();
    hideOpenDialog();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideOpenDialog();
  });

  /* =========================
     GLOBAL ITEMS HELPERS
  ========================== */
  function normText(s){
    return String(s || '').trim().replace(/\s+/g,' ');
  }

  function canonicalFromDisplay(display){
    const t = normText(display).toLowerCase();
    const cleaned = t
      .replace(/[’']/g,'')
      .replace(/[^a-z0-9\s-]/g,'')
      .replace(/\s+/g,' ')
      .trim();

    return cleaned
      .replace(/\s/g,'-')
      .replace(/-+/g,'-')
      .replace(/^-+|-+$/g,'');
  }

  function canonicalMultiset(arr){
    const m = new Map();
    const displayByCanon = new Map();

    arr.forEach(v => {
      const display = normText(v);
      if (!display) return;
      const canon = canonicalFromDisplay(display);
      if (!canon) return;

      m.set(canon, (m.get(canon) || 0) + 1);
      displayByCanon.set(canon, display);
    });

    return { m, displayByCanon };
  }

  function diffCanonicalMultiset(oldArr, newArr){
    const old = canonicalMultiset(oldArr);
    const neu = canonicalMultiset(newArr);

    const added = [];
    const removed = [];

    for (const [canon, n] of neu.m.entries()){
      const prev = old.m.get(canon) || 0;
      if (n > prev){
        for (let i=0; i<(n-prev); i++) added.push({ canon, display: neu.displayByCanon.get(canon) || '' });
      }
    }

    for (const [canon, n] of old.m.entries()){
      const next = neu.m.get(canon) || 0;
      if (n > next){
        for (let i=0; i<(n-next); i++) removed.push({ canon, display: old.displayByCanon.get(canon) || '' });
      }
    }

    return { added, removed };
  }

  async function incrementGlobalItemByCanonical(category, canonical, display){
    const canon = String(canonical || '').trim();
    const disp  = normText(display);
    if (!canon) return;

    const { data: existing, error: selErr } = await supabase
      .from('global_items')
      .select('id,count')
      .eq('category', category)
      .eq('canonical_id', canon)
      .maybeSingle();

    if (selErr) throw selErr;

    if (existing && existing.id){
      const nextCount = Number(existing.count || 0) + 1;
      const payload = { count: nextCount };
      if (disp) payload.display_name = disp;

      const { error: upErr } = await supabase
        .from('global_items')
        .update(payload)
        .eq('id', existing.id);

      if (upErr) throw upErr;
    } else {
      const { error: insErr } = await supabase
        .from('global_items')
        .insert({
          category: category,
          source: 'user_input',
          canonical_id: canon,
          display_name: disp || canon,
          count: 1
        });

      if (insErr) throw insErr;
    }
  }

  async function decrementGlobalItemByCanonical(category, canonical){
    const canon = String(canonical || '').trim();
    if (!canon) return;

    const { data: existing, error: selErr } = await supabase
      .from('global_items')
      .select('id,count')
      .eq('category', category)
      .eq('canonical_id', canon)
      .maybeSingle();

    if (selErr) throw selErr;
    if (!existing || !existing.id) return;

    const nextCount = Number(existing.count || 0) - 1;

    if (nextCount <= 0){
      const { error: delErr } = await supabase
        .from('global_items')
        .delete()
        .eq('id', existing.id);

      if (delErr) throw delErr;
    } else {
      const { error: upErr } = await supabase
        .from('global_items')
        .update({ count: nextCount })
        .eq('id', existing.id);

      if (upErr) throw upErr;
    }
  }

  /* =========================
     GLOBAL APPLIED SNAPSHOT (per category)
  ========================== */
  const GLOBAL_APPLIED_PREFIX = 'splash_global_applied_';

  function globalAppliedKey(category){
    return GLOBAL_APPLIED_PREFIX + String(category || '').trim().toLowerCase();
  }

  function loadGlobalApplied(category){
    try {
      const raw = localStorage.getItem(globalAppliedKey(category));
      if (!raw) return null;
      const j = safeJsonParse(raw);
      if (!j) return null;
      return [j.rank1, j.rank2, j.rank3, j.rank4, j.rank5].filter(Boolean);
    } catch (e) { return null; }
  }

  function saveGlobalApplied(category, values){
    const payload = {
      category: String(category || '').trim().toLowerCase(),
      rank1: (values[0] || '').trim(),
      rank2: (values[1] || '').trim(),
      rank3: (values[2] || '').trim(),
      rank4: (values[3] || '').trim(),
      rank5: (values[4] || '').trim(),
      updatedAt: new Date().toISOString()
    };
    try { localStorage.setItem(globalAppliedKey(category), JSON.stringify(payload)); } catch (e) {}
  }

  /* =========================
     V22.8 — ANTI-JUNK VALIDATION (NEW)
  ========================== */
  function isProbablyUrlOrEmail(s){
    const t = String(s || '').trim().toLowerCase();
    if (!t) return false;
    if (/\bhttps?:\/\//i.test(t)) return true;
    if (/\bwww\./i.test(t)) return true;
    if (/\S+@\S+\.\S+/.test(t)) return true;
    return false;
  }

  function isObviousJunkToken(s){
    const t = String(s || '').trim().toLowerCase();
    if (!t) return true;

    const banned = new Set(['test','testing','asdf','qwerty','aaa','bbb','ccc','123','1234','12345','lol','haha']);
    if (banned.has(t)) return true;

    // 5+ same char (e.g., "aaaaa", ".....", "!!!!!")
    if (/^(.)\1{4,}$/.test(t)) return true;

    // mostly non-letters/numbers
    const alnumCount = (t.match(/[a-z0-9]/g) || []).length;
    if (alnumCount < Math.min(2, t.length)) {
      // allow small legit items like "It" (2 letters). This catches things like "----" or "!!"
      if (t.length >= 3) return true;
    }

    return false;
  }

  function validateTop5(values){
    const cleaned = values.map(v => String(v || '').trim());
    const nonEmpty = cleaned.filter(Boolean);

    if (nonEmpty.length === 0) {
      return { ok:false, msg:'Please enter at least one item before submitting.' };
    }

    for (const v of nonEmpty){
      if (v.length < 2) return { ok:false, msg:'Entries must be at least 2 characters.' };
      if (v.length > 80) return { ok:false, msg:'Please keep each entry under 80 characters.' };
      if (isProbablyUrlOrEmail(v)) return { ok:false, msg:'Please enter item names only (no links or email addresses).' };
      if (isObviousJunkToken(v)) return { ok:false, msg:'Please remove placeholder/junk entries and use real item names.' };

      const canon = canonicalFromDisplay(v);
      if (!canon) return { ok:false, msg:'One of your entries looks invalid after formatting. Please adjust it and try again.' };
    }

    return { ok:true, msg:'' };
  }

  /* =========================
     V22.8 — NO-CHANGE GUARD HELPERS (NEW)
  ========================== */
  function valuesEqualRow(row, values){
    if (!row) return false;
    const rowVals = [row.v1, row.v2, row.v3, row.v4, row.v5].map(v => String(v || '').trim());
    const newVals = values.map(v => String(v || '').trim());
    return rowVals.join('||') === newVals.join('||');
  }

  /* =========================
     RESULTS PAGE
  ========================== */
  if (isResultsPage()) {
    const getSubFromCategory = (category) => {
      const parts = (category || '').split('-');
      if (parts.length <= 1) return '';
      return toTitleCase(parts.slice(1).join(' '));
    };

    const setResultsCopy = () => {
      const category = urlParams.get('category') || '';
      const subLabel = getSubFromCategory(category) || 'Items';

      const userTitleEl   = document.getElementById('userListTitle');
      const userDescEl    = document.getElementById('userListSubtext');
      const globalTitleEl = document.getElementById('globalListTitle');

      if (userTitleEl) userTitleEl.textContent = `Your Top 5 ${subLabel}`;
      if (userDescEl)  userDescEl.textContent  = `If these were the only 5 ${subLabel.toLowerCase()} you could take… here’s what you chose.`;
      if (globalTitleEl) globalTitleEl.textContent = `Global Splash (Top 100 ${subLabel})`;
    };

    setResultsCopy();

    // RESULTS Reflection block (locked copy)
    const setResultsReflectionCopy = () => {
      const el = document.getElementById('resultsReflectionCopy');
      if (!el) return;

      el.innerHTML =
        `Because the hardest part of Splash isn’t choosing five things — it’s living with your answers.` +
        `<br><br>` +
        `You didn’t make this list for likes, approval, or explanation.` +
        `<br>` +
        `You made it because these choices say something about who you are — right now.` +
        `<br><br>` +
        `Over time, you’ll want to come back and change it.` +
        `<br>` +
        `Not because it was wrong — but because you moved on.` +
        `<br><br>` +
        `And that’s the point.`;
    };

    setResultsReflectionCopy();

    (async () => {
      const category = urlParams.get('category') || '';
      const userList = document.getElementById('userList');
      if (!userList) return;

      userList.innerHTML = '<li>Loading…</li>';

      try {
        const { data, error } = await supabase
          .from('lists')
          .select('*')
          .eq('user_id', listId)
          .eq('category', category)
          .maybeSingle();

        if (error) throw error;

        userList.innerHTML = '';

        if (data) {
          [data.v1, data.v2, data.v3, data.v4, data.v5].forEach(v => {
            if (!v) return;

            const li = document.createElement('li');
            styleRowLi(li);

            const textSpan = document.createElement('span');
            textSpan.textContent = v;

            const openBtn = document.createElement('button');
            openBtn.type = 'button';
            openBtn.textContent = 'Open';
            openBtn.setAttribute('data-di-open', '');

            const links = resolveLinks(v, category);
            const safe = (s) => (s || '').replace(/'/g, '');
            const payload = `{'aLabel':'${safe(links.aLabel)}','aUrl':'${safe(links.aUrl)}','bLabel':'${safe(links.bLabel)}','bUrl':'${safe(links.bUrl)}'}`;
            openBtn.setAttribute('data-di-links', payload);

            styleOpenButton(openBtn);

            li.appendChild(textSpan);
            li.appendChild(openBtn);
            userList.appendChild(li);
          });

          if (!userList.children.length) userList.innerHTML = '<li>No items.</li>';
        } else {
          userList.innerHTML = '<li>No saved list.</li>';
        }

        const probe = userList.querySelector('li span') || userList.querySelector('li') || userList;
        if (probe) {
          window.__SPLASH_TOP5_FONTSIZE__ = window.getComputedStyle(probe).fontSize;
          window.__SPLASH_TOP5_LINEHEIGHT__ = window.getComputedStyle(probe).lineHeight;
        }
      } catch {
        userList.innerHTML = '<li>Could not load.</li>';
      }
    })();

    (async () => {
      const category = urlParams.get('category') || '';
      const globalMount = document.getElementById('globalList');
      if (!globalMount) return;

      globalMount.textContent = 'Loading…';

      try {
        const { data, error } = await supabase
          .from('global_items')
          .select('display_name, canonical_id, source, category, count')
          .eq('category', category)
          .order('count', { ascending: false })
          .limit(100);

        if (error) throw error;

        if (!data || !data.length) {
          globalMount.textContent = 'No global rankings yet.';
          return;
        }

        const fs = window.__SPLASH_TOP5_FONTSIZE__;
        const lh = window.__SPLASH_TOP5_LINEHEIGHT__;
        if (fs) globalMount.style.fontSize = fs;
        if (lh) globalMount.style.lineHeight = lh;

        const ul = document.createElement('ul');

        data.forEach((row, idx) => {
          const label = row.display_name || row.canonical_id || 'Unknown';
          const count = Number(row.count || 0);

          const li = document.createElement('li');
          styleRowLi(li);

          const left = document.createElement('div');
          left.className = 'di-g-left';

          const rank = document.createElement('span');
          rank.className = 'di-g-rank';
          rank.textContent = String(idx + 1);

          const name = document.createElement('span');
          name.className = 'di-g-name';
          name.textContent = label;

          left.appendChild(rank);
          left.appendChild(name);

          const right = document.createElement('div');
          right.className = 'di-g-right';

          const countEl = document.createElement('span');
          countEl.className = 'di-g-count';
          countEl.textContent = String(count);

          const openBtn = document.createElement('button');
          openBtn.type = 'button';
          openBtn.textContent = 'Open';
          openBtn.setAttribute('data-di-open', '');

          const links = resolveLinks(label, category);
          const safe = (s) => (s || '').replace(/'/g, '');
          const payload = `{'aLabel':'${safe(links.aLabel)}','aUrl':'${safe(links.aUrl)}','bLabel':'${safe(links.bLabel)}','bUrl':'${safe(links.bUrl)}'}`;
          openBtn.setAttribute('data-di-links', payload);

          styleOpenButton(openBtn);

          right.appendChild(countEl);
          right.appendChild(openBtn);

          li.appendChild(left);
          li.appendChild(right);
          ul.appendChild(li);
        });

        globalMount.textContent = '';
        globalMount.appendChild(ul);
      } catch (err) {
        globalMount.textContent = 'Could not load global rankings.';
        console.error('[Splash] Global list load failed:', err);
      }
    })();
  }

  /* =========================
     FORM SUBMISSION (OVERWRITE)
     + Predict bind for Music Albums
     + Canonical-based diff update
     + Global diff baseline from "global applied snapshot"
  ========================== */
  document.querySelectorAll('form').forEach((formEl) => {
    if (!formEl.querySelector('input[name="rank1"]')) return;

    const category = (formEl.getAttribute('data-category') || 'items').trim().toLowerCase();

    applyLastListToForm(formEl);

    if (isAlbumsCategory(category)) {
      getRankInputs(formEl).forEach(inp => {
        enablePrefilledBehavior(inp);
        bindPredictToInput(inp, category);
      });
    }

    formEl.addEventListener('submit', async (event) => {
      event.preventDefault();

      const submitBtn = formEl.querySelector('[type="submit"]');
      const originalBtnValue = submitBtn ? submitBtn.value : null;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.value = 'Saving...';
      }

      const parent = getParentFromCategory(category);
      if (parent) setLastParent(parent);

      const newValues = [1,2,3,4,5].map(i =>
        (formEl.querySelector(`input[name="rank${i}"]`)?.value || '').trim()
      );

      // Keep your local snapshot behavior (unchanged)
      saveLastList(category, newValues);

      // V22.8: anti-junk gate (NEW)
      const verdict = validateTop5(newValues);
      if (!verdict.ok) {
        alert(verdict.msg);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.value = originalBtnValue || 'Submit';
        }
        return;
      }

      try {
        // V22.8: no-change guard (NEW)
        // If the DB already has this exact list, do NOT upsert, do NOT touch globals, do NOT change timestamps.
        const { data: existingRow, error: readErr } = await supabase
          .from('lists')
          .select('v1,v2,v3,v4,v5')
          .eq('user_id', viewerListId)  // IMPORTANT: writes are always for viewer identity
          .eq('category', category)
          .maybeSingle();

        // If read fails, we do not block saving (fail-open) — we proceed to upsert.
        if (!readErr && existingRow && valuesEqualRow(existingRow, newValues)) {
          // Ensure local applied snapshot stays aligned (optional but harmless)
          // We do NOT write to global_items.
          saveGlobalApplied(category, newValues);

          window.location.href =
            window.location.origin +
            RESULTS_PATH +
            `?category=${encodeURIComponent(category)}&listId=${encodeURIComponent(viewerListId)}`;
          return;
        }

        // Upsert list (unchanged)
        const { error: upErr } = await supabase
          .from('lists')
          .upsert({
            user_id: viewerListId,      // IMPORTANT: writes are always for viewer identity
            category: category,
            v1: newValues[0] || null,
            v2: newValues[1] || null,
            v3: newValues[2] || null,
            v4: newValues[3] || null,
            v5: newValues[4] || null
          }, { onConflict: 'user_id,category' });

        if (upErr) throw upErr;

        // Global diff baseline from local "applied snapshot" (unchanged)
        const appliedOld = loadGlobalApplied(category);
        const oldValuesForGlobal = appliedOld ? appliedOld : [];

        const cleanNew = newValues.filter(Boolean);
        const { added, removed } = diffCanonicalMultiset(oldValuesForGlobal, cleanNew);

        for (const r of removed) await decrementGlobalItemByCanonical(category, r.canon);
        for (const a of added)   await incrementGlobalItemByCanonical(category, a.canon, a.display);

        saveGlobalApplied(category, newValues);

        window.location.href =
          window.location.origin +
          RESULTS_PATH +
          `?category=${encodeURIComponent(category)}&listId=${encodeURIComponent(viewerListId)}`;

      } catch (err) {
        alert(`Save failed: ${err.message || err}`);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.value = originalBtnValue || 'Submit';
        }
      }
    });
  });
});
