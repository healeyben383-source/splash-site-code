// Archived reference snapshot — no functional change
// SPLASH FOOTER JS — V23.9 (Analytics Locked + Link Clicks Fixed)
// BASELINE: V23.8 (Analytics Locked)
// Adds: link_clicks logging via REST keepalive (constraint-safe: source + link_slot)
// - link_slot forced to 'A'/'B' only
// - source forced to 'user_top5'/'global_top100' only
// - non-blocking (never prevents opening link)

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

  /* =========================
     QW2 — ANALYTICS HELPER (FAIL-SILENT) + UUID HARDENING + QUEUE/FLUSH
     - session_id is uuid NOT NULL → MUST always be valid UUID
     - list_id is uuid nullable → only send if valid UUID else null
     - Never blocks UX, queue + flush in background
  ========================== */
  const ANALYTICS_SESSION_KEY = 'splash_session_id';
  const ANALYTICS_QUEUE_KEY = 'splash_analytics_queue_v1';
  const ANALYTICS_QUEUE_MAX = 200;
  const ANALYTICS_FLUSH_CHUNK = 25;

  function uuidv4Fallback(){
    // RFC4122-ish v4 fallback using Math.random (sufficient for session IDs)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = (c === 'x') ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  }

  function uuidOrNull(v){
    const s = String(v || '').trim();
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return re.test(s) ? s : null;
  }

  function getSessionId(){
    try {
      let sid = localStorage.getItem(ANALYTICS_SESSION_KEY);
      sid = uuidOrNull(sid);

      if (!sid) {
        sid = (crypto.randomUUID && crypto.randomUUID()) || uuidv4Fallback();
        localStorage.setItem(ANALYTICS_SESSION_KEY, sid);
      }
      return sid;
    } catch {
      // Must still return a UUID because session_id is uuid NOT NULL
      return (crypto.randomUUID && crypto.randomUUID()) || uuidv4Fallback();
    }
  }

  function readQueue(){
    try {
      const raw = localStorage.getItem(ANALYTICS_QUEUE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function writeQueue(arr){
    try {
      localStorage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(arr));
    } catch {
      // If storage is full or blocked, do nothing (fail-silent).
    }
  }

  function enqueueEvent(payload){
    try {
      const q = readQueue();
      q.push(payload);

      // Trim oldest if over cap
      if (q.length > ANALYTICS_QUEUE_MAX) {
        q.splice(0, q.length - ANALYTICS_QUEUE_MAX);
      }
      writeQueue(q);
    } catch {
      // silent
    }
  }

  let __FLUSHING__ = false;

  async function postAnalyticsBatchKeepalive(batch){
    // Supabase REST insert with keepalive to survive navigation better
    const url = `${SUPABASE_URL}/rest/v1/analytics_events`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(batch),
      keepalive: true
    });

    // 201/204 are typical for return=minimal inserts
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`analytics insert failed: ${res.status} ${txt || ''}`.trim());
    }
  }

  async function flushQueue(){
    if (__FLUSHING__) return;
    __FLUSHING__ = true;

    try {
      let q = readQueue();
      if (!q.length) return;

      // Send in chunks; remove only on success
      while (q.length) {
        const batch = q.slice(0, ANALYTICS_FLUSH_CHUNK);

        await postAnalyticsBatchKeepalive(batch);

        // Remove sent
        q = q.slice(batch.length);
        writeQueue(q);
      }
    } catch {
      // leave queue intact for next attempt
    } finally {
      __FLUSHING__ = false;
    }
  }

  // Flush on load and opportunistically
  flushQueue();
  setTimeout(flushQueue, 1500);
  setInterval(flushQueue, 15000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushQueue();
  }, { passive: true });

  window.addEventListener('pagehide', () => {
    flushQueue();
  }, { passive: true });

  function logEvent(event_name, meta = {}) {
    try {
      if (!event_name) return;

      const payload = {
        event_name,
        page: window.location.pathname || '',
        category: meta.category || null,
        list_id: uuidOrNull(meta.list_id),
        session_id: getSessionId(),
        meta
      };

      enqueueEvent(payload);
      flushQueue();
    } catch {
      // silent by design
    }
  }

/* =========================
   LINK CLICKS — keepalive insert (constraint-safe; fail-silent)
   Table: public.link_clicks
   Constraints:
     - link_slot must be 'A' or 'B'
     - source must be 'user_top5' or 'global_top100'
========================== */
async function insertLinkClickKeepalive(row){
  try {
    const payload = {
      category: row.category || null,
      canonical_id: row.canonical_id || null,
      display_name: row.display_name || null,

      // constraints
      link_slot: (row.link_slot === 'A' || row.link_slot === 'B') ? row.link_slot : null,
      link_label: row.link_label || null,
      source: (row.source === 'user_top5' || row.source === 'global_top100') ? row.source : null,

      page: row.page || (window.location.pathname || null),
      url: row.url || null,

      // keep list_id clean (your analytics uses uuidOrNull too)
      list_id: uuidOrNull(row.list_id),

      // IMPORTANT: enables join to analytics_events
      session_id: getSessionId()
    };

    // Hard guard against constraint failure
    if (!payload.category) return;
    if (!payload.link_slot) return;
    if (!payload.link_label) return;
    if (!payload.source) return;
    if (!payload.url) return;

    const endpoint = `${SUPABASE_URL}/rest/v1/link_clicks`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload),
      keepalive: true
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[Splash link_clicks] insert failed', res.status, txt, payload);
    } else {
      console.log('[Splash link_clicks] inserted', payload);
    }

  } catch (e) {
    console.error('[Splash link_clicks] exception', e);
  }
}



  /* =========================
     PARENT ROUTES + LABELS
  ========================== */
  const PARENT_ROUTES = {
    music:    '/music',
    movies:   '/movies',
    books:    '/books',
    tv:       '/tv',
    travel:   '/travel',
    food:     '/food',
    cars:     '/cars',
    games:    '/games',
    people:   '/people',
    wildcard: '/wildcard'
  };

  const PARENT_ALIASES = {
    book: 'books', books: 'books',
    movie: 'movies', movies: 'movies',
    music: 'music',
    tv: 'tv',
    travel: 'travel',
    food: 'food',
    cars: 'cars', car: 'cars',
    games: 'games', game: 'games',
    people: 'people', person: 'people',
    wildcard: 'wildcard'
  };

  const PARENT_DISPLAY = {
    music: 'Music',
    movies: 'Movies',
    books: 'Books',
    tv: 'TV',
    travel: 'Travel',
    food: 'Food',
    cars: 'Cars',
    games: 'Games',
    people: 'People',
    wildcard: 'Wildcard'
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
     QW3 — VISIT (one per page load)
  ========================== */
  const visitCategory = (categoryFromQuery || '').trim().toLowerCase() || null;
  logEvent('visit', {
    category: visitCategory,
    list_id: listId,
    is_island: isIslandPage(),
    is_owner: isIslandOwner
  });

  /* =========================
     ISLAND "CAPTURED ON" DATE (V22.7)
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
  ========================== */
  document.querySelectorAll('.island-button').forEach((btn) => {
    btn.textContent = 'My Desert Island →';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = window.location.origin + ISLAND_PATH + `?listId=${enc(viewerListId)}`;
    });
  });

  /* =========================
     SHARE BUTTON (ISLAND) — OWNERSHIP LOCK
  ========================== */
  document.querySelectorAll('.share-button').forEach((btn) => {

    if (isIslandPage() && !isIslandOwner) {
      btn.textContent = 'Make your own Splash';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = window.location.origin + '/';
      });
      return;
    }

    btn.textContent = 'Share my island';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();

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
     LINK RESOLVER (LOCKED 2-LINK MAP)
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
    const youtube= (q) => `https://www.youtube.com/results?search_query=${enc(q)}`;

    if (parent === 'music') {
      const plain = (artist ? `${title} ${artist}` : title).trim();
      if (sub === 'albums')  return { aLabel:'Spotify', aUrl:`https://open.spotify.com/search/${enc(plain)}`, bLabel:'Apple Music', bUrl:`https://music.apple.com/search?term=${enc(plain)}&entity=album` };
      if (sub === 'songs')   return { aLabel:'Spotify', aUrl:`https://open.spotify.com/search/${enc(plain)}`, bLabel:'Apple Music', bUrl:`https://music.apple.com/search?term=${enc(plain)}&entity=song` };
      if (sub === 'artists') return { aLabel:'Spotify', aUrl:`https://open.spotify.com/search/${enc(title)}`, bLabel:'Apple Music', bUrl:`https://music.apple.com/search?term=${enc(title)}&entity=musicArtist` };
      return { aLabel:'Spotify', aUrl:`https://open.spotify.com/search/${enc(plain)}`, bLabel:'Apple Music', bUrl:`https://music.apple.com/search?term=${enc(plain)}` };
    }

    if (parent === 'movies') return { aLabel:'IMDb', aUrl:`https://www.imdb.com/find/?q=${enc(title)}`, bLabel:'TMDB', bUrl:`https://www.themoviedb.org/search?query=${enc(title)}` };
    if (parent === 'tv')     return { aLabel:'IMDb', aUrl:`https://www.imdb.com/find/?q=${enc(title)}`, bLabel:'Google', bUrl: google(`${title} tv series`) };
    if (parent === 'books')  return { aLabel:'Goodreads', aUrl:`https://www.goodreads.com/search?q=${enc(title)}`, bLabel:'Google Books', bUrl:`https://www.google.com/search?tbm=bks&q=${enc(title)}` };
    if (parent === 'games')  return { aLabel:'Metacritic', aUrl:`https://www.metacritic.com/search/all/${enc(title)}/results`, bLabel:'Wikipedia', bUrl:`https://en.wikipedia.org/wiki/Special:Search?search=${enc(title)}` };
    if (parent === 'travel') return { aLabel:'Tripadvisor', aUrl:`https://www.tripadvisor.com/Search?q=${enc(title)}`, bLabel:'Maps', bUrl: maps(title) };
    if (parent === 'food')   return { aLabel:'Allrecipes', aUrl:`https://www.allrecipes.com/search?q=${enc(title)}`, bLabel:'Google', bUrl: google(`${title} recipe`) };
    if (parent === 'cars')   return { aLabel:'Google', aUrl: google(`${title} car`), bLabel:'YouTube', bUrl: youtube(`${title} car`) };

    return { aLabel:'Google', aUrl: google(title), bLabel:'Search', bUrl: google(title) };
  }

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

  /* =========================
     OPEN DIALOG (CREATE ONCE + LOCK SCROLL)
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

  function openInNewTab(url){
    const u = String(url || '').trim();
    if (!u || u === '#') return;
    window.open(u, '_blank', 'noopener,noreferrer');
  }

  // UPDATED: now accepts meta (category/source/list_id/display/canonical)
  function showOpenDialog(links, meta){
    const sheet = ensureOpenDialog();
    const body = sheet.querySelector('#diOpenBody');
    if (!body) return;

    const aLabel = (links && links.aLabel) ? String(links.aLabel) : '';
    const aUrl   = (links && links.aUrl) ? String(links.aUrl) : '';
    const bLabel = (links && links.bLabel) ? String(links.bLabel) : '';
    const bUrl   = (links && links.bUrl) ? String(links.bUrl) : '';

    body.innerHTML = '';

    const mkChoiceBtn = (slot, label, url) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'di-action-pill';
      btn.textContent = label || 'Open';

      btn.addEventListener('click', () => {
        // Log first (non-blocking), then open
        insertLinkClickKeepalive({
          category: meta?.category || null,
          canonical_id: meta?.canonical_id || null,
          display_name: meta?.display_name || null,
          link_slot: slot, // 'A' or 'B'
          link_label: String(label || ''),
          source: meta?.source || null, // 'user_top5' or 'global_top100'
          page: meta?.page || (window.location.pathname || ''),
          url: String(url || ''),
          list_id: meta?.list_id || null
        });

        openInNewTab(url);
      });

      return btn;
    };

    if (aUrl) body.appendChild(mkChoiceBtn('A', aLabel || 'Link 1', aUrl));
    if (bUrl) body.appendChild(mkChoiceBtn('B', bLabel || 'Link 2', bUrl));

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'di-action-pill';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.setAttribute('data-di-close','');
    cancelBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); hideOpenDialog(); });
    body.appendChild(cancelBtn);

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

  // UPDATED: reads meta and passes into dialog
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[data-di-open]');
    if (!btn) return;

    const raw = btn.getAttribute('data-di-links') || '';
    let links = null;
    try { links = JSON.parse(raw.replace(/'/g,'"')); } catch { links = null; }

    const rawMeta = btn.getAttribute('data-di-meta') || '';
    let meta = null;
    try { meta = rawMeta ? JSON.parse(rawMeta) : null; } catch { meta = null; }

    e.preventDefault();
    showOpenDialog(links || {}, meta || {});
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
     GLOBAL ITEMS HELPERS (diff + up/down)
  ========================== */
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
     FEATURE 2 — GLOBAL SKIP DEBUG (local only; no UX impact)
  ========================== */
  function recordGlobalSkip(category, value, reason){
    const key = `splash_global_skipped_${String(category || '').trim().toLowerCase()}`;
    const entry = { value: String(value || ''), reason: String(reason || ''), ts: new Date().toISOString() };

    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? (safeJsonParse(raw) || []) : [];
      arr.unshift(entry);
      localStorage.setItem(key, JSON.stringify(arr.slice(0, 40)));
    } catch(e) {}
  }

  /* =========================
     V22.8 — ANTI-JUNK VALIDATION (keeps freedom; blocks obvious garbage only)
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

    if (/^(.)\1{4,}$/.test(t)) return true;

    const alnumCount = (t.match(/[a-z0-9]/g) || []).length;
    if (alnumCount < Math.min(2, t.length)) {
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
     FEATURE 2 — CATEGORY PLAUSIBILITY → GLOBAL ELIGIBILITY (light-touch)
  ========================== */
  function looksLikePersonName(s){
    const t = String(s || '').trim();
    if (!t) return false;
    if (/\d/.test(t)) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) return false;
    const stop = ['the','and','of','for','with','a','an','in','on'];
    if (stop.includes(words[0].toLowerCase())) return false;
    const upperStarts = words.filter(w => /^[A-Z]/.test(w)).length;
    return upperStarts >= 2;
  }

  function looksLikeCarEntry(s){
    const t = String(s || '').trim();
    if (!t) return false;
    if (/\b(19\d{2}|20\d{2})\b/.test(t)) return true;
    if (/\b(gt|gti|type r|rs|ss|v8|v6|turbo|supercharged|coupe|sedan|wagon|convertible)\b/i.test(t)) return true;
    if (/\b(ford|holden|chevrolet|chevy|pontiac|dodge|plymouth|cadillac|buick|gmc|jeep|toyota|nissan|honda|mazda|subaru|bmw|mercedes|audi|volkswagen|vw|porsche|ferrari|lamborghini|jaguar|land rover|range rover|volvo|saab|alfa romeo|fiat|mini)\b/i.test(t)) return true;
    return false;
  }

  function globalEligibility(category, value){
    const parent = getParentFromCategory(category);
    const v = String(value || '').trim();
    if (!v) return { ok:false, reason:'empty' };

    if (isProbablyUrlOrEmail(v)) return { ok:false, reason:'url_or_email' };
    if (isObviousJunkToken(v)) return { ok:false, reason:'junk_token' };

    if (parent === 'people') {
      if (looksLikeCarEntry(v)) return { ok:false, reason:'looks_like_car_in_people' };
      return { ok:true, reason:'' };
    }

    if (parent === 'cars') {
      if (looksLikePersonName(v) && !looksLikeCarEntry(v)) return { ok:false, reason:'looks_like_person_in_cars' };
      return { ok:true, reason:'' };
    }

    return { ok:true, reason:'' };
  }

  function eligibleValuesForGlobal(category, values){
    const out = [];
    values.forEach(v => {
      const vv = String(v || '').trim();
      if (!vv) return;
      const g = globalEligibility(category, vv);
      if (g.ok) out.push(vv);
      else recordGlobalSkip(category, vv, g.reason || 'not_eligible');
    });
    return out;
  }

  /* =========================
     V22.8 — NO-CHANGE GUARD HELPERS
  ========================== */
  function valuesEqualRow(row, values){
    if (!row) return false;
    const rowVals = [row.v1, row.v2, row.v3, row.v4, row.v5].map(v => String(v || '').trim());
    const newVals = values.map(v => String(v || '').trim());
    return rowVals.join('||') === newVals.join('||');
  }

  function eligibleFromRow(category, row){
    if (!row) return [];
    const vals = [row.v1, row.v2, row.v3, row.v4, row.v5].map(v => String(v || '').trim());
    return eligibleValuesForGlobal(category, vals);
  }

  /* =========================
     RESULTS PAGE (render lists)
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

    // QW3 — results_view
    logEvent('results_view', {
      category: (urlParams.get('category') || '').trim().toLowerCase() || null,
      list_id: viewerListId
    });

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

            // NEW: meta for link_clicks (source + slot constraints)
            const meta = {
              category: category,
              canonical_id: canonicalFromDisplay(v),
              display_name: v,
              source: 'user_top5',
              page: '/results',
              list_id: viewerListId
            };
            openBtn.setAttribute('data-di-meta', JSON.stringify(meta));

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
          .select('display_name, canonical_id, category, count')
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

          // NEW: meta for link_clicks (source + slot constraints)
          const meta = {
            category: category,
            canonical_id: canonicalFromDisplay(label),
            display_name: label,
            source: 'global_top100',
            page: '/results',
            list_id: viewerListId
          };
          openBtn.setAttribute('data-di-meta', JSON.stringify(meta));

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
     + Global diff baseline from:
        - localStorage snapshot if present
        - otherwise Supabase existing row
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

      // QW3 — submit_click
      logEvent('submit_click', { category, list_id: viewerListId });

      const parent = getParentFromCategory(category);
      if (parent) setLastParent(parent);

      const newValues = [1,2,3,4,5].map(i =>
        (formEl.querySelector(`input[name="rank${i}"]`)?.value || '').trim()
      );

      saveLastList(category, newValues);
      // =========================
      // HARD REQUIREMENT: ALL 5 FILLED (shows inline message; no browser tooltip)
      // =========================
      const errorTextEl = formEl.querySelector('.form-error-text');

      // Hide helper
      const hideFormError = () => {
        if (!errorTextEl) return;
        errorTextEl.style.display = 'none';
        errorTextEl.setAttribute('aria-hidden', 'true');
      };

      // Show helper
      const showFormError = (msg) => {
        if (!errorTextEl) return;
        errorTextEl.textContent = msg || 'Please enter all five before submitting.';
        errorTextEl.style.display = 'block';
        errorTextEl.setAttribute('aria-hidden', 'false');
      };

      // Always start hidden on submit attempt (prevents “sticky” error)
      hideFormError();

      const allFiveFilled = newValues.every(v => String(v || '').trim().length > 0);

      if (!allFiveFilled) {
        // Optional analytics hook (keeps your QW3 style consistent)
        logEvent('submit_error', {
          category,
          list_id: viewerListId,
          reason: 'missing_required',
          message: 'Not all five fields filled'
        });

        showFormError('Please enter all five before submitting.');

        // Re-enable button + exit early (no alerts, no tooltips)
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.value = originalBtnValue || 'Submit';
        }
        return;
      }

      const verdict = validateTop5(newValues);
      if (!verdict.ok) {
        // QW3 — submit_error (validation)
        logEvent('submit_error', {
          category,
          list_id: viewerListId,
          reason: 'validation',
          message: verdict.msg
        });

        alert(verdict.msg);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.value = originalBtnValue || 'Submit';
        }
        return;
      }

      try {
        const { data: existingRow, error: readErr } = await supabase
          .from('lists')
          .select('v1,v2,v3,v4,v5')
          .eq('user_id', viewerListId)
          .eq('category', category)
          .maybeSingle();

        const hadExisting = !!existingRow;
        const changed = (hadExisting && !valuesEqualRow(existingRow, newValues));

        // No-change submit guard
        if (!readErr && existingRow && valuesEqualRow(existingRow, newValues)) {
          const eligibleNew = eligibleValuesForGlobal(category, newValues);
          saveGlobalApplied(category, eligibleNew);

          // QW3 — submit_success (no-change)
          logEvent('submit_success', {
            category,
            list_id: viewerListId,
            changed: false
          });

          window.location.href =
            window.location.origin +
            RESULTS_PATH +
            `?category=${encodeURIComponent(category)}&listId=${encodeURIComponent(viewerListId)}`;
          return;
        }

        // Upsert the latest list (always)
        const { error: upErr } = await supabase
          .from('lists')
          .upsert({
            user_id: viewerListId,
            category: category,
            v1: newValues[0] || null,
            v2: newValues[1] || null,
            v3: newValues[2] || null,
            v4: newValues[3] || null,
            v5: newValues[4] || null
          }, { onConflict: 'user_id,category' });

        if (upErr) throw upErr;

        // Baseline selection (prevents drift)
        const appliedOld = loadGlobalApplied(category);
        const oldValuesForGlobal = appliedOld
          ? appliedOld
          : eligibleFromRow(category, existingRow);

        const eligibleNew = eligibleValuesForGlobal(category, newValues);

        const { added, removed } = diffCanonicalMultiset(oldValuesForGlobal, eligibleNew);

        // QW3 — item_changed (only when a saved list actually changes)
        if (changed) {
          logEvent('item_changed', {
            category,
            list_id: viewerListId,
            added: added.length,
            removed: removed.length
          });
        }

        for (const r of removed) await decrementGlobalItemByCanonical(category, r.canon);
        for (const a of added)   await incrementGlobalItemByCanonical(category, a.canon, a.display);

        saveGlobalApplied(category, eligibleNew);

        // QW3 — submit_success (changed)
        logEvent('submit_success', {
          category,
          list_id: viewerListId,
          changed: true,
          added: added.length,
          removed: removed.length
        });

        window.location.href =
          window.location.origin +
          RESULTS_PATH +
          `?category=${encodeURIComponent(category)}&listId=${encodeURIComponent(viewerListId)}`;

      } catch (err) {
        // QW3 — submit_error (exception)
        logEvent('submit_error', {
          category,
          list_id: viewerListId,
          reason: 'exception',
          message: String(err && (err.message || err) || 'unknown')
        });

        alert(`Save failed: ${err.message || err}`);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.value = originalBtnValue || 'Submit';
        }
      }
    });
  });
});
