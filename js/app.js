import { createItemReport } from './database.js';
import { logout, signIn, signInWithGoogle, signUp, watchAuthentication } from './auth.js';

const authRoot = document.querySelector('#auth-root');
const appShell = document.querySelector('#app-shell');
let dashboardLoaded = false;

function showDashboardMessage(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function firebaseErrorMessage(error) {
  const messages = {
    'auth/invalid-credential': 'Incorrect email address or password.',
    'auth/email-already-in-use': 'An account already exists for this email address.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.'
  };
  return messages[error?.code] || error?.message || 'We could not complete that request. Please try again.';
}

function renderAuth(mode = 'login', setupError = '', selectedRole = 'student') {
  const signingUp = mode === 'signup';
  authRoot.innerHTML = `<div class="auth-card-wrap"><img class="auth-logo" src="images/logo_nexusfind.png" alt="NexusFind logo"><h1 class="auth-title">Nexus<span>Find</span></h1><p class="auth-subtitle">Smart Lost &amp; Found Portal</p><section class="auth-card"><h2>${signingUp ? 'Create your account' : 'Sign in to your account'}</h2><p>${signingUp ? 'Join your campus lost & found community.' : ''}</p><span class="auth-role-label">${signingUp ? 'SIGN UP AS' : 'LOGIN AS'}</span><div class="auth-roles"><button class="auth-role ${selectedRole === 'student' ? 'active' : ''}" data-role="student" type="button">🎓 &nbsp;Student</button><button class="auth-role ${selectedRole === 'staff' ? 'active' : ''}" data-role="staff" type="button">👤 &nbsp;Staff</button></div><form class="auth-form" id="auth-form" novalidate>${signingUp ? '<div class="field"><label for="auth-name">Full name</label><input class="input" id="auth-name" autocomplete="name" placeholder="Your full name" required></div>' : ''}<div class="field"><label for="auth-email">College email</label><input class="input" id="auth-email" type="email" autocomplete="email" placeholder="e.g. student@college.edu" required></div><div class="field"><label for="auth-password">Password</label><input class="input" id="auth-password" type="password" autocomplete="${signingUp ? 'new-password' : 'current-password'}" placeholder="Enter your password" required></div>${signingUp ? '<div class="field"><label for="auth-confirm-password">Confirm password</label><input class="input" id="auth-confirm-password" type="password" autocomplete="new-password" placeholder="Confirm your password" required></div>' : ''}<p class="auth-error" id="auth-error">${setupError}</p><button class="button" type="submit">${signingUp ? 'Create Account' : 'Sign In'}</button></form><div class="auth-divider">OR</div><button class="google-button" type="button" id="google-auth">ⓖ &nbsp; ${signingUp ? 'Sign up with Google' : 'Continue with Google'}</button><p class="auth-footnote">${signingUp ? 'Already have an account? ' : 'New to NexusFind? '}<button class="auth-switch" data-auth-mode="${signingUp ? 'login' : 'signup'}" type="button">${signingUp ? 'Sign in' : 'Create an account'}</button></p></section></div>`;
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
      error.textContent = firebaseErrorMessage(authError); submitButton.disabled = false; submitButton.textContent = signingUp ? 'Create Account' : 'Sign In';
    }
  };
  document.querySelector('#google-auth').innerHTML = `<img class="google-icon" src="images/google.png" alt=""> ${signingUp ? 'Sign up with Google' : 'Continue with Google'}`;
  document.querySelector('#google-auth').onclick = async (event) => {
    const button = event.currentTarget; const error = document.querySelector('#auth-error');
    button.disabled = true; button.textContent = 'Connecting to Google...'; error.textContent = '';
    try { await signInWithGoogle(); }
    catch (authError) { error.textContent = firebaseErrorMessage(authError); button.disabled = false; button.innerHTML = `ⓖ &nbsp; ${signingUp ? 'Sign up with Google' : 'Continue with Google'}`; }
  };
}

async function showDashboard() {
  authRoot.hidden = true;
  appShell.hidden = false;
  document.querySelector('#logoutButton').disabled = false;
  if (!dashboardLoaded) {
    window.NexusFind = { createItemReport };
    await import('./script.js');
    dashboardLoaded = true;
  }
}

watchAuthentication((user, error) => {
  if (user) showDashboard();
  else { appShell.hidden = true; authRoot.hidden = false; renderAuth('login', error?.message || ''); }
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
