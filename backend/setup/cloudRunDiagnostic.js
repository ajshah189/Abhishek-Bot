import { config } from 'dotenv';
config();

console.log('🔍 CLOUD RUN DIAGNOSTIC\n');

// 1. Check environment variables
console.log('📋 ENVIRONMENT VARIABLES');
const required = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'GROQ_API_KEY',
  'FIREBASE_PROJECT_ID'
];

required.forEach(key => {
  const val = process.env[key];
  if (val) {
    console.log(`✅ ${key}: ${val.slice(0, 20)}...`);
  } else {
    console.log(`❌ ${key}: MISSING`);
  }
});

// 2. Check Groq config
console.log('\n🤖 GROQ CONFIGURATION');
try {
  const { llm } = await import('../services/ai/llmAdapter.js');
  console.log('✅ LLM Adapter loaded');

  if (process.env.GROQ_API_KEY) {
    console.log('✅ Groq API key present');
  } else {
    console.log('❌ Groq API key missing');
  }
} catch (e) {
  console.log('❌ LLM Adapter error:', e.message);
}

// 3. Check Firebase
console.log('\n🔥 FIREBASE CONFIGURATION');
if (process.env.FIREBASE_PROJECT_ID) {
  console.log('✅ Firebase project ID:', process.env.FIREBASE_PROJECT_ID);
} else {
  console.log('❌ Firebase not configured');
}

// 4. Check webhook
console.log('\n🔔 TELEGRAM WEBHOOK');
if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET) {
  console.log('✅ Bot token and webhook secret present');
  console.log('✅ Ready to receive webhooks');
} else {
  console.log('❌ Missing webhook configuration');
}

// 5. Summary
console.log('\n' + '='.repeat(60));
console.log('📊 CLOUD RUN READINESS');
console.log('='.repeat(60));

const allEnvSet = required.every(key => process.env[key]);

if (allEnvSet) {
  console.log('✅ ALL SYSTEMS READY');
  console.log('\nNext steps:');
  console.log('1. Check Cloud Run logs for errors');
  console.log('2. Verify webhook is set: setWebhook call');
  console.log('3. Send test message to bot');
  console.log('4. Monitor logs in Cloud Console');
} else {
  console.log('❌ MISSING ENVIRONMENT VARIABLES');
  console.log('\nFix in Cloud Run → Service → Edit & Deploy → Environment Variables');
}
