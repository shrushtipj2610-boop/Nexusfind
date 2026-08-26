import { createItemReport, getItemReport, markNotificationRead, watchItemReports, watchNotifications } from './database.js';
import { getCurrentUser, logout, signIn, signInWithGoogle, signUp, watchAuthentication } from './auth.js';
import { uploadItemImage } from './storage.js';

const authRoot = document.querySelector('#auth-root');
const appShell = document.querySelector('#app-shell');
let dashboardLoaded = false;

if (localStorage.nexusTheme === 'light') document.body.dataset.theme = 'light';

function applyLogoTheme() {
  const light = document.body.dataset.theme === 'light';
  const logo = light ? 'images/logo_nexusfind_light.png' : 'images/logo_nexusfind.png';
  document.querySelectorAll('.brand-logo, .mobile-logo, .auth-logo').forEach((img) => { img.src = logo; });
}

function showDashboardMessage(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function firebaseErrorMessage(error) {
  const messages = {
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'No account exists with this email.',
    'auth/email-already-in-use': 'An account already exists for this email address.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/too-many-requests': 'Too many login attempts. Please try again later.',
    'auth/operation-not-allowed': 'Email/password login is currently unavailable.'
  };
  return messages[error?.code] || 'We could not complete that request. Please try again.';
}

function renderAuth(mode = 'login', setupError = '', selectedRole = 'student') {
  const signingUp = mode === 'signup';
  authRoot.innerHTML = `<div class="auth-card-wrap"><img class="auth-logo" src="images/logo_nexusfind.png" alt="NexusFind logo"><h1 class="auth-title">Nexus<span>Find</span></h1><p class="auth-subtitle">Smart Lost & Found Portal</p><section class="auth-card"><h2>${signingUp ? 'Create your account' : 'Sign in to your account'}</h2><p>${signingUp ? 'Join your campus lost & found community.' : ''}</p><span class="auth-role-label">${signingUp ? 'SIGN UP AS' : 'LOGIN AS'}</span><div class="auth-roles"><button class="auth-role ${selectedRole === 'student' ? 'active' : ''}" data-role="student" type="button">🎓 &nbsp;Student</button><button class="auth-role ${selectedRole === 'staff' ? 'active' : ''}" data-role="staff" type="button">👤 &nbsp;Staff</button></div><form class="auth-form" id="auth-form" novalidate>${signingUp ? '<div class="field"><label for="auth-name">Full name</label><input class="input" id="auth-name" autocomplete="name" placeholder="Your full name" required></div>' : ''}<div class="field"><label for="auth-email">College email</label><input class="input" id="auth-email" type="email" autocomplete="email" placeholder="e.g. student@college.edu" required></div><div class="field"><label for="auth-password">Password</label><input class="input" id="auth-password" type="password" autocomplete="${signingUp ? 'new-password' : 'current-password'}" placeholder="Enter your password" required></div>${signingUp ? '<div class="field"><label for="auth-confirm-password">Confirm password</label><input class="input" id="auth-confirm-password" type="password" autocomplete="new-password" placeholder="Confirm your password" required></div>' : ''}<p class="auth-error" id="auth-error">${setupError}</p><button class="button" type="submit">${signingUp ? 'Create Account' : 'Sign In'}</button></form>${signingUp ? '<div class="auth-divider">OR</div><button class="google-button" type="button" id="google-auth">ⓖ &nbsp; Sign up with Google</button>' : ''}<p class="auth-footnote">${signingUp ? 'Already have an account? ' : 'New to NexusFind? '}<button class="auth-switch" data-auth-mode="${signingUp ? 'login' : 'signup'}" type="button">${signingUp ? 'Sign in' : 'Create an account'}</button></p></section></div>`;
  document.querySelectorAll('[data-auth-mode]').forEach((button) => { button.onclick = () => renderAuth(button.dataset.authMode, setupError, selectedRole); });
  document.querySelectorAll('[data-role]').forEach((button) => { button.onclick = () => renderAuth(mode, setupError, button.dataset.role); });
  document.querySelector('#auth-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.querySelector('#auth-error');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true; submitButton.textContent = signingUp ? 'Creating account...' : 'Signing in...'; error.textContent = '';
    try {
      if (signingUp) await signUp(document.querySelector('#auth-name').value, document.querySelector('#auth-email').value, document.querySelector('#auth-password').value, document.querySelector('#auth-confirm-password').value);
      else await signIn(document.querySelector('#auth-email').value, document.querySelector('#auth-password').value);
    } catch (authError) {
      console.error("Firebase login error:", authError.code, authError.message, authError);
      error.textContent = firebaseErrorMessage(authError); submitButton.disabled = false; submitButton.textContent = signingUp ? 'Create Account' : 'Sign In';
    }
  };
  const googleAuth = document.querySelector('#google-auth');
  if (googleAuth) {
    googleAuth.innerHTML = `<img class="google-icon" src="images/google.png" alt=""> Sign up with Google`;
    googleAuth.onclick = async (event) => {
      const button = event.currentTarget; const error = document.querySelector('#auth-error');
      button.disabled = true; button.textContent = 'Connecting to Google...'; error.textContent = '';
      try { await signInWithGoogle(); }
      catch (authError) { error.textContent = firebaseErrorMessage(authError); button.disabled = false; button.innerHTML = `ⓖ &nbsp; Sign up with Google`; }
    };
  }
}

async function showDashboard() {
  authRoot.hidden = true;
  appShell.hidden = false;
  document.querySelector('#logoutButton').disabled = false;
  if (!dashboardLoaded) {
    window.NexusFind = { createItemReport, getItemReport, markNotificationRead, watchItemReports, watchNotifications, uploadItemImage, currentUser: getCurrentUser, applyLogoTheme };
    await import('./script.js');
    dashboardLoaded = true;
  }
}

watchAuthentication((user, error) => {
  if (user) showDashboard();
  else { appShell.hidden = true; authRoot.hidden = false; renderAuth('login', error?.message || ''); applyLogoTheme(); }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  const button = document.querySelector('#logoutButton');
  button.disabled = true;
  try {
    await logout();
  } catch (error) {
    showDashboardMessage(firebaseErrorMessage(error));
    button.disabled = false;
  }
});
