'use strict';
// Deployed backend (Railway). The backend's FRONTEND_ORIGIN variable must include the domain this site is hosted on.
const API_BASE = 'https://backend-production-19c2f.up.railway.app';
const API = API_BASE + '/api';
const CATS = ['Education','Technology','Programming','Jobs','Business','Languages','Gaming','Entertainment'];
const HUES = [200,260,150,30,340,170,0,290];
const PAGE = 20, MAX_GROUPS = 100;
const $ = s => document.querySelector(s);
const tok = {
  get() { try { return localStorage.getItem('wgh_token'); } catch { return null; } },
  set(v) { try { localStorage.setItem('wgh_token', v); } catch {} },
  clear() { try { localStorage.removeItem('wgh_token'); } catch {} }
};
const st = { me: null, open: true, pending: null, ctl: null, q: '', cat: '', page: 1 };
const ready = { splash: false, init: false };
const USER_RE = /^[a-z0-9_]{3,24}$/;
const LINK_RE = /^https:\/\/(www\.)?chat\.whatsapp\.com\/[A-Za-z0-9_-]+\/?$/;

async function api(path, opt = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (tok.get()) h.Authorization = 'Bearer ' + tok.get();
  let r;
  try { r = await fetch(API + path, { ...opt, headers: h }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new Error('Cannot reach the server. Check your connection and try again.'); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && tok.get()) { tok.clear(); st.me = null; }
  if (!r.ok) throw new Error(r.status === 429 ? 'Too many requests. Please wait a few minutes and try again.' : d.message || 'Request failed (' + r.status + ').');
  return d;
}
const say = (el, text, ok) => { el.textContent = text; el.className = 'msg ' + (text ? (ok ? 'ok' : 'bad') : ''); };
const form = f => Object.fromEntries(new FormData(f).entries());
function maybeWelcome() {
  if (ready.splash && ready.init && !st.me && !$('#welcomeDlg').open) $('#welcomeDlg').showModal();
}

/* splash: exactly 3 seconds, data loads underneath */
setTimeout(() => {
  const s = $('#splash'); s.classList.add('hide');
  setTimeout(() => s.remove(), 450);
  ready.splash = true; maybeWelcome();
}, 3000);

/* navigation */
const views = ['home', 'add', 'profile', 'about', 'contact'];
function route() {
  let h = location.hash.slice(1) || 'home';
  const focusSearch = h === 'search';
  if (focusSearch) h = 'home';
  if (!views.includes(h)) h = 'home';
  document.querySelectorAll('[data-view]').forEach(s => s.hidden = s.dataset.view !== h);
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + (focusSearch ? 'search' : h)));
  $('#nav').classList.remove('open'); $('#burger').setAttribute('aria-expanded', 'false');
  if (focusSearch) $('#q').focus();
  if (h === 'add') prepAdd();
  if (h === 'profile') fillProfile();
  if (h === 'contact') loadReportList();
}
addEventListener('hashchange', route);
$('#burger').onclick = () => {
  const o = $('#nav').classList.toggle('open');
  $('#burger').setAttribute('aria-expanded', String(o));
};

/* groups */
function card(g) {
  const i = Math.max(0, CATS.indexOf(g.category));
  const c = document.createElement('article'); c.className = 'card';
  c.innerHTML = '<div class="ic" aria-hidden="true"></div><div class="cb"><h3></h3><span class="tag"></span><p></p><button class="btn" type="button"></button></div>';
  const ic = c.querySelector('.ic');
  ic.style.background = 'hsl(' + HUES[i] + ' 55% 40%)';
  ic.textContent = (g.name || '?').trim().charAt(0).toUpperCase();
  c.querySelector('h3').textContent = g.name;
  c.querySelector('.tag').textContent = g.category;
  const p = c.querySelector('p'); p.textContent = g.description || ''; p.hidden = !g.description;
  const b = c.querySelector('button'); b.textContent = 'Join'; b.setAttribute('aria-label', 'Join ' + g.name);
  c.onclick = () => askJoin(g);
  b.onclick = e => { e.stopPropagation(); askJoin(g); };
  return c;
}
async function loadGroups(append = false) {
  if (st.ctl) st.ctl.abort();
  st.ctl = new AbortController();
  const state = $('#state'), grid = $('#grid'), more = $('#more');
  if (append) st.page++;
  else {
    st.page = 1; grid.replaceChildren(); more.hidden = true; $('#count').textContent = '';
    state.innerHTML = '<div class="spin" role="status" aria-label="Loading groups"></div>';
  }
  const p = new URLSearchParams({ limit: PAGE, page: st.page });
  if (st.q) p.set('q', st.q);
  if (st.cat) p.set('category', st.cat);
  try {
    const d = await api('/groups?' + p, { signal: st.ctl.signal });
    const list = d.groups || [];
    st.open = (d.total || 0) < MAX_GROUPS;
    state.replaceChildren();
    grid.append(...list.map(card));
    const shown = grid.children.length;
    more.hidden = list.length < PAGE;
    $('#count').textContent = shown === 0 ? '0 groups'
      : (st.q || st.cat) ? shown + ' matching ' + (shown === 1 ? 'group' : 'groups')
      : 'Showing ' + shown + ' of ' + d.total + (d.total === 1 ? ' group' : ' groups');
    if (!shown) {
      const n = document.createElement('div'); n.className = 'note';
      n.textContent = (st.q || st.cat) ? 'No groups match your search. Try another word or category.' : 'No groups yet. Be the first to add one from the Add Group page.';
      state.append(n);
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (append) { st.page--; $('#count').textContent = e.message; return; }
    state.innerHTML = '';
    const n = document.createElement('div'); n.className = 'note';
    n.textContent = e.message + ' ';
    const r = document.createElement('button'); r.className = 'btn ghost'; r.textContent = 'Try again'; r.onclick = () => loadGroups();
    n.append(r); state.append(n);
  }
}
let deb; $('#q').oninput = e => { clearTimeout(deb); deb = setTimeout(() => { st.q = e.target.value.trim(); loadGroups(); }, 350); };
$('#more').onclick = () => loadGroups(true);
function buildChips() {
  const box = $('#chips');
  ['All', ...CATS].forEach(c => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (c === 'All' ? ' on' : ''); b.textContent = c;
    b.onclick = () => {
      st.cat = c === 'All' ? '' : c;
      box.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
      loadGroups();
    };
    box.append(b);
  });
}

/* join dialog */
function askJoin(g) {
  if (!st.me) { $('#welcomeDlg').showModal(); return; }
  st.pending = g; $('#joinTitle').textContent = 'Join "' + g.name + '"?';
  say($('#joinMsg'), ''); $('#joinYes').disabled = false; $('#joinDlg').showModal();
}
$('#joinNo').onclick = () => $('#joinDlg').close();
$('#joinYes').onclick = async () => {
  const g = st.pending, btn = $('#joinYes');
  btn.disabled = true; say($('#joinMsg'), 'Saving...', true);
  const w = window.open('about:blank', '_blank');
  try {
    const d = await api('/groups/' + encodeURIComponent(g._id) + '/join-click', { method: 'POST', body: '{}' });
    if (!d.success || !LINK_RE.test(d.inviteLink || '')) throw new Error('The click could not be saved.');
    if (w) { w.opener = null; w.location.href = d.inviteLink; } else location.href = d.inviteLink;
    $('#joinDlg').close();
  } catch (e) {
    if (w) w.close();
    say($('#joinMsg'), e.message + ' Nothing was recorded, so WhatsApp was not opened.', false); btn.disabled = false;
    if (!st.me) { $('#joinDlg').close(); maybeWelcome(); }
  }
};

/* profile */
async function saveProfile(f, msg, create) {
  const v = form(f);
  v.name = v.name.trim(); v.username = v.username.trim().toLowerCase();
  if (!v.name) return say(msg, 'Enter your name.', false), false;
  if (!USER_RE.test(v.username)) return say(msg, 'Username must be 3-24 letters, numbers or underscores.', false), false;
  try {
    const d = create ? await api('/users', { method: 'POST', body: JSON.stringify(v) }) : await api('/users/me', { method: 'PATCH', body: JSON.stringify(v) });
    if (d.sessionToken) tok.set(d.sessionToken);
    st.me = d.user; say(msg, 'Profile saved.', true); return true;
  } catch (e) { say(msg, e.message, false); return false; }
}
function fillProfile() {
  const f = $('#profForm');
  if (st.me) { f.name.value = st.me.name; f.username.value = st.me.username; say($('#profMsg'), ''); }
  else say($('#profMsg'), 'Create your profile to join groups, add groups and send reports.', true);
}
$('#profForm').onsubmit = async e => { e.preventDefault(); await saveProfile(e.target, $('#profMsg'), !st.me); };
$('#welcomeForm').onsubmit = async e => { e.preventDefault(); if (await saveProfile(e.target, $('#welMsg'), true)) $('#welcomeDlg').close(); };
$('#welLater').onclick = () => $('#welcomeDlg').close();

/* add group */
function prepAdd() {
  const f = $('#addForm'), m = $('#addMsg');
  f.submitterName.value = st.me ? st.me.name : '';
  f.submitterUsername.value = st.me ? st.me.username : '';
  f.querySelectorAll('input,select,textarea,button').forEach(x => x.disabled = !st.open);
  if (!st.open) say(m, 'We have reached the limit of ' + MAX_GROUPS + ' groups, so new submissions are paused. Please check back later.', false);
  else if (!st.me) say(m, 'Create your profile first on the Profile page.', false);
  else say(m, '');
}
$('#addForm').onsubmit = async e => {
  e.preventDefault();
  const f = e.target, m = $('#addMsg'), v = form(f);
  if (!st.me) return say(m, 'Create your profile first on the Profile page.', false);
  if (!v.name.trim() || !v.description.trim() || !v.category) return say(m, 'Fill in every field.', false);
  if (!LINK_RE.test(v.inviteLink.trim())) return say(m, 'Use a link like https://chat.whatsapp.com/XXXXXXXXXX', false);
  if (!f.admin.checked) return say(m, 'Please confirm you are the group admin.', false);
  $('#addBtn').disabled = true;
  try {
    const d = await api('/groups', { method: 'POST', body: JSON.stringify({ name: v.name.trim(), category: v.category, description: v.description.trim(), inviteLink: v.inviteLink.trim(), isAdmin: true }) });
    f.reset(); prepAdd();
    say(m, d.message ? d.message + ' It will appear after review.' : 'Submitted. It will appear after review.', true);
  } catch (err) { say(m, err.message, false); }
  $('#addBtn').disabled = !st.open;
};

/* report */
async function loadReportList() {
  const s = $('#repForm').groupId; s.innerHTML = '<option value="">Choose a group</option>';
  try {
    for (let p = 1; p <= 5; p++) {
      const d = await api('/groups?limit=' + PAGE + '&page=' + p);
      (d.groups || []).forEach(g => { const o = document.createElement('option'); o.value = g._id; o.textContent = g.name; s.append(o); });
      if ((d.groups || []).length < PAGE) break;
    }
  } catch (e) { say($('#repMsg'), e.message, false); }
}
$('#repForm').onsubmit = async e => {
  e.preventDefault(); const v = form(e.target), m = $('#repMsg');
  if (!st.me) return say(m, 'Create your profile first on the Profile page.', false);
  if (!v.groupId) return say(m, 'Choose the group you want to report.', false);
  if (v.reason.trim().length < 10) return say(m, 'Describe the problem in at least 10 characters.', false);
  try {
    await api('/groups/' + encodeURIComponent(v.groupId) + '/report', { method: 'POST', body: JSON.stringify({ reason: v.reason.trim() }) });
    say(m, 'Report sent. Thank you.', true); e.target.reset();
  } catch (err) { say(m, err.message, false); }
};

/* init */
(function () {
  const s = $('#addForm').category;
  s.innerHTML = '<option value="">Choose a category</option>' + CATS.map(c => '<option>' + c + '</option>').join('');
})();
buildChips();
(async () => {
  if (tok.get()) { try { st.me = (await api('/users/me')).user; } catch {} }
  ready.init = true; maybeWelcome();
  route(); loadGroups();
})();
