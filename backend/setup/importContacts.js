import { config } from 'dotenv';
config();

import { db } from '../config/firebase.js';
import { v4 as uuidv4 } from 'uuid';

const USERID = process.env.OWNER_TELEGRAM_ID || '7307120782';

async function importContacts() {
  const fs = await import('fs');
  const contacts = JSON.parse(fs.readFileSync('contacts_to_import.json', 'utf-8'));

  console.log(`Found ${contacts.length} contacts in JSON file.`);

  // Load existing contacts to skip duplicates
  const existing = await db.collection('contacts').where('userId', '==', USERID).get();
  const existingNames = new Set(existing.docs.map(d => d.data().name?.toLowerCase().trim()));

  console.log(`Found ${existingNames.size} existing contacts in Firestore.\n`);

  let saved = 0;
  let skipped = 0;

  for (const contact of contacts) {
    if (!contact.name?.trim()) {
      skipped++;
      continue;
    }

    if (existingNames.has(contact.name.toLowerCase().trim())) {
      skipped++;
      continue;
    }

    const id = uuidv4();
    await db.collection('contacts').doc(id).set({
      id,
      userId: USERID,
      name: contact.name.trim(),
      phone: contact.phone || '',
      email: contact.email || '',
      organization: contact.organization || '',
      relationship: 'contact',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    saved++;
    if (saved % 20 === 0) console.log(`  Saved ${saved}...`);
  }

  console.log(`\n✅ Import complete: ${saved} saved, ${skipped} duplicates skipped`);
  console.log(`Total contacts in Firestore: ${saved + existingNames.size}`);
  process.exit(0);
}

importContacts().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
