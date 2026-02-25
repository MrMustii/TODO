// ============================================================
// Firebase Configuration - TEMPLATE
// ============================================================
// 
// SETUP INSTRUCTIONS:
// 1. Copy this file and rename to: firebase-config.js
// 2. Go to https://console.firebase.google.com/
// 3. Create a new project (or use existing)
// 4. Click "Add app" → Web app (</> icon)
// 5. Copy your config values below
// 6. Go to Firestore Database → Create database → Start in test mode
//
// ============================================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();

// Enable offline persistence (works offline, syncs when online)
db.enablePersistence({ synchronizeTabs: true })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence not supported in this browser');
    }
  });

// Device/User ID - uses localStorage to maintain same ID per device
// For multi-device sync, all devices should use the same USER_ID
const USER_ID = localStorage.getItem('todo_user_id') || (() => {
  const id = 'user_' + (crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9));
  localStorage.setItem('todo_user_id', id);
  return id;
})();

console.log('Firebase initialized. User ID:', USER_ID);
