/**
 * Minimal admin shell for the cf-full example — the MVP of CF-18.
 *
 * Served at /console. A single self-contained HTML page that talks to the REAL
 * console API (/api/console/*): if unauthenticated it shows a login form; once
 * logged in (fb_session cookie, set by the API, HttpOnly) it shows the principal
 * + a pages list + a draft editor with Save/Publish. No React — vanilla JS — so
 * it adds nothing to the bundle and needs no build step of its own.
 *
 * This is NOT a band-aid: it uses the genuine default-deny auth + tenant-scoped
 * stores. It exists so a freshly-deployed CMS is usable in a browser today; the
 * full React console (SetupWizard/LoginScreen/TenantsPanel) remains CF-18.
 */
import { Hono } from 'hono';

const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Frontbase Console</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; background: #f6f7f9; color: #111; }
  header { background: #111; color: #fff; padding: 14px 20px; display: flex; gap: 16px; align-items: center; }
  header b { font-size: 16px; }
  header .who { opacity: .85; }
  header button { margin-left: auto; }
  main { max-width: 900px; margin: 24px auto; padding: 0 20px; }
  .card { background: #fff; border: 1px solid #e2e4e8; border-radius: 8px; padding: 18px; margin-bottom: 16px; }
  h2 { margin: 0 0 12px; font-size: 15px; }
  input, textarea, button { font: inherit; }
  input[type=email], input[type=password] { width: 100%; padding: 8px; border: 1px solid #cbd0d6; border-radius: 6px; margin-bottom: 10px; }
  textarea { width: 100%; min-height: 240px; padding: 8px; border: 1px solid #cbd0d6; border-radius: 6px; font-family: ui-monospace, monospace; }
  button { background: #4338ca; color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
  button.secondary { background: #e2e4e8; color: #111; }
  button:disabled { opacity: .5; cursor: default; }
  .row { display: flex; gap: 10px; align-items: center; }
  .muted { color: #667; font-size: 12px; }
  .err { color: #b91c1c; }
  ul { list-style: none; padding: 0; margin: 0; max-height: 200px; overflow: auto; }
  li { padding: 6px 8px; border-radius: 6px; cursor: pointer; }
  li:hover { background: #eef; }
  li.active { background: #dde; font-weight: 600; }
  .grid { display: grid; grid-template-columns: 220px 1fr; gap: 16px; }
  @media (prefers-color-scheme: dark) { body { background:#0b0c0e; color:#e6e6e6; } .card { background:#161719; border-color:#26282c; } input,textarea { background:#0d0e10; color:#e6e6e6; border-color:#363a40; } button.secondary { background:#363a40; color:#fff; } li:hover { background:#1d2230; } li.active { background:#233049; } .muted { color:#8a8f98; } }
</style></head><body>
<header><b>Frontbase Console</b><span class="who" id="who"></span><button id="logout" class="secondary" hidden>Log out</button></header>
<main>
  <div id="login" class="card" hidden>
    <h2>Log in</h2>
    <p class="muted">The admin is the <code>ADMIN_EMAIL</code> / <code>ADMIN_PASSWORD</code> set as deploy secrets (the first-boot seed).</p>
    <form id="loginForm">
      <input id="email" type="email" placeholder="admin@example.com" required>
      <input id="password" type="password" placeholder="password" required>
      <div class="row"><button type="submit">Log in</button><span id="loginErr" class="err"></span></div>
    </form>
  </div>
  <div id="dash" hidden>
    <div class="card"><h2>Session</h2><pre id="me" class="muted"></pre></div>
    <div class="card"><h2>Pages &amp; drafts</h2>
      <div class="grid">
        <ul id="pages"></ul>
        <div>
          <div class="muted" id="editorHint">Select a page to edit its draft layout (JSON).</div>
          <div id="editor" hidden>
            <textarea id="layout" spellcheck="false"></textarea>
            <div class="row" style="margin-top:10px"><button id="save">Save draft</button><button id="publish" class="secondary">Publish</button><span id="editMsg" class="muted"></span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</main>
<script>
const api = (p, o) => fetch('/api/console' + p, { credentials: 'include', ...o });
const $ = (id) => document.getElementById(id);
let currentSlug = null;

async function boot() {
  const r = await api('/me');
  if (r.status === 401 || r.status === 403) return showLogin();
  if (!r.ok) { $('who').textContent = 'session error'; return; }
  const { user } = await r.json();
  showDash(user);
}

function showLogin() {
  $('login').hidden = false; $('dash').hidden = true; $('logout').hidden = true; $('who').textContent = '';
  $('email').focus();
}

async function showDash(user) {
  $('login').hidden = true; $('dash').hidden = false; $('logout').hidden = false;
  $('who').textContent = user ? (user.email + ' · ' + user.role) : '';
  $('me').textContent = JSON.stringify(user, null, 2);
  const pr = await api('/pages');
  const { pages } = pr.ok ? await pr.json() : { pages: [] };
  const ul = $('pages'); ul.innerHTML = '';
  (pages || []).forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.slug + (p.title ? ' — ' + p.title : '');
    li.onclick = () => loadDraft(p.slug, li);
    ul.appendChild(li);
  });
  if (!pages || !pages.length) ul.innerHTML = '<li class="muted">No pages yet</li>';
}

async function loadDraft(slug, li) {
  currentSlug = slug;
  document.querySelectorAll('#pages li').forEach(x => x.classList.remove('active'));
  if (li) li.classList.add('active');
  $('editor').hidden = false; $('editorHint').hidden = true; $('editMsg').textContent = '';
  const r = await api('/drafts/' + encodeURIComponent(slug));
  const data = r.ok ? await r.json() : {};
  let layout = data.draft?.layoutData;
  if (!layout) { // seed a minimal editable layout
    layout = JSON.stringify({ root: {}, content: [{ id: 'h', type: 'Heading', props: { content: slug, level: 'h1' } }] }, null, 2);
  }
  $('layout').value = layout;
}

async function saveDraft(publish) {
  if (!currentSlug) return;
  const btn = $(publish ? 'publish' : 'save'); btn.disabled = true; $('editMsg').textContent = '';
  try {
    const sr = await api('/drafts/' + encodeURIComponent(currentSlug), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ layoutData: $('layout').value }) });
    if (!sr.ok) throw new Error('save failed (' + sr.status + ')');
    if (!publish) { $('editMsg').textContent = 'draft saved'; return; }
    const pr = await api('/publish/' + encodeURIComponent(currentSlug), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: currentSlug }) });
    if (!pr.ok) throw new Error('publish failed (' + pr.status + ')');
    const res = await pr.json();
    $('editMsg').textContent = 'published · version ' + res.version;
  } catch (e) {
    $('editMsg').className = 'err'; $('editMsg').textContent = e.message;
  } finally { btn.disabled = false; }
}

$('loginForm').onsubmit = async (e) => {
  e.preventDefault(); $('loginErr').textContent = '';
  const r = await api('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: $('email').value, password: $('password').value }) });
  if (r.ok) { boot(); } else { $('loginErr').textContent = r.status === 401 ? 'invalid email or password' : ('error ' + r.status); }
};
$('logout').onclick = async () => { await api('/logout', { method: 'POST' }); showLogin(); };
$('save').onclick = () => saveDraft(false);
$('publish').onclick = () => saveDraft(true);
boot();
</script></body></html>`;

/** The /console admin shell — a single HTML route. */
export function adminShell(): Hono {
    return new Hono().get('/', (c) => c.html(ADMIN_HTML));
}
