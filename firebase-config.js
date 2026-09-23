const firebaseConfig = {
  apiKey: "AIzaSyC-yfJFaTqFtYG3CS0x1GmjjWRSqEgRKQ8",
  authDomain: "certicheck-01.firebaseapp.com",
  projectId: "certicheck-01",
  storageBucket: "certicheck-01.firebasestorage.app",
  messagingSenderId: "633773245700",
  appId: "1:633773245700:web:a9434170a0f2bb95fc3c51",
  measurementId: "G-3FFS0219BV"
};

window.certicheckFirebaseConfig = firebaseConfig;

if (typeof firebase !== 'undefined' && firebase.apps && Array.isArray(firebase.apps)) {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
} else {
  console.warn('Firebase SDK not loaded yet. Include the Firebase scripts before firebase-config.js.');
}

window.certicheckFirebase = typeof firebase !== 'undefined' ? firebase : null;
window.certicheckFirebaseApp = typeof firebase !== 'undefined' && firebase.apps ? firebase.apps[0] || null : null;
window.certicheckFirebaseAuth = window.certicheckFirebase ? window.certicheckFirebase.auth() : null;

if (window.certicheckFirebaseAuth && window.firebase?.auth?.Auth?.Persistence?.LOCAL) {
  window.certicheckFirebaseAuth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL)
    .catch((error) => console.warn('Firebase Auth persistence setup failed:', error.message || error));
}

window.getFirebaseAuth = function getFirebaseAuth() {
  if (!window.certicheckFirebaseAuth && typeof firebase !== 'undefined') {
    window.certicheckFirebaseAuth = firebase.auth();
  }
  return window.certicheckFirebaseAuth;
};

window.signOutFirebaseUser = async function signOutFirebaseUser() {
  const auth = window.getFirebaseAuth();
  if (auth?.currentUser) {
    await auth.signOut();
  }
};
