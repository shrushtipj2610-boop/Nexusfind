import { auth, db, isConfigured } from './firebase.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
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

function usernameDocumentId(username) {
  const normalizedUsername = username.trim().normalize('NFKC').toLowerCase();
  if (!normalizedUsername) throw new Error('Enter your username and password.');
  return encodeURIComponent(normalizedUsername);
}

function usernameNotFoundError() {
  const error = new Error('Username not found.');
  error.code = 'auth/username-not-found';
  return error;
}

async function getEmailForUsername(username) {
  if (!db) throw new Error('Firebase is not configured yet. Add your web app configuration in js/firebase.js.');
  const profile = await getDoc(doc(db, 'users', usernameDocumentId(username)));
  const email = profile.data()?.email;
  if (!profile.exists() || typeof email !== 'string' || !email) throw usernameNotFoundError();
  return email;
}

export async function signIn(username, password) {
  requireAuthConfiguration();
  if (!username || !password) throw new Error('Enter your username and password.');
  let email;
  try {
    email = await getEmailForUsername(username);
  } catch (error) {
    console.error('Username lookup error:', error.code, error.message, error);
    throw error;
  }

  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error('Firebase Authentication error:', error.code, error.message, error);
    throw error;
  }
}

export async function signUp(name, username, email, password, confirmPassword, role) {
  requireAuthConfiguration();
  if (!name.trim() || !username.trim() || !email.trim() || !password || !confirmPassword) throw new Error('Complete all fields to create your account.');
  if (password.length < 6) throw new Error('Your password must contain at least 6 characters.');
  if (password !== confirmPassword) throw new Error('Passwords do not match.');
  const usernameId = usernameDocumentId(username);
  if (await getDoc(doc(db, 'users', usernameId)).then((profile) => profile.exists())) {
    const error = new Error('This username is already in use.');
    error.code = 'auth/username-already-in-use';
    throw error;
  }
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: name.trim() });
  await setDoc(doc(db, 'users', usernameId), {
    username: username.trim(),
    email: credential.user.email,
    uid: credential.user.uid,
    role: role === 'staff' ? 'staff' : 'student'
  });
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
