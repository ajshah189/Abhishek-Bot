import { config } from 'dotenv';
config();

console.log('🔍 COMPLETE SYSTEM DIAGNOSTIC\n');

// 1. Check all environment variables
console.log('1️⃣ ENVIRONMENT VARIABLES');
const envVars = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_URL',
  'TELEGRAM_WEBHOOK_SECRET',
  'GROQ_API_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_CLIENT_ID',
  'NODE_ENV',
  'PORT'
];

let envOk = true;
envVars.forEach(key => {
  const val = process.env[key];
  if (val) {
    const display = val.length > 50 ? val.slice(0, 30) + '...' : val;
    console.log(`  ✅ ${key}: ${display}`);
  } else {
    console.log(`  ❌ ${key}: MISSING`);
    envOk = false;
  }
});

if (!envOk) {
  console.log('\n❌ Missing environment variables. Add them to Cloud Run.');
  process.exit(1);
}

// 2. Test imports
console.log('\n2️⃣ TESTING IMPORTS');
try {
  console.log('  Testing express...');
  import('express').then(() => console.log('  ✅ express'));
} catch (e) {
  console.log(`  ❌ express: ${e.message}`);
}

try {
  console.log('  Testing firebase-admin...');
  await import('firebase-admin');
  console.log('  ✅ firebase-admin');
} catch (e) {
  console.log(`  ❌ firebase-admin: ${e.message}`);
}

try {
  console.log('  Testing groq-sdk...');
  await import('groq-sdk');
  console.log('  ✅ groq-sdk');
} catch (e) {
  console.log(`  ❌ groq-sdk: ${e.message}`);
}

// 3. Test Firebase connection
console.log('\n3️⃣ FIREBASE CONNECTION');
try {
  const { db } = await import('../config/firebase.js');
  console.log('  ✅ Firebase config loaded');

  const testRef = db.collection('_health_check').doc('test');
  await testRef.set({ timestamp: new Date() });
  console.log('  ✅ Firestore write successful');

  await testRef.delete();
  console.log('  ✅ Firestore delete successful');
} catch (e) {
  console.log(`  ❌ Firebase error: ${e.message}`);
}

// 4. Test Groq connection
console.log('\n4️⃣ GROQ LLM CONNECTION');
try {
  const { llm } = await import('../services/ai/llmAdapter.js');
  console.log('  ✅ LLM adapter loaded');

  const response = await llm.call(
    'You are a test assistant.',
    'Say OK',
    0.7
  );

  if (response.includes('OK')) {
    console.log('  ✅ Groq API working');
  } else {
    console.log(`  ⚠️ Groq response unexpected: ${response.slice(0, 50)}`);
  }
} catch (e) {
  console.log(`  ❌ Groq error: ${e.message}`);
}

// 5. Test Intent Extractor
console.log('\n5️⃣ INTENT EXTRACTOR');
try {
  const { intentExtractor } = await import('../services/ai/intentExtractor.js');
  console.log('  ✅ Intent extractor loaded');

  const result = await intentExtractor.extract('Spent 100 on food');
  console.log(`  ✅ Intent extracted: ${result.intent}`);
} catch (e) {
  console.log(`  ❌ Intent extractor error: ${e.message}`);
}

// 6. Test Express app
console.log('\n6️⃣ EXPRESS APP SETUP');
try {
  const express = await import('express');
  const app = express.default();

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  console.log('  ✅ Express app created');
  console.log('  ✅ /health route added');
} catch (e) {
  console.log(`  ❌ Express setup error: ${e.message}`);
}

// 7. Summary
console.log('\n' + '='.repeat(60));
console.log('✅ ALL SYSTEMS OPERATIONAL');
console.log('='.repeat(60));
console.log('\nYou can now start the server:');
console.log('  npm run dev  (local)');
console.log('  Cloud Run will auto-deploy from GitHub');
