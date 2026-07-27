import { config } from 'dotenv';
config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '../../');

const checks = [];

function log(status, message, details = '') {
  const icon = status === '✅' ? '✅' : status === '⚠️' ? '⚠️' : '❌';
  console.log(`${icon} ${message}`);
  if (details) console.log(`   ${details}`);
  checks.push({ status, message, details });
}

async function auditSystem() {
  console.log('🔍 SYSTEM AUDIT STARTING...\n');

  // 1. Check .env
  console.log('📋 ENVIRONMENT VARIABLES');
  const envPath = path.join(projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf-8');
    const required = ['TELEGRAM_BOT_TOKEN', 'GROQ_API_KEY', 'FIREBASE_PROJECT_ID'];
    const missing = required.filter(key => !env.includes(key));
    if (missing.length === 0) {
      log('✅', '.env file exists with all required variables');
    } else {
      log('❌', 'Missing .env variables', missing.join(', '));
    }
  } else {
    log('❌', '.env file not found');
  }

  // 2. Check Groq config
  console.log('\n🤖 GROQ LLM CONFIGURATION');
  const groqConfigPath = path.join(projectRoot, 'backend/config/groq.js');
  if (fs.existsSync(groqConfigPath)) {
    const groqContent = fs.readFileSync(groqConfigPath, 'utf-8');
    if (groqContent.includes('import { Groq }')) {
      log('✅', 'Groq import is correct (destructured)');
    } else if (groqContent.includes('import Groq')) {
      log('❌', 'Groq import is WRONG (should be destructured)',
          'Change: import Groq → import { Groq }');
      const fixed = groqContent.replace(
        'import Groq from',
        'import { Groq } from'
      );
      fs.writeFileSync(groqConfigPath, fixed);
      log('✅', 'FIXED: Groq import corrected');
    }
  }

  // 3. Check LLM Adapter
  console.log('\n🔌 LLM ADAPTER CONFIGURATION');
  const adapterPath = path.join(projectRoot, 'backend/services/ai/llmAdapter.js');
  if (fs.existsSync(adapterPath)) {
    const adapterContent = fs.readFileSync(adapterPath, 'utf-8');
    if (adapterContent.includes('groq.messages.create')) {
      log('✅', 'LLM Adapter correctly calls Groq API');
    } else {
      log('⚠️', 'LLM Adapter may not be using Groq correctly');
    }
  }

  // 4. Check Intent Extractor
  console.log('\n🧠 INTENT EXTRACTOR');
  const intentPath = path.join(projectRoot, 'backend/services/ai/intentExtractor.js');
  if (fs.existsSync(intentPath)) {
    const intentContent = fs.readFileSync(intentPath, 'utf-8');
    if (intentContent.includes('llm.call')) {
      log('✅', 'Intent Extractor uses LLM correctly');
    }
  }

  // 5. Check Telegram Handler routing
  console.log('\n📱 TELEGRAM HANDLER ROUTING');
  const handlerPath = path.join(projectRoot, 'backend/services/telegram/handler.js');
  if (fs.existsSync(handlerPath)) {
    const handlerContent = fs.readFileSync(handlerPath, 'utf-8');
    const intents = ['task', 'expense', 'reminder', 'memory', 'note', 'event', 'journal', 'contact'];
    const missingIntents = intents.filter(intent => !handlerContent.includes(`case '${intent}'`));
    if (missingIntents.length === 0) {
      log('✅', 'All intents are routed in handler');
    } else {
      log('⚠️', 'Missing intent handlers', missingIntents.join(', '));
    }
  }

  // 6. Check services exist
  console.log('\n⚙️ SERVICES');
  const services = [
    'tasks/taskService.js',
    'expenses/expenseService.js',
    'reminders/reminderService.js',
    'memory/memoryService.js',
    'notes/noteService.js',
    'journal/journalService.js',
    'calendar/calendarService.js',
    'contacts/contactService.js',
    'habits/habitService.js',
    'planner/plannerService.js',
    'search/searchService.js'
  ];

  services.forEach(service => {
    const servicePath = path.join(projectRoot, 'backend/services', service);
    if (fs.existsSync(servicePath)) {
      log('✅', `${service} exists`);
    } else {
      log('❌', `${service} NOT FOUND`);
    }
  });

  // 7. Check Firebase config
  console.log('\n🔥 FIREBASE CONFIGURATION');
  const firebasePath = path.join(projectRoot, 'backend/config/firebase.js');
  if (fs.existsSync(firebasePath)) {
    log('✅', 'Firebase config exists');
  }

  // 8. Check package.json
  console.log('\n📦 DEPENDENCIES');
  const packagePath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packagePath)) {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const required = ['express', 'firebase-admin', 'groq-sdk', '@anthropic-ai/sdk', 'dotenv'];
    const installed = required.filter(dep => pkg.dependencies[dep]);
    log('✅', `${installed.length}/${required.length} critical dependencies installed`);
  }

  // 9. Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 AUDIT SUMMARY');
  console.log('='.repeat(60));
  const passed = checks.filter(c => c.status === '✅').length;
  const failed = checks.filter(c => c.status === '❌').length;
  const warnings = checks.filter(c => c.status === '⚠️').length;

  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Warnings: ${warnings}`);

  if (failed === 0) {
    console.log('\n🎉 SYSTEM IS READY!');
    console.log('\nNext steps:');
    console.log('1. npm run dev');
    console.log('2. Send: "Spent 1000 on food"');
    console.log('3. Check logs for "Intent extracted"');
    console.log('4. Task should save to Firestore');
  } else {
    console.log('\n⚠️ FIX ERRORS ABOVE BEFORE RUNNING');
  }
}

auditSystem().catch(console.error);
