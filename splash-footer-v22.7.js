// Archived reference snapshot — functional change (Global List scroll fade hint)
// SPLASH FOOTER JS — V24.3.6 (Global List fade hint; keeps V24.3.5 analytics hardening + offline messaging)
// BASELINE: V24.3.5
// Adds:
//  - Results page: Global list shows a subtle bottom fade when scrollable
//  - Fade auto-hides if not scrollable or when near bottom
// Non-goals:
//  - No changes to analytics, submissions, link clicks, routing, or global logic

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
  ========================== */
  const ANALYTICS_SESSION_KEY = 'splash_session_id';
  const ANALYTICS_QUEUE_KEY = 'splash_analytics_queue_v1';
  const ANALYTICS_QUEUE_MAX = 200;
  const ANALYTICS_FLUSH_CHUNK = 25;

  function uuidv4Fallback(){
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
    try { localStorage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(arr)); } catch {}
  }

  function enqueueEvent(payload){
    try {
      const q = readQueue();
      q.push(payload);
      if (q.length > ANALYTICS_QUEUE_MAX) q.splice(0, q.length - ANALYTICS_QUEUE_MAX);
      writeQueue(q);
    } catch {}
  }

  let __FLUSHING__ = false;

  // ✅ V24.3.5: post a single row (not an array batch)
  async function postAnalyticsOneKeepalive(row){
    const url = `${SUPABASE_URL}/rest/v1/analytics_events`;

    // ✅ text-safe meta: stringify to avoid schema mismatch 400s
    const safeRow = { ...row };
    try {
      if (safeRow.meta && typeof safeRow.meta === 'object') {
        safeRow.meta = JSON.stringify(safeRow.meta);
      }
    } catch {
      safeRow.meta = null;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(safeRow),
      keepalive: true
    });

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

      while (q.length) {
        const batch = q.slice(0, ANALYTICS_FLUSH_CHUNK);

        // ✅ row-by-row to avoid PostgREST bulk edge cases
        for (const row of batch) {
          await postAnalyticsOneKeepalive(row);
        }

        q = q.slice(batch.length);
        writeQueue(q);
      }
    } catch {
      // leave queue intact
    } finally {
      __FLUSHING__ = false;
    }
  }

  flushQueue();
  setTimeout(flushQueue, 1500);
  setInterval(flushQueue, 15000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushQueue();
  }, { passive: true });

  window.addEventListener('pagehide', () => { flushQueue(); }, { passive: true });

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
    } catch {}
  }

  /* =========================
     BETA ERROR UI (FAIL-SOFT)
  ========================== */
  function ensureToastHost(){
    let host = document.getElementById('splash-toast-host');
    if (host) return host;

    host = document.createElement('div');
    host.id = 'splash-toast-host';
    host.style.position = 'fixed';
    host.style.left = '12px';
    host.style.right = '12px';
    host.style.bottom = '12px';
    host.style.zIndex = '99999';
    host.style.display = 'flex';
    host.style.flexDirection = 'column';
    host.style.gap = '10px';
    host.style.pointerEvents = 'none';
    document.body.appendChild(host);
    return host;
  }

  function toast(message, kind = 'error', ttl = 4200){
    try {
      const host = ensureToastHost();
      const card = document.createElement('div');
      card.setAttribute('role', 'status');
      card.style.pointerEvents = 'auto';
      card.style.padding = '12px 14px';
      card.style.borderRadius = '12px';
      card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
      card.style.backdropFilter = 'blur(8px)';
      card.style.display = 'flex';
      card.style.alignItems = 'center';
      card.style.justifyContent = 'space-between';
      card.style.gap = '12px';
      card.style.fontSize = '14px';

      if (kind === 'success') {
        card.style.background = 'rgba(20, 110, 60, 0.92)';
        card.style.color = '#fff';
      } else if (kind === 'info') {
        card.style.background = 'rgba(20, 50, 90, 0.92)';
        card.style.color = '#fff';
      } else {
        card.style.background = 'rgba(120, 35, 35, 0.92)';
        card.style.color = '#fff';
      }

      const msg = document.createElement('div');
      msg.textContent = String(message || 'Something went wrong.');
      msg.style.flex = '1 1 auto';

      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.setAttribute('aria-label', 'Dismiss');
      x.style.border = 'none';
      x.style.background = 'transparent';
      x.style.color = 'inherit';
      x.style.fontSize = '18px';
      x.style.cursor = 'pointer';
      x.addEventListener('click', () => card.remove());

      card.appendChild(msg);
      card.appendChild(x);
      host.appendChild(card);

      setTimeout(() => { try { card.remove(); } catch(e) {} }, ttl);
    } catch {}
  }

  function setInlineError(formEl, msg){
    try {
      const errorTextEl = formEl && formEl.querySelector && formEl.querySelector('.form-error-text');
      if (!errorTextEl) return false;

      if (!msg) {
        errorTextEl.style.display = 'none';
        errorTextEl.setAttribute('aria-hidden', 'true');
        return true;
      }

      errorTextEl.textContent = String(msg);
      errorTextEl.style.display = 'block';
      errorTextEl.setAttribute('aria-hidden', 'false');
      return true;
    } catch {
      return false;
    }
  }

  /* =========================
     LINK CLICKS — keepalive insert (constraint-safe; fail-silent)
  ========================== */
  async function insertLinkClickKeepalive(row){
    try {
      const payload = {
        category: row.category || null,
        canonical_id: row.canonical_id || null,
        display_name: row.display_name || null,
        link_slot: (row.link_slot === 'A' || row.link_slot === 'B') ? row.link_slot : null,
        link_label: row.link_label || null,
        source: (row.source === 'user_top5' || row.source === 'global_top100') ? row.source : null,
        page: row.page || (window.location.pathname || null),
        url: row.url || null,
        list_id: uuidOrNull(row.list_id),
        session_id: getSessionId()
      };

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
/* =========================
   HOME "YOUR ISLAND" VISIBILITY GATE — V24.3.7 (ADD-ONLY)
   Purpose:
   - On Home (/), hide Island button until at least one successful submit
   - Does NOT affect Results or Island pages
========================= */
const HAS_SUBMITTED_ONCE_KEY = 'splash_has_submitted_top5';

const isHomePage = () => {
  const p = pathNow();
  return p === '' || p === '/';
};

function setHasSubmittedOnce(){
  try { localStorage.setItem(HAS_SUBMITTED_ONCE_KEY, '1'); } catch(e) {}
}

function hasSubmittedOnce(){
  try { return localStorage.getItem(HAS_SUBMITTED_ONCE_KEY) === '1'; } catch(e) { return false; }
}

// Home-only targeting; safe even if .island-button is reused elsewhere
function getHomeIslandButtons(){
  return Array.from(document.querySelectorAll(
    [
      '.home-island-button',
      '.your-island-button',
      '.island-home-button',
      '.nav-island-button',
      '.island-button'
    ].join(',')
  ));
}

function applyHomeIslandGate(){
  try {
    if (!isHomePage()) return;

    const btns = getHomeIslandButtons();
    if (!btns.length) return;

    const allowed = hasSubmittedOnce();

    btns.forEach((btn) => {
      if (!allowed) {
        btn.style.display = 'none';
        btn.setAttribute('aria-hidden', 'true');
        btn.setAttribute('tabindex', '-1');
      } else {
        btn.style.display = '';
        btn.removeAttribute('aria-hidden');
        btn.removeAttribute('tabindex');
      }
    });
  } catch(e) {}
}
/* =========================
   HOME "YOUR ISLAND" GATE — HYBRID RESOLVER (V24.3.9 ADD-ONLY)
   Behavior:
   - Home-only
   - If local flag missing, do a one-time Supabase check:
     does viewerListId have at least 1 row in lists?
   - If yes, set local flag and re-apply gate (button appears)
   - Fail-soft: any error leaves button hidden (no breakage)
========================= */
function initHomeIslandGateHybrid(viewerListId){
  try {
    if (!isHomePage()) return;
    if (!viewerListId) return;

    // Always apply local gate immediately
    applyHomeIslandGate();

    // Already eligible → no Supabase call
    if (hasSubmittedOnce()) return;

    // One-shot guard
    if (window.__SPLASH_HOME_GATE_CHECKED__) return;
    window.__SPLASH_HOME_GATE_CHECKED__ = true;

    // Defer slightly to avoid Webflow timing issues
    setTimeout(async () => {
      try {
        if (!isHomePage()) return;
        if (hasSubmittedOnce()) { applyHomeIslandGate(); return; }

        const { data, error } = await supabase
          .from('lists')
          .select('id')
          .eq('user_id', viewerListId)
          .limit(1);

        if (error) return;

        if (Array.isArray(data) && data.length > 0) {
          setHasSubmittedOnce();
          applyHomeIslandGate();
        }
      } catch(e) {
        // fail-soft
      }
    }, 250);

  } catch(e) {
    // fail-soft
  }
}

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
     LIST ID (Ownership-safe)
  ========================== */
  const LIST_ID_KEY = 'splash_list_id';

  // ✅ Note: V24.3.6 keeps your existing behavior. If you want true UUID-only here later, we can tighten it.
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
  
  // ✅ Home Island Gate (Hybrid): resolve visibility after viewerListId exists
initHomeIslandGateHybrid(viewerListId);
/* =========================
   HOME → ISLAND BUTTON ROUTE (ADD-ONLY)
========================= */
if (isHomePage()) {
  document
    .querySelectorAll('.nav-island-button')
    .forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();

        // Safety: require a list id
        if (!viewerListId) return;

        window.location.href =
          `${window.location.origin}${ISLAND_PATH}?listId=${encodeURIComponent(viewerListId)}`;
      });
    });
}

  const urlParams = new URLSearchParams(window.location.search);
  const categoryFromQuery = urlParams.get('category') || '';

  const islandListId = isIslandPage() ? (urlParams.get('listId') || '') : '';
  const listId = (isIslandPage() && islandListId) ? islandListId : viewerListId;

  const isIslandOwner = !isIslandPage()
    ? true
    : ((islandListId || viewerListId) === viewerListId);

  /* =========================
     VISIT (one per page load)
  ========================== */
  const visitCategory = (categoryFromQuery || '').trim().toLowerCase() || null;
  logEvent('visit', {
    category: visitCategory,
    list_id: listId,
    is_island: isIslandPage(),
    is_owner: isIslandOwner
  });
/* =========================
   ISLAND RETURN SIGNAL + ANALYTICS — V24.3.10 (ADD-ONLY)
   Purpose:
   - Instrument Island as a destination (view + return)
   - Show ONE quiet signal if Island was updated since last Island visit
   Non-goals:
   - No gating changes
   - No UI refactors; uses existing toast()
========================= */

const LAST_ISLAND_VIEW_AT_KEY     = 'splash_last_island_view_at';
const LAST_SUBMIT_SUCCESS_AT_KEY  = 'splash_last_submit_success_at';

function readIsoTime(key){
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  } catch (e) { return null; }
}

function writeIsoNow(key){
  try { localStorage.setItem(key, new Date().toISOString()); } catch (e) {}
}

if (isIslandPage()) {
  const prevIslandViewAt = readIsoTime(LAST_ISLAND_VIEW_AT_KEY);

  // Always log island_view
  logEvent('island_view', {
    list_id: listId,
    is_owner: isIslandOwner
  });

  // If we have any prior island view timestamp, this is a return visit
  if (prevIslandViewAt) {
    logEvent('island_return', {
      list_id: listId,
      is_owner: isIslandOwner
    });
  }

  // Quiet update signal for OWNER only (avoid confusing viewers)
  const lastSubmitAt = readIsoTime(LAST_SUBMIT_SUCCESS_AT_KEY);

  if (isIslandOwner && lastSubmitAt && (!prevIslandViewAt || lastSubmitAt > prevIslandViewAt)) {
    toast('Your Island has been updated since your last visit.', 'info', 4200);

    logEvent('island_update_signal_shown', {
      list_id: listId
    });
  }

  // Update last island view timestamp at end
  writeIsoNow(LAST_ISLAND_VIEW_AT_KEY);
}

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
     CLEANUP: remove any old MusicBrainz suggest boxes if present (from older builds)
  ========================== */
  document.querySelectorAll('.splash-suggest').forEach(el => el.remove());

  /* =========================
   BACK BUTTONS (SMART ROUTING) — ISLAND → HOME OVERRIDE
   Change:
   - Results: unchanged (Back to choices → parent category route)
   - Island: Back goes to Home (/)
========================= */
document.querySelectorAll('.back-button').forEach((btn) => {
  const currentPath = pathNow();
  const isParentPage = Object.values(PARENT_ROUTES).some(route => stripTrailingSlash(route) === currentPath);

  let parent = '';
  if (isResultsPage() || isIslandPage()) {
    parent = getParentFromCategory(categoryFromQuery) || getLastParent();
  } else {
    parent = getParentFromPath() || getLastParent();
  }

  // ✅ LABELS
  if (isIslandPage()) {
    btn.textContent = '← Back to Home';
  } else if (isResultsPage() && parent && PARENT_ROUTES[parent]) {
    btn.textContent = '← Back to choices';
  } else if (!isParentPage && parent && PARENT_ROUTES[parent]) {
    btn.textContent = `← Back to ${PARENT_DISPLAY[parent] || parent}`;
  } else {
    btn.textContent = '← Back to Home';
  }

  // ✅ ROUTES
  btn.addEventListener('click', (e) => {
    e.preventDefault();

    // Island always returns Home
    if (isIslandPage()) {
      window.location.href = window.location.origin + '/';
      return;
    }

    // Results → back to category choices
    if (isResultsPage() && parent && PARENT_ROUTES[parent]) {
      window.location.href = window.location.origin + PARENT_ROUTES[parent];
      return;
    }

    // Other pages: back to inferred parent
    if (!isParentPage && parent && PARENT_ROUTES[parent]) {
      window.location.href = window.location.origin + PARENT_ROUTES[parent];
      return;
    }

    // Fallback
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
applyHomeIslandGate();

  /* =========================
     SHARE BUTTON (ISLAND) — OWNERSHIP LOCK
  ========================== */
  document.querySelectorAll('.share-button').forEach((btn) => {

   if (isIslandPage() && !isIslandOwner) {
  btn.textContent = 'Make your own Splash';
  btn.addEventListener('click', (e) => {
    e.preventDefault();

    // If they've already successfully submitted at least once on THIS browser,
    // route them straight to THEIR island identity. Otherwise send them Home.
    let allowed = false;
    try { allowed = localStorage.getItem('splash_has_submitted_top5') === '1'; } catch (err) {}

    if (allowed) {
      window.location.href =
        window.location.origin + ISLAND_PATH + `?listId=${enc(viewerListId)}`;
    } else {
      window.location.href = window.location.origin + '/';
    }
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
    const amazon = (q) => `https://www.amazon.com/s?k=${enc(q)}`;


    if (parent === 'music') {
      const plain = (artist ? `${title} ${artist}` : title).trim();
      if (sub === 'albums')  return { aLabel:'Spotify', aUrl:`https://open.spotify.com/search/${enc(plain)}`, bLabel:'Apple Music', bUrl:`https://music.apple.com/search?term=${enc(plain)}&entity=album` };
      if (sub === 'songs')   return { aLabel:'Spotify', aUrl:`https://open.spotify.com/search/${enc(plain)}`, bLabel:'Apple Music', bUrl:`https://music.apple.com/search?term=${enc(plain)}&entity=song` };
      if (sub === 'artists') return { aLabel:'Spotify', aUrl:`https://open.spotify.com/search/${enc(title)}`, bLabel:'Apple Music', bUrl:`https://music.apple.com/search?term=${enc(title)}&entity=musicArtist` };
      return { aLabel:'Spotify', aUrl:`https://open.spotify.com/search/${enc(plain)}`, bLabel:'Apple Music', bUrl:`https://music.apple.com/search?term=${enc(plain)}` };
    }

    if (parent === 'movies') return { aLabel:'IMDb', aUrl:`https://www.imdb.com/find/?q=${enc(title)}`, bLabel:'Amazon', bUrl:`https://www.amazon.com/s?k=${enc(title)}+movie` };
    if (parent === 'tv')     return { aLabel:'IMDb', aUrl:`https://www.imdb.com/find/?q=${enc(title)}`, bLabel:'Google', bUrl: google(`${title} tv series`) };
    if (parent === 'books')  return { aLabel:'Goodreads', aUrl:`https://www.goodreads.com/search?q=${enc(title)}`, bLabel:'Amazon', bUrl:`https://www.amazon.com/s?k=${enc(title)}` };
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
        insertLinkClickKeepalive({
          category: meta?.category || null,
          canonical_id: meta?.canonical_id || null,
          display_name: meta?.display_name || null,
          link_slot: slot,
          link_label: String(label || ''),
          source: meta?.source || null,
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
/* =========================
   GLOBAL ITEMS ALIASING (BETA CLEANUP) — V24.3.7 (ADD-ONLY)
   Purpose:
   - Map common variants/typos to one canonical display string
   - Prevent global_items splitting (e.g., Prog Rock / Progressive Rock)
   Notes:
   - Increment path: uses display → aliases → canonical override
   - Decrement path: aliases canonical variants to the unified canonical
========================== */
function normalizeAliasCategory(category){
  const c = String(category || '').trim().toLowerCase();
  // Apply aliasing to music-genres and any subcategory variations
  if (c === 'music-genres' || c.startsWith('music-genres-')) return 'music-genres';
  return c;
}

function applyGlobalAliases(category, display) {
  const cat = normalizeAliasCategory(category);
  const key = String(display || '').trim().toLowerCase();

  const ALIASES = {
    'music-genres': {
      'prog rock': 'Progressive Rock',
      'prog-rock': 'Progressive Rock', // ✅ add hyphen form too
      'prog roock': 'Progressive Rock',
      'progressive rock': 'Progressive Rock'
    }
  };

  return (ALIASES[cat] && ALIASES[cat][key]) ? ALIASES[cat][key] : display;
}

function applyGlobalCanonicalAliases(category, canonical) {
  const cat = normalizeAliasCategory(category);
  const canon = String(canonical || '').trim().toLowerCase();

  const CANON_ALIASES = {
    'music-genres': {
      'prog-rock': 'progressive-rock',
      'prog-roock': 'progressive-rock',
      'progressive-rock': 'progressive-rock'
    }
  };

  return (CANON_ALIASES[cat] && CANON_ALIASES[cat][canon]) ? CANON_ALIASES[cat][canon] : canonical;
}


  async function incrementGlobalItemByCanonical(category, canonical, display){
   let disp = normText(display);
disp = applyGlobalAliases(category, disp);

// Force canonical to match aliased display (prevents fragmentation)
let canon = String(canonical || '').trim();
const aliasCanon = canonicalFromDisplay(disp);
if (aliasCanon) canon = aliasCanon;

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

  if (insErr) {
    // 23505 = unique_violation (Postgres)
    if (insErr.code === '23505') {
      // Row already exists due to race or alias convergence — increment instead
      const { data: existing2, error: selErr2 } = await supabase
        .from('global_items')
        .select('id, count')
        .eq('category', category)
        .eq('canonical_id', canon)
        .maybeSingle();

      if (selErr2 || !existing2) throw selErr2;

      const { error: upErr2 } = await supabase
        .from('global_items')
        .update({ count: Number(existing2.count || 0) + 1 })
        .eq('id', existing2.id);

      if (upErr2) throw upErr2;
    } else {
      throw insErr;
    }
  }
}

  }

  async function decrementGlobalItemByCanonical(category, canonical){
    let canon = String(canonical || '').trim();
    if (!canon) return;

    // Keep decrement aligned with increment aliasing (prevents count drift)
    canon = applyGlobalCanonicalAliases(category, canon);

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
     FEATURE 2 — GLOBAL SKIP DEBUG
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
     ANTI-JUNK VALIDATION
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
     CATEGORY PLAUSIBILITY → GLOBAL ELIGIBILITY (light-touch)
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
   GLOBAL VOTE DEDUPE (PER LIST) — V24.3.11 (ADD-ONLY)
   Purpose:
   - Prevent multiple votes for the same canonical item within ONE Top 5 submission
   - Does NOT change what the user typed/saved in lists table
   - Only affects global_items increment/decrement diff set
========================= */
function dedupeValuesForGlobalByCanonical(category, values){
  const seen = new Set();
  const out = [];

  (values || []).forEach((raw) => {
    const v = String(raw || '').trim();
    if (!v) return;

    // Apply display aliasing first
    const disp = applyGlobalAliases(category, v);

    // Canonical from aliased display
    let canon = canonicalFromDisplay(disp);
    if (!canon) return;

    // Canonical alias convergence
    canon = applyGlobalCanonicalAliases(category, canon);

    if (seen.has(canon)) return;
    seen.add(canon);

    out.push(disp);
  });

  return out;
}

  /* =========================
     NO-CHANGE GUARD HELPERS
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
     GLOBAL LIST SCROLL FADE (RESULTS) — V24.3.6 (ADD-ONLY)
     Purpose: visual hint that #globalList is scrollable (fade-out at bottom).
     - Creates an overlay inside #globalList without intercepting clicks.
     - Auto-hides if not scrollable or when scrolled near bottom.
  ========================== */
  function ensureGlobalFadeStyles(){
    if (document.getElementById('splash-global-fade-styles')) return;

    const style = document.createElement('style');
    style.id = 'splash-global-fade-styles';
    style.textContent = `
      #globalList.splash-fade-host { position: relative; }
      #globalList .splash-scroll-fade-bottom {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 44px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 180ms ease;
      }
      #globalList .splash-scroll-fade-bottom.is-visible { opacity: 1; }
    `;
    document.head.appendChild(style);
  }

  function isTransparentBg(bg){
    const s = String(bg || '').trim().toLowerCase();
    return !s || s === 'transparent' || s === 'rgba(0, 0, 0, 0)';
  }

  function findOpaqueBackgroundColor(startEl){
    let el = startEl;
    let hops = 0;
    while (el && hops < 12) {
      const bg = window.getComputedStyle(el).backgroundColor;
      if (!isTransparentBg(bg)) return bg;
      el = el.parentElement;
      hops++;
    }
    return 'rgb(255, 255, 255)';
  }

  function setupGlobalListFade(globalMount){
    try {
      if (!globalMount) return;

      ensureGlobalFadeStyles();
      globalMount.classList.add('splash-fade-host');

      let fade = globalMount.querySelector('.splash-scroll-fade-bottom');
      if (!fade) {
        fade = document.createElement('div');
        fade.className = 'splash-scroll-fade-bottom';
        globalMount.appendChild(fade);
      }

      const bg = findOpaqueBackgroundColor(globalMount);
      fade.style.background = `linear-gradient(to bottom, rgba(255,255,255,0), ${bg})`;

      const update = () => {
        const scrollable = globalMount.scrollHeight > (globalMount.clientHeight + 2);
        if (!scrollable) {
          fade.classList.remove('is-visible');
          return;
        }

        const remaining = globalMount.scrollHeight - globalMount.clientHeight - globalMount.scrollTop;
        const nearBottom = remaining <= 6;

        if (nearBottom) fade.classList.remove('is-visible');
        else fade.classList.add('is-visible');
      };

      if (!globalMount.__SPLASH_FADE_BOUND__) {
        globalMount.__SPLASH_FADE_BOUND__ = true;

        globalMount.addEventListener('scroll', update, { passive: true });

        let t = null;
        window.addEventListener('resize', () => {
          clearTimeout(t);
          t = setTimeout(update, 120);
        }, { passive: true });

        requestAnimationFrame(() => requestAnimationFrame(update));
      } else {
        requestAnimationFrame(() => requestAnimationFrame(update));
      }
    } catch {}
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

    const __cat = (urlParams.get('category') || '').trim();
    if (!__cat) {
      toast('Missing category. Please go back and choose a category again.', 'error', 6500);

      const userList = document.getElementById('userList');
      const globalMount = document.getElementById('globalList');

      if (userList) userList.innerHTML = '<li>No category selected.</li>';
      if (globalMount) globalMount.textContent = 'No category selected.';
      return;
    }

    logEvent('results_view', {
      category: (urlParams.get('category') || '').trim().toLowerCase() || null,
      list_id: viewerListId
    });

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
      } catch (err) {
        userList.innerHTML = '<li>Could not load your list. <button type="button" style="margin-left:8px;cursor:pointer;" onclick="window.location.reload()">Retry</button></li>';
        toast('Could not load your saved list.', 'error');
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

        // ✅ V24.3.6 add-only: visual scroll hint (fade-out at bottom)
        setupGlobalListFade(globalMount);

      } catch (err) {
        globalMount.innerHTML = 'Could not load global rankings. <button type="button" style="margin-left:8px;cursor:pointer;" onclick="window.location.reload()">Retry</button>';
        toast('Could not load Global Splash (Top 100).', 'error');
      }
    })();
  }

  /* =========================
     FORM SUBMISSION (OVERWRITE)
  ========================== */
  document.querySelectorAll('form').forEach((formEl) => {
    if (!formEl.querySelector('input[name="rank1"]')) return;

    const category = (formEl.getAttribute('data-category') || 'items').trim().toLowerCase();

    applyLastListToForm(formEl);

    if (isAlbumsCategory(category)) {
      getRankInputs(formEl).forEach(enablePrefilledBehavior);
    }

    formEl.addEventListener('submit', async (event) => {
      event.preventDefault();

      const submitBtn = formEl.querySelector('[type="submit"]');
      const originalBtnValue = submitBtn ? submitBtn.value : null;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.value = 'Saving...';
      }

      setInlineError(formEl, null);

      logEvent('submit_click', { category, list_id: viewerListId });

      const parent = getParentFromCategory(category);
      if (parent) setLastParent(parent);

      const newValues = [1,2,3,4,5].map(i =>
        (formEl.querySelector(`input[name="rank${i}"]`)?.value || '').trim()
      );

      saveLastList(category, newValues);

      const allFiveFilled = newValues.every(v => String(v || '').trim().length > 0);

      if (!allFiveFilled) {
        logEvent('submit_error', {
          category,
          list_id: viewerListId,
          reason: 'missing_required',
          message: 'Not all five fields filled'
        });

        setInlineError(formEl, 'Please enter all five before submitting.');

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.value = originalBtnValue || 'Submit';
        }
        return;
      }

      const verdict = validateTop5(newValues);
      if (!verdict.ok) {
        logEvent('submit_error', {
          category,
          list_id: viewerListId,
          reason: 'validation',
          message: verdict.msg
        });

        if (!setInlineError(formEl, verdict.msg)) toast(verdict.msg, 'error');

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

        if (!readErr && existingRow && valuesEqualRow(existingRow, newValues)) {
          const eligibleNewRaw = eligibleValuesForGlobal(category, newValues);
          const eligibleNew = dedupeValuesForGlobalByCanonical(category, eligibleNewRaw);

          saveGlobalApplied(category, eligibleNew);

          logEvent('submit_success', {
            category,
            list_id: viewerListId,
            changed: false
          });
// ✅ Home Island Gate: mark eligible after first successful submit
try { localStorage.setItem('splash_has_submitted_top5', '1'); } catch(e) {}
try { localStorage.setItem('splash_last_submit_success_at', new Date().toISOString()); } catch(e) {}

          window.location.href =
            window.location.origin +
            RESULTS_PATH +
            `?category=${encodeURIComponent(category)}&listId=${encodeURIComponent(viewerListId)}`;
          return;
        }

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

        let added = [];
        let removed = [];
        let globalOk = true;

        try {
          const appliedOld = loadGlobalApplied(category);
          const oldValuesForGlobal = appliedOld
            ? appliedOld
            : eligibleFromRow(category, existingRow);

          const eligibleNewRaw = eligibleValuesForGlobal(category, newValues);
          const eligibleNew = dedupeValuesForGlobalByCanonical(category, eligibleNewRaw);
          const oldValuesDeduped = dedupeValuesForGlobalByCanonical(category, oldValuesForGlobal);

          ({ added, removed } = diffCanonicalMultiset(oldValuesDeduped, eligibleNew));

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
        } catch (gerr) {
          globalOk = false;

          logEvent('global_update_error', {
            category,
            list_id: viewerListId,
            message: String(gerr && (gerr.message || gerr) || 'unknown'),
            added: Array.isArray(added) ? added.length : null,
            removed: Array.isArray(removed) ? removed.length : null
          });

          console.warn('[Splash] Global update failed (fail-soft). List was saved; continuing.', gerr);
        }

        logEvent('submit_success', {
          category,
          list_id: viewerListId,
          changed: true,
          added: Array.isArray(added) ? added.length : 0,
          removed: Array.isArray(removed) ? removed.length : 0,
          global_ok: globalOk
        });
// ✅ Home Island Gate: reaffirm eligibility after successful edit submit
try { localStorage.setItem('splash_has_submitted_top5', '1'); } catch(e) {}
try { localStorage.setItem('splash_last_submit_success_at', new Date().toISOString()); } catch(e) {}

        window.location.href =
          window.location.origin +
          RESULTS_PATH +
          `?category=${encodeURIComponent(category)}&listId=${encodeURIComponent(viewerListId)}`;

      } catch (err) {
        // ✅ V24.3.4 retained: better offline messaging (works with DevTools Offline)
        logEvent('submit_error', {
          category,
          list_id: viewerListId,
          reason: 'exception',
          message: String(err && (err.message || err) || 'unknown')
        });

        const msg = String(err && (err.message || err) || '');

        const looksOffline =
          (navigator.onLine === false) ||
          /failed to fetch|networkerror|load failed|internet disconnected|err_internet_disconnected|err_network_changed|err_connection|net::err_/i.test(msg);

        let m = 'Save failed. Please try again.';

        if (looksOffline) {
          m = 'You appear to be offline or your connection is unstable. Please reconnect and try again.';
        } else if (msg.startsWith('timeout:')) {
          m = 'Saving is taking longer than expected. Please try again.';
        }

        if (!setInlineError(formEl, m)) toast(m, 'error');

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.value = originalBtnValue || 'Submit';
        }
      }
    });
  });
});
