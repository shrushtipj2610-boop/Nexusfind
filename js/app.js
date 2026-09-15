import { createItemReport, getItemReport, markNotificationRead, watchItemReports, watchNotifications } from './database.js';
import { getCurrentUser, logout, signUp, watchAuthentication } from './auth.js';

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
    'auth/email-already-in-use': 'An account already exists for this email address.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/too-many-requests': 'Too many login attempts. Please try again later.',
    'auth/operation-not-allowed': 'Account creation is currently unavailable.',
    'permission-denied': 'Username availability could not be checked. Deploy the users lookup rule before creating an account.',
    'unavailable': 'Firestore is unavailable. Check your connection and try again.',
    'deadline-exceeded': 'Firestore did not respond in time. Please try again.',
    'auth/network-request-failed': 'Firebase could not be reached. Check your connection and try again.',
    'auth/invalid-api-key': 'Firebase configuration is invalid. Check the Firebase web configuration.',
    'auth/app-not-authorized': 'This app is not authorized to use the configured Firebase project.',
    'auth/configuration-not-found': 'Firebase Authentication is not configured for this project.'
  };
  if (messages[error?.code]) return messages[error.code];
  return `Authentication failed${error?.code ? ` (${error.code})` : ''}: ${error?.message || 'Unknown Firebase error.'}`;
}

function renderCreateAccount(setupError = '', selectedRole = 'student') {
  authRoot.innerHTML = `<div class="auth-card-wrap"><img class="auth-logo" src="images/logo_nexusfind.png" alt="NexusFind logo"><h1 class="auth-title">Nexus<span>Find</span></h1><p class="auth-subtitle">Smart Lost & Found Portal</p><section class="auth-card"><h2>Create your account</h2><p>Join your campus lost & found community.</p><span class="auth-role-label">SIGN UP AS</span><div class="auth-roles"><button class="auth-role ${selectedRole === 'student' ? 'active' : ''}" data-role="student" type="button">🎓 &nbsp;Student</button><button class="auth-role ${selectedRole === 'staff' ? 'active' : ''}" data-role="staff" type="button">👤 &nbsp;Staff</button></div><form class="auth-form" id="auth-form" novalidate><div class="field"><label for="auth-name">Full name</label><input class="input" id="auth-name" autocomplete="name" placeholder="Your full name" required></div><div class="field"><label for="auth-email">College email</label><input class="input" id="auth-email" name="email" type="email" autocomplete="email" placeholder="e.g. student@college.edu" required></div><div class="field"><label for="auth-password">Password</label><input class="input" id="auth-password" type="password" autocomplete="new-password" placeholder="Enter your password" required></div><div class="field"><label for="auth-confirm-password">Confirm password</label><input class="input" id="auth-confirm-password" type="password" autocomplete="new-password" placeholder="Confirm your password" required></div><p class="auth-error" id="auth-error">${setupError}</p><button class="button" type="submit">Create Account</button></form></section></div>`;
  document.querySelectorAll('[data-role]').forEach((button) => { button.onclick = () => renderCreateAccount(setupError, button.dataset.role); });
  document.querySelector('#auth-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.querySelector('#auth-error');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Creating account...';
    error.textContent = '';
    try {
      await signUp(document.querySelector('#auth-name').value, document.querySelector('#auth-email').value, document.querySelector('#auth-password').value, document.querySelector('#auth-confirm-password').value, selectedRole);
    } catch (authError) {
      console.error('Account creation error:', authError.code, authError.message, authError);
      error.textContent = firebaseErrorMessage(authError);
      submitButton.disabled = false;
      submitButton.textContent = 'Create Account';
    }
  };
}

async function showDashboard() {
  authRoot.hidden = true;
  appShell.hidden = false;
  document.querySelector('#logoutButton').disabled = false;
  if (!dashboardLoaded) {
    window.NexusFind = { createItemReport, getItemReport, markNotificationRead, watchItemReports, watchNotifications, currentUser: getCurrentUser, applyLogoTheme };
    await import('./script.js');
    dashboardLoaded = true;
  }
}

watchAuthentication((user, error) => {
  if (user) showDashboard();
  else { appShell.hidden = true; authRoot.hidden = false; renderCreateAccount(error?.message || ''); applyLogoTheme(); }
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
