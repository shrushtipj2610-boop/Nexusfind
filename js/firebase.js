import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Replace every value below with the web app configuration from your Firebase project.
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCO5sLy92nvhOWXW_RtJzVhLsbCnJcx08E",
  authDomain: "nexusfind-7f8fc.firebaseapp.com",
  projectId: "nexusfind-7f8fc",
  storageBucket: "nexusfind-7f8fc.firebasestorage.app",
  messagingSenderId: "541440462192",
  appId: "1:541440462192:web:24ab62c1f7d08a8ecc13b5",
  measurementId: "G-5WVL3GMGZS"
};

const isConfigured = !Object.values(firebaseConfig).some((value) => value.startsWith('PASTE_'));
const app = isConfigured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

export { app, auth, db, isConfigured };
