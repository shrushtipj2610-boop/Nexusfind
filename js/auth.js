import { auth, isConfigured } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  signInWithPopup,
  signInWithEmailAndPassword,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

export function getCurrentUser() {
  return auth?.currentUser ?? null;
}

export function getUserDetails() {
  const user = getCurrentUser();
  return user ? { uid: user.uid, email: user.email || null, name: user.displayName || null } : null;
}

function requireAuthConfiguration() {
  if (!isConfigured || !auth) {
    throw new Error('Firebase is not configured yet. Add your web app configuration in js/firebase.js.');
  }
}

export function watchAuthentication(callback) {
  if (!isConfigured || !auth) {
    callback(null, new Error('Firebase is not configured yet. Add your web app configuration in js/firebase.js.'));
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => callback(user, null), (error) => callback(null, error));
}

export async function signIn(email, password) {
  requireAuthConfiguration();
  if (!email || !password) throw new Error('Enter your email address and password.');
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signUp(name, email, password, confirmPassword) {
  requireAuthConfiguration();
  if (!name.trim() || !email.trim() || !password || !confirmPassword) throw new Error('Complete all fields to create your account.');
  if (password.length < 6) throw new Error('Your password must contain at least 6 characters.');
  if (password !== confirmPassword) throw new Error('Passwords do not match.');
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: name.trim() });
  return credential;
}

export async function signInWithGoogle() {
  requireAuthConfiguration();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

export async function logout() {
  requireAuthConfiguration();
  return signOut(auth);
}
