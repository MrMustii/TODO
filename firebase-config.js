// ============================================================
// Firebase Configuration
// ============================================================
// 
// SETUP INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project (or use existing)
// 3. Click "Add app" → Web app (</> icon)
// 4. Copy your config values below
// 5. Go to Firestore Database → Create database → Start in test mode
// 6. (Optional) Set up Authentication for security
//
// ============================================================

  const firebaseConfig = {
    apiKey: "AIzaSyBblonPqFERDyTnVdmKKAUhqoRnI48rV8w",
    authDomain: "todo-9efef.firebaseapp.com",
    projectId: "todo-9efef",
    storageBucket: "todo-9efef.firebasestorage.app",
    messagingSenderId: "1066472536346",
    appId: "1:1066472536346:web:ad91c14676086f85d514a3",
    measurementId: "G-17BRXJVBBX"
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

// Initialize Firebase Auth
const auth = firebase.auth();

// User ID - set after authentication
let USER_ID = null;

// Auth helper object
const Auth = {
  // Sign in or create account
  async signIn(email, password) {
    try {
      // Try signing in first
      const result = await auth.signInWithEmailAndPassword(email, password);
      return { success: true, user: result.user };
    } catch (error) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        // User doesn't exist, create account
        try {
          const result = await auth.createUserWithEmailAndPassword(email, password);
          return { success: true, user: result.user, isNew: true };
        } catch (createError) {
          return { success: false, error: createError.message };
        }
      }
      return { success: false, error: error.message };
    }
  },

  // Sign out
  async signOut() {
    await auth.signOut();
    location.reload();
  },

  // Get current user
  getUser() {
    return auth.currentUser;
  }
};

// Promise that resolves when auth is ready
const authReady = new Promise((resolve) => {
  auth.onAuthStateChanged((user) => {
    if (user) {
      USER_ID = user.uid;
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('app-container').style.display = '';
      // Scroll to today now that the container is visible
      requestAnimationFrame(() => {
        if (typeof App !== 'undefined') App.scrollToToday(false);
      });
      console.log('Signed in as:', user.email, 'UID:', USER_ID);
      resolve(user);
    } else {
      document.getElementById('auth-screen').style.display = '';
      document.getElementById('app-container').style.display = 'none';
      resolve(null);
    }
  });
});

// Handle login form
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit');
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Please wait...';
    errorEl.textContent = '';
    
    const result = await Auth.signIn(email, password);
    
    if (!result.success) {
      errorEl.textContent = result.error;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
    // If success, onAuthStateChanged will handle UI
  });
});

console.log('Firebase initialized.');
