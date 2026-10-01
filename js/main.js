import { auth, ADMIN_EMAIL, signInWithEmailAndPassword, onAuthStateChanged, signOut } from './firebase.js';
import { initDecisionTrees, setAdmin, refreshLayout as refreshTrees } from './decision-trees.js';
import { initMindMaps, openMap, parseCodeFromUrl, refreshLayout as refreshMaps } from './mind-maps.js';

const TAB_KEY = 'last_tab';

const tabs = {
  trees: { button: document.getElementById('tab-trees'), view: document.getElementById('view-trees'), refresh: refreshTrees },
  maps: { button: document.getElementById('tab-maps'), view: document.getElementById('view-maps'), refresh: refreshMaps }
};

function showTab(name) {
  for (const [key, t] of Object.entries(tabs)) {
    const active = key === name;
    t.button.classList.toggle('active', active);
    t.button.setAttribute('aria-selected', String(active));
    t.view.hidden = !active;
  }
  try { localStorage.setItem(TAB_KEY, name); } catch {}
  tabs[name].refresh();
}

tabs.trees.button.addEventListener('click', () => showTab('trees'));
tabs.maps.button.addEventListener('click', () => showTab('maps'));

// ---- Admin login ----
const dialog = document.getElementById('login-dialog');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginSubmit = document.getElementById('login-submit');

document.getElementById('btn-login').addEventListener('click', () => {
  loginError.hidden = true;
  dialog.showModal();
  document.getElementById('login-email').focus();
});
document.getElementById('login-cancel').addEventListener('click', () => dialog.close());
document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginSubmit.disabled = true;
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    document.getElementById('login-password').value = '';
    dialog.close();
  } catch (err) {
    loginError.textContent = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(err.code)
      ? 'Incorrect email or password.'
      : err.code === 'auth/too-many-requests'
        ? 'Too many attempts. Wait a few minutes and try again.'
        : 'Sign-in failed. Check your connection and try again.';
    loginError.hidden = false;
  } finally {
    loginSubmit.disabled = false;
  }
});

onAuthStateChanged(auth, (user) => {
  const admin = !!user && user.email === ADMIN_EMAIL;
  document.body.classList.toggle('is-admin', admin);
  document.getElementById('btn-login').hidden = !!user;
  document.getElementById('btn-logout').hidden = !user;
  document.getElementById('admin-badge').textContent = user ? (admin ? 'Admin' : `Signed in: ${user.email} (not admin)`) : '';
  setAdmin(admin);
});

// ---- Start ----
initDecisionTrees();
initMindMaps();

const sharedCode = parseCodeFromUrl();
if (sharedCode) {
  showTab('maps');
  openMap(sharedCode);
} else {
  let last = null;
  try { last = localStorage.getItem(TAB_KEY); } catch {}
  showTab(last === 'maps' ? 'maps' : 'trees');
}
