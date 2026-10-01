import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp, runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// Firebase web config is not a secret; access is enforced by Firestore security rules.
const firebaseConfig = {
  apiKey: 'AIzaSyB75g4ZZ9ZARgLsfBohtDLAeFx3JS6AqVw',
  authDomain: 'dfir-decision-tree.firebaseapp.com',
  projectId: 'dfir-decision-tree',
  storageBucket: 'dfir-decision-tree.firebasestorage.app',
  messagingSenderId: '276070052208',
  appId: '1:276070052208:web:03cc29fb424a0439301fb5'
};

// Must match the email in the Firestore rules; this copy only controls which UI is shown.
export const ADMIN_EMAIL = 'joshuagayjh@gmail.com';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp, runTransaction,
  signInWithEmailAndPassword, onAuthStateChanged, signOut
};
