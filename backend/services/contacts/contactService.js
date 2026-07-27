import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class ContactService {
  async create(userId, fields) {
    try {
      const contactData = {
        id: uuidv4(),
        userId: userId.toString(),
        name: fields.title || fields.name || 'Contact',
        phone: fields.phone || '',
        email: fields.email || '',
        relationship: fields.relationship || 'friend',
        birthday: fields.birthday ? new Date(fields.birthday) : null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.collection('contacts').doc(contactData.id).set(contactData);
      logger.info('Contact created', { userId, contactId: contactData.id });

      return contactData;
    } catch (error) {
      logger.error('Failed to create contact', { error: error.message });
      throw error;
    }
  }

  async getUserContacts(userId) {
    try {
      const snapshot = await db
        .collection('contacts')
        .where('userId', '==', userId.toString())
        .orderBy('updatedAt', 'desc')
        .get();

      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      logger.error('Failed to fetch contacts', { error: error.message });
      return [];
    }
  }

  async searchContacts(userId, query) {
    const contacts = await this.getUserContacts(userId);
    const queryLower = query.toLowerCase();

    return contacts.filter(contact =>
      contact.name.toLowerCase().includes(queryLower) ||
      contact.email.toLowerCase().includes(queryLower) ||
      contact.phone.includes(query)
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
