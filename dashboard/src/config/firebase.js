import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Get these values from Firebase Console → Project Settings → General → Your apps → Web app
// If no web app exists yet, click "Add app" → Web icon → register it
const firebaseConfig = {
  apiKey: "REPLACE_WITH_WEB_API_KEY",          // Firebase Console → Project Settings → Web API Key
  authDomain: "abhishek-assistant-d2e8f.firebaseapp.com",
  projectId: "abhishek-assistant-d2e8f",
  storageBucket: "abhishek-assistant-d2e8f.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",  // Firebase Console → Project Settings → Cloud Messaging
  appId: "REPLACE_WITH_APP_ID"                  // Firebase Console → Project Settings → Your apps
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Single-user dashboard — hardcode your Telegram user ID
export const USER_ID = '7307120782';
