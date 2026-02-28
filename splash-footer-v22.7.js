// Baseline: V24.3.6
// Change: Island update toast is now content-change–based (no-op submits no longer trigger it)

// ✅ SPLASH FOOTER RUN-ONCE GUARD — V24.3.21 (ADD-ONLY)
if (window.__SPLASH_FOOTER_V24_3_6_LOADED__) {
  console.warn('[Splash] Footer already loaded — skipping duplicate init');
} else {
  window.__SPLASH_FOOTER_V24_3_6_LOADED__ = true;

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

  /* ===========================================
   RECOVERY KEY — V1 (ADD-ONLY)
   - stores only a SHA-256 hash in DB (via RPC)
   - keeps the raw key only on the user's device
=========================================== */

function splashMakeRecoveryKey(){
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SPLASH-${part()}${part()}-${part()}${part()}-${part()}${part()}`;
}

function splashNormalizeKey(k){
  return String(k || '').trim();
}

async function splashRegisterRecoveryKeyIfNeeded(listId){
  try {
    if (!listId) return null;

    const KEY_STORE = 'splash_recovery_key_v1';
    const existing = localStorage.getItem(KEY_STORE);
    if (existing) return existing;

    const key = splashMakeRecoveryKey();

    const { data, error } = await supabase.rpc('register_recovery_key', {
      p_list_id: listId,
      p_recovery_key: key
    });

    if (error) return null;
    if (!data) return null;

    localStorage.setItem(KEY_STORE, key);
    return key;
  } catch(e){
    return null;
  }
}

async function splashResolveRecoveryKeyToListId(key){
  try {
    const k = splashNormalizeKey(key);
    if (!k) return null;
   // Accept raw UUID or "SPLASH-<uuid>"
try {
  const raw = String(k || '').trim();

  // raw UUID
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRe.test(raw)) return raw;

  // SPLASH-UUID
  const m = raw.match(/^splash-([0-9a-f-]{36})$/i);
  if (m && uuidRe.test(m[1])) return m[1];

} catch(e) {}

    const { data, error } = await supabase.rpc('resolve_recovery_key', {
      p_recovery_key: k
    });

    if (error) return null;
    return data || null; // uuid or null
  } catch(e){
    return null;
  }
}
 function splashOpenRecoveryKeyRevealModal(listId, onDone) {
  try {
    const id = String(listId || '').trim();
    if (!id) return;

    // prevent double
    if (document.getElementById('splash-recovery-reveal-wrap')) return;

    const key = `SPLASH-${id}`;

    const wrap = document.createElement('div');
    wrap.id = 'splash-recovery-reveal-wrap';
    wrap.style.position = 'fixed';
    wrap.style.left = '0';
    wrap.style.top = '0';
    wrap.style.right = '0';
    wrap.style.bottom = '0';
    wrap.style.background = 'rgba(0,0,0,0.45)';
    wrap.style.zIndex = '999999';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.padding = '18px';

    const card = document.createElement('div');
    card.style.width = 'min(560px, 100%)';
    card.style.background = '#fff';
    card.style.borderRadius = '16px';
    card.style.padding = '18px';
    card.style.boxShadow = '0 16px 50px rgba(0,0,0,0.25)';
    card.style.boxSizing = 'border-box';

    card.innerHTML = `
  <div style="font-weight:700;font-size:16px;margin-bottom:8px;color:rgba(0,0,0,.85);">
    Save your Island key
  </div>

  <div style="opacity:.72;font-size:13px;margin-bottom:12px;color:rgba(0,0,0,.75);">
    This lets you edit your Island on another device.
  </div>

  <div style="
    display:flex;
    gap:10px;
   align-items:flex-start;
    border:1px solid rgba(0,0,0,.14);
    border-radius:12px;
    padding:12px;
    margin-bottom:12px;
  ">
   <div id="splash-recovery-reveal-key" style="
  flex:1 1 auto;
  min-width:0;
  font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size:13px;
  color:rgba(0,0,0,.85);
  overflow: hidden;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.25;
">${key}</div>

    <button id="splash-recovery-reveal-copy" style="
      flex:0 0 auto;
      white-space:nowrap;
      padding:10px 12px;
      border-radius:10px;
      border:1px solid rgba(0,0,0,.14);
      background:#fff;
      cursor:pointer;
      font-weight:600;
      font-size:14px;
      line-height:1.1;
      color:rgba(0,0,0,.80);
    ">Copy</button>
  </div>

  <div id="splash-recovery-reveal-status" style="margin-top:6px;font-size:13px;opacity:.75;color:rgba(0,0,0,.75);"></div>

  <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
    <button id="splash-recovery-reveal-done" style="
      flex:0 0 auto;
      white-space:nowrap;
      padding:10px 12px;
      border-radius:10px;
      border:0;
      background:#9fd0cf;
      cursor:pointer;
      font-weight:700;
      font-size:14px;
      line-height:1.1;
      color:rgba(0,0,0,.78);
    ">I saved it</button>
  </div>
`;

    const close = () => {
      try { wrap.remove(); } catch(e) {}
      try { onDone && onDone(); } catch(e) {}
    };

    // IMPORTANT: do NOT close on backdrop click (force intent)
   wrap.addEventListener('click', (e) => {
  // Only intercept clicks on the backdrop itself (not on the card/buttons)
  if (e.target === wrap) {
    e.preventDefault();
    e.stopPropagation();
  }
}, { passive: false });


    card.querySelector('#splash-recovery-reveal-copy').addEventListener('click', async () => {
      const status = card.querySelector('#splash-recovery-reveal-status');
      try {
        await navigator.clipboard.writeText(key);
        status.textContent = 'Copied.';
      } catch(e) {
        // fallback select
        status.textContent = 'Copy failed — select and copy manually.';
      }
    });

    card.querySelector('#splash-recovery-reveal-done').addEventListener('click', close);

    wrap.appendChild(card);
    document.body.appendChild(wrap);
  } catch(e) {}
}
  
function splashOpenRecoveryModal(){
  if (document.getElementById('splash-recovery-modal')) return;

  const wrap = document.createElement('div');
  wrap.id = 'splash-recovery-modal';
  wrap.style.position = 'fixed';
  wrap.style.inset = '0';
  wrap.style.background = 'rgba(0,0,0,0.45)';
  wrap.style.zIndex = '999999';
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.justifyContent = 'center';
  wrap.style.padding = '18px';

  const card = document.createElement('div');
  card.style.width = 'min(520px, 100%)';
  card.style.background = '#fff';
  card.style.borderRadius = '16px';
  card.style.padding = '16px';
  card.style.boxShadow = '0 16px 50px rgba(0,0,0,0.25)';
  card.style.maxHeight = '80vh';
  card.style.overflow = 'auto';
  card.style.boxSizing = 'border-box';

  card.innerHTML = `
    <div style="font-weight:700;font-size:16px;margin-bottom:8px;">Restore your Island</div>
    <div style="opacity:.72;font-size:13px;margin-bottom:12px;">Enter your Island key to edit your Island on this device.</div>
    <input id="splash-recovery-input" placeholder="Enter your Island key" inputmode="text" autocapitalize="characters" spellcheck="false" style="width:100%;padding:12px;border:1px solid rgba(0,0,0,.18);border-radius:10px;margin-bottom:10px;font-size:14px;" />
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
     <button id="splash-recovery-cancel"
  style="display:inline-flex;align-items:center;justify-content:center;
  padding:10px 12px;border-radius:10px;border:1px solid rgba(0,0,0,.14);
  background:#fff;cursor:pointer;color:rgba(0,0,0,.78);
  font-size:14px;line-height:1.1;">
  Cancel
</button>

<button id="splash-recovery-go"
  style="display:inline-flex;align-items:center;justify-content:center;
  padding:10px 12px;border-radius:10px;border:0;
  background:#9fd0cf;cursor:pointer;font-weight:600;
  color:rgba(0,0,0,.78);font-size:14px;line-height:1.1;">
  Restore
</button>
    </div>
    <div id="splash-recovery-status" style="margin-top:10px;font-size:13px;opacity:.75;"></div>
  `;
  card.addEventListener('click', (e) => e.stopPropagation());

  const close = () => { try { wrap.remove(); } catch(e){} };


  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  card.querySelector('#splash-recovery-cancel').addEventListener('click', close);

  card.querySelector('#splash-recovery-go').addEventListener('click', async () => {
    const input = card.querySelector('#splash-recovery-input');
    const status = card.querySelector('#splash-recovery-status');
    const key = input.value;

    status.textContent = 'Checking key…';

    const listId = await splashResolveRecoveryKeyToListId(key);

    if (!listId) {
      status.textContent = 'No match found. Check the key and try again.';
      return;
    }

   // restore ownership marker
localStorage.setItem('splash_list_id', listId);

// ✅ mark as not-first-time (fixes “first time on splash” behaviour)
localStorage.setItem('splash_has_submitted_top5', '1');
localStorage.setItem('splash_last_submit_success_at', new Date().toISOString());

// also store the key locally (so they can see it later)
localStorage.setItem('splash_recovery_key_v1', splashNormalizeKey(key));

    status.textContent = 'Recovered. Loading your Island…';
    setTimeout(() => {
      window.location.href = window.location.origin + '/island';
    }, 350);
  });

  wrap.appendChild(card);
  document.body.appendChild(wrap);

  setTimeout(() => card.querySelector('#splash-recovery-input')?.focus(), 50);
}
  // EXPORTS — Recovery Key V1 (so other scripts/buttons/console can call it)
try {
  window.splashOpenRecoveryModal = splashOpenRecoveryModal;
  window.splashRegisterRecoveryKeyIfNeeded = splashRegisterRecoveryKeyIfNeeded;
  window.splashResolveRecoveryKeyToListId = splashResolveRecoveryKeyToListId;
  window.splashOpenRecoveryKeyRevealModal = splashOpenRecoveryKeyRevealModal;
} catch(e) {}

  console.log('[Splash] Recovery Key V1 loaded');

  /* =========================
     QW2 — ANALYTICS HELPER (FAIL-SILENT) + UUID HARDENING + QUEUE/FLUSH
  ========================== */

  // analytics_events invariant:
// - category is nullable
// - island_* events intentionally have no category
// - enforced by DB allowlist + nullable column

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

  function getSessionId() {
  try {
    let sid = localStorage.getItem(ANALYTICS_SESSION_KEY);

    // Coerce + self-heal: must always be a valid UUID
    sid = uuidOrNull(sid);

    if (!sid) {
      sid = (crypto.randomUUID && crypto.randomUUID()) || uuidv4Fallback();
      localStorage.setItem(ANALYTICS_SESSION_KEY, sid);
    }

    return sid;
  } catch {
    // Fail-soft: still return a UUID for this pageview
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

  // IMPORTANT: define safeRow (was missing)
  const safeRow = { ...row };

  // meta is jsonb in Supabase — must be a plain object (not a string)
  safeRow.meta = (safeRow.meta && typeof safeRow.meta === 'object')
    ? safeRow.meta
    : null;

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
    while (true) {
      const q = readQueue();
      if (!q.length) break;

      const batch = q.slice(0, ANALYTICS_FLUSH_CHUNK);
      const remainder = q.slice(batch.length);

      // ✅ IMPORTANT: commit removal first so concurrent enqueues won't be lost
      writeQueue(remainder);

      try {
        for (const row of batch) {
          await postAnalyticsOneKeepalive(row);
        }
      } catch (e) {
        // ✅ If posting fails, put the batch back at the front (preserve order),
        // but DON'T overwrite any new events that may have been enqueued meanwhile.
        const now = readQueue();
        writeQueue(batch.concat(now));
        throw e;
      }
    }
  } catch {
    // fail-silent
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
  // BEGIN V24.3.13 ADD-ONLY — enforce analytics event_name allowlist
 const ANALYTICS_EVENT_ALLOWLIST = new Set([
  'visit',
  'session_start',
  'results_view',
  'submit_click',
  'submit_error',
  'submit_success',
  'item_changed',
  'global_update_error',
  'island_view',
  'island_return',
  'island_update_signal_shown',
  'repeat_conviction_event',
  'conviction_prompt_shown',

  // V24.3.14 ADD-ONLY — share + dwell events
  'share_click',
  'share_success',
  'share_fallback_prompt',
  'session_end'
]);



  function coerceAllowedEventName(name){
    const n = String(name || '').trim();
    if (!n) return null;
    return ANALYTICS_EVENT_ALLOWLIST.has(n) ? n : null;
  }
  // BEGIN V24.3.14 ADD-ONLY — Attribution capture (referrer + UTM) stored in meta.attr
const ATTR_KEY = 'splash_attr_v1';

function readAttr(){
  try {
    const raw = localStorage.getItem(ATTR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeAttr(obj){
  try { localStorage.setItem(ATTR_KEY, JSON.stringify(obj)); } catch {}
}

function getAttr(){
  // Persist first-touch attribution (don’t overwrite later)
  const existing = readAttr();
  if (existing) return existing;

  let ref = '';
  try { ref = String(document.referrer || ''); } catch { ref = ''; }

  let utm_source=null, utm_medium=null, utm_campaign=null, utm_content=null, utm_term=null;
  try {
    const u = new URL(window.location.href);
    const p = u.searchParams;
    utm_source   = p.get('utm_source');
    utm_medium   = p.get('utm_medium');
    utm_campaign = p.get('utm_campaign');
    utm_content  = p.get('utm_content');
    utm_term     = p.get('utm_term');
  } catch {}

  const attr = {
    referrer: ref || null,
    utm_source: utm_source || null,
    utm_medium: utm_medium || null,
    utm_campaign: utm_campaign || null,
    utm_content: utm_content || null,
    utm_term: utm_term || null,
    captured_at: new Date().toISOString()
  };

  writeAttr(attr);
  return attr;
}
// END V24.3.14 ADD-ONLY

  // END V24.3.13 ADD-ONLY

  function logEvent(event_name, meta = {}) {
    try {
      if (!event_name) return;
      event_name = coerceAllowedEventName(event_name);
      if (!event_name) return;
      // V24.3.14 ADD-ONLY — attach first-touch attribution to meta
      try {
        const attr = (typeof getAttr === 'function') ? getAttr() : null;

        if (meta && typeof meta === 'object') {
          if (!meta.attr && attr) {
            meta.attr = attr;
          }
        } else {
          meta = attr ? { attr } : {};
        }
      } catch (e) {}

      const payload = {
  event_name,
  page: window.location.pathname || '',
  category: (meta && typeof meta.category === 'string') ? meta.category : null,
  list_id: uuidOrNull(meta.list_id),
  session_id: getSessionId(),
  engaged: (meta && typeof meta.engaged === 'boolean') ? meta.engaged : null,
  meta
};

      enqueueEvent(payload);
      flushQueue();
    } catch {}
  }
  // BEGIN V24.3.16 ADD-ONLY — session_start (one per page load)
let __SPLASH_SESSION_START_SENT__ = false;

function sendSessionStart(){
  try {
    if (__SPLASH_SESSION_START_SENT__) return;
    __SPLASH_SESSION_START_SENT__ = true;

    logEvent('session_start', {
      ts: new Date().toISOString()
    });
  } catch (e) {}
}

// Fire immediately on script load (and only once)
try { sendSessionStart(); } catch (e) {}
// END V24.3.16 ADD-ONLY

// BEGIN V24.3.15 ADD-ONLY — Dwell time via session_end (HARDENED keepalive REST)
let __SPLASH_SESSION_START__ = Date.now();
let __SPLASH_SESSION_END_SENT__ = false;

function postSessionEndKeepalive(duration_ms, engaged, engaged_threshold_ms){
  try {
    const endpoint = `${SUPABASE_URL}/rest/v1/analytics_events`;

    const payload = {
  event_name: 'session_end',
  page: window.location.pathname || '',
  category: null,
  list_id: null,
  session_id: getSessionId(),

  // NEW: write to the real column
  engaged: (typeof engaged === 'boolean') ? engaged : null,

  // meta stays jsonb
  meta: { duration_ms, engaged_threshold_ms }
};


    // Attach first-touch attribution if available
    try {
      const attr =
        (typeof getAttr === 'function' ? getAttr() :
         (typeof readAttr === 'function' ? readAttr() : null));
      if (attr) payload.meta.attr = attr;
    } catch(e) {}

    fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {});
  } catch(e) {}
}

function sendSessionEnd(){
  try {
    if (__SPLASH_SESSION_END_SENT__) return;
    __SPLASH_SESSION_END_SENT__ = true;

    const duration_ms = Math.max(0, Date.now() - (__SPLASH_SESSION_START__ || Date.now()));

    try {
      const ENGAGED_THRESHOLD_MS = 15000;
      const engaged = duration_ms >= ENGAGED_THRESHOLD_MS;

      logEvent('session_end', {
        duration_ms,
        engaged,
        engaged_threshold_ms: ENGAGED_THRESHOLD_MS
      });

      postSessionEndKeepalive(duration_ms, engaged, ENGAGED_THRESHOLD_MS);

    } catch(e) {}

  } catch(e) {}
}


window.addEventListener('pagehide', sendSessionEnd, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') sendSessionEnd();
}, { passive: true });
// END V24.3.15 ADD-ONLY

// BEGIN V24.3.12 ADD-ONLY — expose safe hooks for Island scripts
try {
  // Allow other scripts (Island, prototypes) to log using the same queue/flush pipeline.
  window.__SPLASH_LOG_EVENT__ = logEvent;
} catch(e) {}
// END V24.3.12 ADD-ONLY

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
// BEGIN V24.3.12 ADD-ONLY — expose toast for Island scripts
try {
  window.__SPLASH_TOAST__ = toast;
} catch(e) {}
// END V24.3.12 ADD-ONLY
  function splashToastRecoveryKeyOnce(listId){
  try {
    const fn = window.__SPLASH_TOAST__;
    if (typeof fn !== 'function') return;

    const id = String(listId || '').trim();
    if (!id) return;

    const KEY = `splash_recovery_toast_shown_v1:${id}`;
    if (localStorage.getItem(KEY)) return;

    fn('Save your recovery key — you’ll need it if you switch devices.', 'info', 5200);
    localStorage.setItem(KEY, '1');
  } catch(e) {}
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

/* =========================
   HOME "YOUR ISLAND" VISIBILITY GATE — V24.3.18 (ADD-ONLY)
   Change:
   - If NOT eligible (no submit yet), show a button that says:
     "Have a recovery key?"
   - Clicking opens splashOpenRecoveryModal()
   - If eligible, restore original button behavior/text
========================= */
function applyHomeIslandGate(){
  try {
    if (!isHomePage()) return;

    const btns = getHomeIslandButtons();
    if (!btns.length) return;

    const allowed = hasSubmittedOnce();

    btns.forEach((btn) => {
      // Cache original state once
      if (!btn.dataset.__splashOrigText) btn.dataset.__splashOrigText = (btn.textContent || '').trim();
      if (!btn.dataset.__splashOrigHref && btn.tagName === 'A') btn.dataset.__splashOrigHref = btn.getAttribute('href') || '';

      // Remove any previous recovery handler (safe idempotent pattern)
      if (btn.__SPLASH_RECOVERY_BOUND__) {
        try { btn.removeEventListener('click', btn.__SPLASH_RECOVERY_BOUND__); } catch(e) {}
        btn.__SPLASH_RECOVERY_BOUND__ = null;
      }

      if (!allowed) {
        // SHOW as recovery entry point
        btn.style.display = '';
        btn.setAttribute('aria-hidden', 'false');
        btn.removeAttribute('tabindex');

        btn.textContent = 'Have an Island key?';

        // Prevent navigation if it's a link
        if (btn.tagName === 'A') {
          btn.setAttribute('href', '#');
        }
        
        try { btn.onclick = null; } catch(e) {}


        // Bind click → open modal
        const handler = (e) => {
  try {
    e.preventDefault();
    e.stopPropagation();
    // ✅ this is the key: prevents other listeners on same element from running
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
  } catch(_) {}

  try {
    if (typeof window.splashOpenRecoveryModal === 'function') {
      window.splashOpenRecoveryModal();
    }
  } catch(e) {}
};

btn.__SPLASH_RECOVERY_BOUND__ = handler;

// ✅ bind to pointerdown AND click, capture phase, so we win the race
btn.addEventListener('pointerdown', handler, { passive: false, capture: true });
btn.addEventListener('click', handler, { passive: false, capture: true });


      } else {
        // RESTORE normal button behavior
        btn.style.display = '';
        btn.setAttribute('aria-hidden', 'false');
        btn.removeAttribute('tabindex');

        // Restore text (or leave as-is if blank)
        const origText = (btn.dataset.__splashOrigText || '').trim();
        if (origText) btn.textContent = origText;

        // Restore href if it was an anchor
        if (btn.tagName === 'A') {
          const origHref = btn.dataset.__splashOrigHref || '';
          if (origHref) btn.setAttribute('href', origHref);
        }
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
  let id = null;
  try { id = localStorage.getItem(LIST_ID_KEY); } catch(e) {}

  // If it's not a UUID, treat as missing (self-heal)
  id = uuidOrNull(id);

  if (!id) {
    id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : uuidv4Fallback();

    try { localStorage.setItem(LIST_ID_KEY, id); } catch(e) {}
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
  
// BEGIN V24.3.17 ADD-ONLY — Resolved Identity Export
try {
  window.__SPLASH_VIEWER_LIST_ID__   = viewerListId || null;   // device/local identity
  window.__SPLASH_URL_LIST_ID__      = islandListId || null;   // ?listId=... when on /island
  window.__SPLASH_ACTIVE_LIST_ID__   = listId || null;         // fetch key (URL wins on /island)
  window.__SPLASH_IS_ISLAND_OWNER__  = !!isIslandOwner;        // owner boolean
} catch (e) {}
// END V24.3.17 ADD-ONLY

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

const LAST_ISLAND_VIEW_AT_KEY = `splash_last_island_view_at:${listId}`;
const LAST_SUBMIT_SUCCESS_AT_KEY  = 'splash_last_submit_success_at';
const LAST_ISLAND_CONTENT_CHANGE_AT_KEY = 'splash_last_island_content_change_at';

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
 const lastChangeAt = readIsoTime(LAST_ISLAND_CONTENT_CHANGE_AT_KEY);

  if (isIslandOwner && lastChangeAt && (!prevIslandViewAt || lastChangeAt > prevIslandViewAt)) {
   toast('Your Island evolved since your last visit.', 'info', 4200);

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
/* =========================
   RECOVERY PREFILL HYDRATION — V3 (FULL REPLACE OF V2)
   Fixes:
   - RPC shape hardening (array OR object)
   - Removes .maybeSingle() (can null out array RPCs)
   - Small retry loop for Webflow timing
   - Writes to splash_last_<data-category> (same key prefill reads)
========================== */

function isTop5FormPage(){
  try {
    return !!document.querySelector('form input[name="rank1"]');
  } catch(e) { return false; }
}

function __splashCoerceRpcRow(data){
  try {
    if (!data) return null;
    // Many RPCs return arrays
    if (Array.isArray(data)) return data[0] || null;
    // Some return object
    if (typeof data === 'object') return data;
    return null;
  } catch(e){
    return null;
  }
}

async function hydrateLocalLastTop5FromDBIfMissing(){
  try {
    if (!isTop5FormPage()) return;

    const listId = (typeof localStorage !== 'undefined')
      ? localStorage.getItem('splash_list_id')
      : null;

    if (!listId) return;

    // Hydrate each Top5 form on the page (safe if only one)
    const forms = Array.from(document.querySelectorAll('form'))
      .filter(f => !!f.querySelector('input[name="rank1"]'));

    for (const formEl of forms){
      const category = String(formEl.getAttribute('data-category') || '').trim().toLowerCase();
      if (!category) continue;

      const key = 'splash_last_' + category;

      // If we already have local prefills (valid JSON), don't touch them
      const existingRaw = localStorage.getItem(key);
      if (existingRaw) {
        // If it’s corrupted, allow overwrite
        try { JSON.parse(existingRaw); continue; } catch(_) {}
      }

      // Pull latest saved list for THIS category
    const { data, error } = await supabase.rpc('get_list_row', {
  p_user_id: listId,
  p_category: category
});

      if (error || !data) continue;

      const row = Array.isArray(data) ? (data[0] || null) : (data || null);
if (!row) continue;
      const payload = {
        category,
        rank1: row.v1 || '',
        rank2: row.v2 || '',
        rank3: row.v3 || '',
        rank4: row.v4 || '',
        rank5: row.v5 || '',
        updatedAt: row.updated_at || row.created_at || new Date().toISOString()
      };

      try { localStorage.setItem(key, JSON.stringify(payload)); } catch(e) {}

      // Immediately apply to the form if it's currently empty
      try { applyLastListToForm(formEl); } catch(e) {}
    }
  } catch (e) {
    // fail-soft
  }
}

// Run once on page load + a short retry loop (covers Webflow render timing)
(function initRecoveryHydrationV3(){
  try {
    let tries = 0;
    const maxTries = 8;     // ~2s total
    const interval = 250;

    const tick = async () => {
      tries++;
      try { await hydrateLocalLastTop5FromDBIfMissing(); } catch(e) {}

      // Stop early if there are no Top5 forms
      if (!isTop5FormPage()) {
        if (tries < maxTries) return;
        return;
      }

      // If at least one form now has any value, we’re done
      try {
        const anyFilled = Array.from(document.querySelectorAll('form'))
          .filter(f => !!f.querySelector('input[name="rank1"]'))
          .some(f => {
            const inputs = [1,2,3,4,5].map(i => f.querySelector(`input[name="rank${i}"]`)).filter(Boolean);
            return inputs.some(inp => String(inp.value || '').trim());
          });

        if (anyFilled) return;
      } catch(e) {}

      if (tries < maxTries) setTimeout(tick, interval);
    };

    // first attempt immediately
    setTimeout(tick, 0);

    // also on bfcache restore / back-forward navigation
    window.addEventListener('pageshow', () => { try { tick(); } catch(e) {} }, { passive: true });
  } catch(e) {}
})();

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
        await navigator.share({
          title: 'My Desert Island',
          text: 'A snapshot of what I’d take with me — captured in time.',
          url: shareUrl
        });
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
    if (parent === 'tv')     return { aLabel:'IMDb', aUrl:`https://www.imdb.com/find/?q=${enc(title)}`, bLabel:'Amazon', bUrl:`https://www.amazon.com/s?k=${enc(title)}+tv+series` };
    if (parent === 'books')  return { aLabel:'Goodreads', aUrl:`https://www.goodreads.com/search?q=${enc(title)}`, bLabel:'Amazon', bUrl:`https://www.amazon.com/s?k=${enc(title)}` };
    if (parent === 'games')  return { aLabel:'Metacritic', aUrl:`https://www.metacritic.com/search/all/${enc(title)}/results`, bLabel:'Amazon', bUrl:`https://www.amazon.com/s?k=${enc(title)}+video+game` };
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
/* =========================
   GLOBAL ITEMS ALIASING (DB-DRIVEN) — V24.3.19 (FULL REPLACE OF ALIAS BLOCK)
========================== */

function normalizeAliasCategory(category){
  const c = String(category || '').trim().toLowerCase();
  if (c === 'music-genres'  || c.startsWith('music-genres-'))  return 'music-genres';
  if (c === 'music-artists' || c.startsWith('music-artists-')) return 'music-artists';
  return c;
}

function normalizeAliasKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Cache: category -> { byAlias: Map(aliasKey -> {canonical_id, canonical_display}), loadedAt:number }
const __SPLASH_ALIAS_CACHE__ = new Map();
const __SPLASH_ALIAS_TTL_MS__ = 1000 * 60 * 10; // 10 min

async function loadAliasMapForCategory(category){
  const cat = normalizeAliasCategory(category);
  if (!cat) return new Map();

  const now = Date.now();
  const cached = __SPLASH_ALIAS_CACHE__.get(cat);
  if (cached && cached.byAlias && (now - (cached.loadedAt || 0)) < __SPLASH_ALIAS_TTL_MS__) {
    return cached.byAlias;
  }

  try {
    const { data, error } = await supabase
      .from('item_aliases')
      .select('alias, canonical_id, canonical_display')
      .eq('category', cat)
      .eq('is_active', true)
      .limit(5000);

    if (error) throw error;

    const m = new Map();
    (data || []).forEach((row) => {
      const k = normalizeAliasKey(row.alias);
      if (!k) return;
      m.set(k, {
        canonical_id: String(row.canonical_id || '').trim(),
        canonical_display: row.canonical_display ? String(row.canonical_display).trim() : null
      });
    });

    __SPLASH_ALIAS_CACHE__.set(cat, { byAlias: m, loadedAt: now });
    return m;
  } catch (e) {
    if (cached && cached.byAlias) return cached.byAlias;
    return new Map();
  }
}

// Local fallback (keep tiny)
function localManualAliasFallback(category, display){
  const cat = normalizeAliasCategory(category);
  const key = String(display || '').trim().toLowerCase().replace(/\s+/g,' ');

  const ALIASES = {
    'music-genres': {
      'prog rock': 'Progressive Rock',
      'prog-rock': 'Progressive Rock',
      'prog roock': 'Progressive Rock',
      'progressive rock': 'Progressive Rock'
    },
    'music-artists': {
      'rolling stone': 'The Rolling Stones',
      'rolling stones': 'The Rolling Stones',
      'the rolling stones': 'The Rolling Stones',
      'pinkfloyd': 'Pink Floyd',
      'pink floyd': 'Pink Floyd',
      'smashing punkins': 'The Smashing Pumpkins',
      'smashing pumpkins': 'The Smashing Pumpkins',
      'the smashing pumpkins': 'The Smashing Pumpkins',
      'led zep': 'Led Zeppelin'
    }
  };

  return (ALIASES[cat] && ALIASES[cat][key]) ? ALIASES[cat][key] : display;
}

function localManualCanonicalFallback(category, canonical){
  const cat = normalizeAliasCategory(category);
  const canon = String(canonical || '').trim().toLowerCase();

  const CANON_ALIASES = {
    'music-genres': {
      'prog-rock': 'progressive-rock',
      'prog-roock': 'progressive-rock',
      'progressive-rock': 'progressive-rock'
    },
    'music-artists': {
      'rolling-stone': 'the-rolling-stones',
      'rolling-stones': 'the-rolling-stones',
      'the-rolling-stones': 'the-rolling-stones',
      'pinkfloyd': 'pink-floyd',
      'pink-floyd': 'pink-floyd',
      'led-zep': 'led-zeppelin',
      'led-zeppelin': 'led-zeppelin',
      'led-zepplin': 'led-zeppelin',
      'smashing-punkins': 'the-smashing-pumpkins',
      'smashing-pumpkins': 'the-smashing-pumpkins',
      'the-smashing-pumpkins': 'the-smashing-pumpkins'
    }
  };

  return (CANON_ALIASES[cat] && CANON_ALIASES[cat][canon]) ? CANON_ALIASES[cat][canon] : canonical;
}

async function resolveAliases(category, display){
  const rawDisplay = String(display || '').trim();
  if (!rawDisplay) return { display: rawDisplay, canon: '' };

  const cat = normalizeAliasCategory(category);
  const key = normalizeAliasKey(rawDisplay);

  const map = await loadAliasMapForCategory(cat);
  const hit = map.get(key);

  if (hit && (hit.canonical_id || hit.canonical_display)) {
    const resolvedDisplay = hit.canonical_display || rawDisplay;
    const resolvedCanon = hit.canonical_id || canonicalFromDisplay(resolvedDisplay);
    return { display: resolvedDisplay, canon: resolvedCanon };
  }

  const fallbackDisplay = localManualAliasFallback(cat, rawDisplay);
  const fallbackCanon = canonicalFromDisplay(fallbackDisplay);
  const finalCanon = localManualCanonicalFallback(cat, fallbackCanon);

  return { display: fallbackDisplay, canon: finalCanon };
}

function resolveAliasesSyncBestEffort(category, display){
  const rawDisplay = String(display || '').trim();
  if (!rawDisplay) return { display: rawDisplay, canon: '' };

  const cat = normalizeAliasCategory(category);
  const key = normalizeAliasKey(rawDisplay);

  const cached = __SPLASH_ALIAS_CACHE__.get(cat);
  if (cached && cached.byAlias) {
    const hit = cached.byAlias.get(key);
    if (hit && (hit.canonical_id || hit.canonical_display)) {
      const resolvedDisplay = hit.canonical_display || rawDisplay;
      const resolvedCanon = hit.canonical_id || canonicalFromDisplay(resolvedDisplay);
      return { display: resolvedDisplay, canon: resolvedCanon };
    }
  }

  const fallbackDisplay = localManualAliasFallback(cat, rawDisplay);
  const fallbackCanon = canonicalFromDisplay(fallbackDisplay);
  const finalCanon = localManualCanonicalFallback(cat, fallbackCanon);

  return { display: fallbackDisplay, canon: finalCanon };
}

  async function incrementGlobalItemByCanonical(category, canonical, display){
  const resolved = await resolveAliases(category, normText(display));
let disp = normText(resolved.display);

let canon = String(resolved.canon || canonical || '').trim();
if (!canon) canon = canonicalFromDisplay(disp);
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
   canon = resolveAliasesSyncBestEffort(category, canon).canon || canon;

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

   const resolved = resolveAliasesSyncBestEffort(category, v);
const disp = resolved.display;
let canon = resolved.canon || canonicalFromDisplay(disp);
if (!canon) return;

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

    const RESULTS_SUBLABEL_OVERRIDES = {
      'games-video': 'Video Games'
    };

    const getSubFromCategory = (category) => {
  const raw = String(category || '').trim().toLowerCase();

  if (RESULTS_SUBLABEL_OVERRIDES[raw]) {
    return RESULTS_SUBLABEL_OVERRIDES[raw];
  }

  const parts = raw.split('-');
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

  // -------------------------
  // USER TOP 5 (Your list)
  // -------------------------
  (async () => {
    const category = (urlParams.get('category') || '').trim();
    const userList = document.getElementById('userList');
    if (!userList) return;

    userList.innerHTML = '<li>Loading…</li>';

    try {
      const { data: rowData, error: readErr } = await supabase.rpc('get_list_row', {
        p_user_id: viewerListId,
        p_category: category
      });

      if (readErr) throw readErr;

      const row = Array.isArray(rowData) ? rowData[0] : rowData;

      userList.innerHTML = '';

      if (row) {
        [row.v1, row.v2, row.v3, row.v4, row.v5].forEach(v => {
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

          const resolvedMeta = resolveAliasesSyncBestEffort(category, v);
const dispMeta = resolvedMeta.display;
let canonMeta = resolvedMeta.canon || canonicalFromDisplay(dispMeta);

          const meta = {
            category: category,
            canonical_id: canonMeta,
            display_name: dispMeta,
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

        if (!userList.children.length) {
          userList.innerHTML = '<li>No items.</li>';
        }
      } else {
        userList.innerHTML = '<li>No saved list.</li>';
      }

      // Capture typography for Global list to match
      const probe = userList.querySelector('li span') || userList.querySelector('li') || userList;
      if (probe) {
        window.__SPLASH_TOP5_FONTSIZE__ = window.getComputedStyle(probe).fontSize;
        window.__SPLASH_TOP5_LINEHEIGHT__ = window.getComputedStyle(probe).lineHeight;
      }
    } catch (err) {
      userList.innerHTML =
        '<li>Could not load your list. <button type="button" style="margin-left:8px;cursor:pointer;" onclick="window.location.reload()">Retry</button></li>';
      toast('Could not load your saved list.', 'error');
    }
  })();

  // -------------------------
  // GLOBAL SPLASH (Top 100)
  // -------------------------
  (async () => {
    const category = (urlParams.get('category') || '').trim().toLowerCase();
    const globalMount = document.getElementById('globalList');
    if (!globalMount) return;

    const isList = /^(UL|OL)$/.test(globalMount.tagName);

    // loading state
    if (isList) globalMount.innerHTML = '<li>Loading…</li>';
    else globalMount.textContent = 'Loading…';

    try {
      const { data, error } = await supabase
        .from('global_items')
        .select('display_name, canonical_id, category, count')
        .eq('category', category)
        .order('count', { ascending: false })
        .limit(100);

      if (error) throw error;

      if (!data || !data.length) {
        if (isList) globalMount.innerHTML = '<li>No global rankings yet.</li>';
        else globalMount.textContent = 'No global rankings yet.';
        return;
      }

      // Match user list typography if captured
      const fs = window.__SPLASH_TOP5_FONTSIZE__;
      const lh = window.__SPLASH_TOP5_LINEHEIGHT__;
      if (fs) globalMount.style.fontSize = fs;
      if (lh) globalMount.style.lineHeight = lh;

      // If #globalList is already a UL/OL, populate it directly; otherwise create UL
      const listEl = isList ? globalMount : document.createElement('ul');
      listEl.innerHTML = '';

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
        // NOTE: if your resolveLinks uses bLabel/bUrl (not bBtnLabel), fix the line above to:
        // const payload = `{'aLabel':'${safe(links.aLabel)}','aUrl':'${safe(links.aUrl)}','bLabel':'${safe(links.bLabel)}','bUrl':'${safe(links.bUrl)}'}`;

        openBtn.setAttribute('data-di-links', payload);

        const meta = {
          category: category,
         canonical_id: resolveAliasesSyncBestEffort(category, label).canon || canonicalFromDisplay(label),
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
        listEl.appendChild(li);
      });

      if (!isList) {
        globalMount.textContent = '';
        globalMount.appendChild(listEl);
      }

      // visual scroll hint (fade-out at bottom)
      setupGlobalListFade(globalMount);

    } catch (err) {
      if (isList) {
        globalMount.innerHTML =
          '<li>Could not load global rankings. <button type="button" style="margin-left:8px;cursor:pointer;" onclick="window.location.reload()">Retry</button></li>';
      } else {
        globalMount.innerHTML =
          'Could not load global rankings. <button type="button" style="margin-left:8px;cursor:pointer;" onclick="window.location.reload()">Retry</button>';
      }
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
      const { data: rowData, error: readErr } = await supabase.rpc('get_list_row', {
  p_user_id: viewerListId,
  p_category: category
});

const existingRow = Array.isArray(rowData) ? rowData[0] : rowData;

let key = localStorage.getItem('splash_recovery_key_v1');

if (!key) {
  key = splashMakeRecoveryKey();

  const { data: regOk, error: regErr } = await supabase.rpc('register_recovery_key', {
    p_list_id: viewerListId,
    p_recovery_key: key
  });

  if (regErr || !regOk) throw new Error('could_not_create_island_key');

  localStorage.setItem('splash_recovery_key_v1', key);
}

        const hadExisting = !!existingRow;
        const changed = (!hadExisting) || !valuesEqualRow(existingRow, newValues);

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

          // Redirect destination (same as before)
const dest =
  window.location.origin +
  RESULTS_PATH +
  `?category=${encodeURIComponent(category)}&listId=${encodeURIComponent(viewerListId)}`;

// Show recovery key modal ONCE per listId/device, then redirect
try {
  const seenKey = `splash_recovery_reveal_shown_v1:${viewerListId}`;
  if (!localStorage.getItem(seenKey)) {
    localStorage.setItem(seenKey, '1');

    splashOpenRecoveryKeyRevealModal(viewerListId, () => {
      window.location.href = dest;
    });

    return; // IMPORTANT: prevent immediate redirect
  }
} catch(e) {}

// fallback: normal redirect
window.location.href = dest;
return;

        }

      const { data: wData, error: wErr } = await supabase.rpc('upsert_list_with_recovery_key', {
  p_recovery_key: key,
  p_category: category,
  p_v1: newValues[0] || null,
  p_v2: newValues[1] || null,
  p_v3: newValues[2] || null,
  p_v4: newValues[3] || null,
  p_v5: newValues[4] || null
});

if (wErr) throw wErr;
if (!wData || (wData.ok === false)) {
  throw new Error((wData && wData.error) ? wData.error : 'save_failed');
}


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

        // Register recovery key after real content change
try {
  await splashRegisterRecoveryKeyIfNeeded(viewerListId);
} catch(e) {}

// ✅ Home Island Gate: reaffirm eligibility after successful edit submit
try { localStorage.setItem('splash_has_submitted_top5', '1'); } catch(e) {}
try { localStorage.setItem('splash_last_submit_success_at', new Date().toISOString()); } catch(e) {}
try { localStorage.setItem('splash_last_island_content_change_at', new Date().toISOString()); } catch(e) {}

       const dest =
  window.location.origin +
  RESULTS_PATH +
  `?category=${encodeURIComponent(category)}&listId=${encodeURIComponent(viewerListId)}`;

try {
  const seenKey = `splash_recovery_reveal_shown_v1:${viewerListId}`;

  if (!localStorage.getItem(seenKey)) {
    localStorage.setItem(seenKey, '1');

    splashOpenRecoveryKeyRevealModal(viewerListId, () => {
      window.location.href = dest;
    });

    return; // IMPORTANT — prevents immediate redirect
  }
} catch(e) {}

// fallback (already seen reveal before)
window.location.href = dest;
return;

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
}
