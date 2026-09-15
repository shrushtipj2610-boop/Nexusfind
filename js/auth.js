import { auth, db, isConfigured } from './firebase.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
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

export async function signUp(name, email, password, confirmPassword, role) {
  requireAuthConfiguration();
  if (!name.trim() || !email.trim() || !password || !confirmPassword) throw new Error('Complete all fields to create your account.');
  if (password.length < 6) throw new Error('Your password must contain at least 6 characters.');
  if (password !== confirmPassword) throw new Error('Passwords do not match.');
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: name.trim() });
  await setDoc(doc(db, 'users', credential.user.uid), {
    username: email.trim(),
    email: credential.user.email,
    uid: credential.user.uid,
    role: role === 'staff' ? 'staff' : 'student'
  });
  return credential;
}

export async function logout() {
  requireAuthConfiguration();
  return signOut(auth);
}
