/**
 * firebase.js – Studio Midori Firebase Configuration
 *
 * HOW TO GET THESE VALUES:
 * 1. Go to https://console.firebase.google.com/
 * 2. Click "Add project" → name it "studio-midori" → Continue
 * 3. Skip Google Analytics → Create project
 * 4. Click the </> (Web) icon to add a web app
 * 5. Register the app → copy the firebaseConfig object below
 * 6. In the left sidebar: Build → Realtime Database → Create database
 *    → Start in TEST MODE (you can lock it down later) → Enable
 * 7. Copy your databaseURL from the Realtime Database page and paste below
 *
 * IMPORTANT: This file is safe to commit — Firebase Realtime Database
 * security rules protect your data, not the config keys.
 * Set rules to authenticated-only once you go live.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';

// ── PASTE YOUR CONFIG HERE ────────────────────────────────────────────
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};
// ─────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app, firebaseConfig.databaseURL);
