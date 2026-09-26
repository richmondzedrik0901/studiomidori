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
  apiKey: "AIzaSyDrjxrYApUFAybGSzxilieJAcZA4n3kgjQ",
  authDomain: "studiomidori-abf73.firebaseapp.com",
  projectId: "studiomidori-abf73",
  storageBucket: "studiomidori-abf73.firebasestorage.app",
  messagingSenderId: "778344119164",
  appId: "1:778344119164:web:648fb1d4e9979ac1f902f9",
  databaseURL: "https://studiomidori-abf73-default-rtdb.asia-southeast1.firebasedatabase.app",
  measurementId: "G-KKP605V4P0"
};
// ─────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app, firebaseConfig.databaseURL);
