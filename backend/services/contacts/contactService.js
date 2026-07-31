import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

function normalizePhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  // +91 XXXXXXXXXX or 91XXXXXXXXXX → strip country code, store 10 digits
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  // 10-digit Indian mobile — store as-is
  if (digits.length === 10) return digits;
  // International (already has country code) — store as digits
  return digits;
}

export class ContactService {
  async create(userId, fields) {
    try {
      const contactData = {
        id: uuidv4(),
        userId: userId.toString(),
        name: (fields.title || fields.name || 'Contact').trim(),
        phone: normalizePhone(fields.phone),
        email: fields.email || '',
        relationship: fields.relationship || '',
        birthday: fields.birthday ? new Date(fields.birthday) : null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.collection('contacts').doc(contactData.id).set(contactData);
      logger.info('Contact created', { userId, contactId: contactData.id, name: contactData.name });
      return contactData;
    } catch (error) {
      logger.error('Failed to create contact', { error: error.message });
      throw error;
    }
  }

  async update(contactId, fields) {
    try {
      const updates = { updatedAt: new Date() };
      if (fields.phone !== undefined) updates.phone = normalizePhone(fields.phone);
      if (fields.name !== undefined) updates.name = fields.name.trim();
      if (fields.email !== undefined) updates.email = fields.email;
      if (fields.relationship !== undefined) updates.relationship = fields.relationship;
      await db.collection('contacts').doc(contactId).update(updates);
      logger.info('Contact updated', { contactId });
      return updates;
    } catch (error) {
      logger.error('Failed to update contact', { error: error.message });
      throw error;
    }
  }

  async getUserContacts(userId) {
    try {
      const snapshot = await db
        .collection('contacts')
        .where('userId', '==', userId.toString())
        .get(); // orderBy removed — composite index may be missing (contacts(userId, updatedAt))
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      logger.error('Failed to fetch contacts', { error: error.message });
      return [];
    }
  }

  matchContact(contacts, name) {
    if (!name || !contacts.length) return null;
    const target = name.toLowerCase().trim();

    // Exact full name
    let found = contacts.find(c => c.name.toLowerCase() === target);
    if (found) return found;

    // First name matches first word of stored name (e.g. "riya" → "Riya Shah")
    found = contacts.find(c => c.name.toLowerCase().split(' ')[0] === target);
    if (found) return found;

    // Stored name starts with query
    found = contacts.find(c => c.name.toLowerCase().startsWith(target));
    if (found) return found;

    // Query is a substring of stored name
    found = contacts.find(c => c.name.toLowerCase().includes(target));
    if (found) return found;

    return null;
  }

  async searchContacts(userId, query) {
    const contacts = await this.getUserContacts(userId);
    const q = query.toLowerCase();
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(query)
    );
  }

  async delete(contactId) {
    try {
      await db.collection('contacts').doc(contactId).delete();
      logger.info('Contact deleted', { contactId });
      return true;
    } catch (error) {
      logger.error('Failed to delete contact', { error: error.message });
      throw error;
    }
  }
}

export const contactService = new ContactService();
