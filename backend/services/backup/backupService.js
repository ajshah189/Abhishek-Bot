import { config } from 'dotenv';
config();
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';

export class BackupService {
  async createBackup(userId) {
    const uid = userId.toString();
    const dateStr = new Date().toISOString().slice(0, 10);

    const collections = ['tasks', 'expenses', 'habits', 'memories', 'contacts', 'journal', 'daily_summaries'];
    const backup = { userId: uid, date: dateStr, createdAt: new Date().toISOString(), data: {} };

    for (const col of collections) {
      const snap = await db.collection(col).where('userId', '==', uid).get();
      backup.data[col] = snap.docs.map(d => d.data());
    }

    // conversation_logs: last 100 only
    const logsSnap = await db.collection('conversation_logs')
      .where('userId', '==', uid)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();
    backup.data.conversation_logs = logsSnap.docs.map(d => d.data());

    // Store in Firestore
    const backupId = `${uid}_${dateStr}`;
    await db.collection('backups').doc(backupId).set({
      userId: uid,
      date: dateStr,
      createdAt: new Date(),
      data: JSON.stringify(backup)
    });

    // Keep only last 7 backups — delete older ones
    const allBackups = await db.collection('backups').where('userId', '==', uid).orderBy('date', 'desc').get();
    const toDelete = allBackups.docs.slice(7);
    await Promise.all(toDelete.map(d => d.ref.delete()));

    logger.info('Backup created', { userId: uid, date: dateStr });
    return backup;
  }

  async sendBackupToUser(userId, chatId) {
    const backup = await this.createBackup(userId);
    const json = JSON.stringify(backup, null, 2);
    const filename = `backup_${backup.date}.json`;

    // Send as document via Telegram using form-data package
    const FormData = (await import('form-data')).default;
    const axios = (await import('axios')).default;

    const form = new FormData();
    form.append('chat_id', chatId.toString());
    form.append('document', Buffer.from(json), { filename, contentType: 'application/json' });
    form.append('caption', `📦 Backup for ${backup.date}`);

    const token = process.env.TELEGRAM_BOT_TOKEN;
    await axios.post(`https://api.telegram.org/bot${token}/sendDocument`, form, {
      headers: form.getHeaders()
    });

    const totalRecords = Object.values(backup.data).reduce((acc, arr) => acc + arr.length, 0);
    return `📦 Backup sent! ${totalRecords} records exported.`;
  }
}

export const backupService = new BackupService();
