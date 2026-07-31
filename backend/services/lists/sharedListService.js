import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class SharedListService {
  _normalize(name) {
    return (name || '').toLowerCase().trim();
  }

  async findList(userId, name) {
    const normalized = this._normalize(name);
    try {
      const snap = await db.collection('shared_lists')
        .where('name', '==', normalized)
        .get();
      const uid = userId.toString();
      const accessible = snap.docs
        .map(d => d.data())
        .filter(l => l.ownerUserId === uid || (l.sharedWith || []).includes(uid));
      return accessible[0] || null;
    } catch (err) {
      logger.error('findList failed', { error: err.message });
      return null;
    }
  }

  async createList(userId, name) {
    const id = uuidv4();
    const list = {
      id,
      name: this._normalize(name),
      displayName: name.trim(),
      ownerUserId: userId.toString(),
      sharedWith: [],
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await db.collection('shared_lists').doc(id).set(list);
    logger.info('List created', { userId, listId: id, name: list.name });
    return list;
  }

  async findOrCreate(userId, name) {
    return (await this.findList(userId, name)) || (await this.createList(userId, name));
  }

  async addItem(userId, listName, item) {
    const list = await this.findList(userId, listName);
    if (!list) return null;
    const newItem = { id: uuidv4(), text: item.trim(), done: false, addedAt: new Date().toISOString() };
    const items = [...(list.items || []), newItem];
    await db.collection('shared_lists').doc(list.id).update({ items, updatedAt: new Date() });
    return { list: { ...list, items }, item: newItem };
  }

  async removeItem(userId, listName, itemText) {
    const list = await this.findList(userId, listName);
    if (!list) return null;
    const normalized = this._normalize(itemText);
    const items = (list.items || []).map(i =>
      this._normalize(i.text).includes(normalized) ? { ...i, done: true } : i
    );
    await db.collection('shared_lists').doc(list.id).update({ items, updatedAt: new Date() });
    return { ...list, items };
  }

  async getUserLists(userId) {
    const uid = userId.toString();
    try {
      const [ownedSnap, sharedSnap] = await Promise.all([
        db.collection('shared_lists').where('ownerUserId', '==', uid).get(),
        db.collection('shared_lists').where('sharedWith', 'array-contains', uid).get()
      ]);
      const owned  = ownedSnap.docs.map(d => d.data());
      const shared = sharedSnap.docs.map(d => d.data()).filter(l => l.ownerUserId !== uid);
      return [...owned, ...shared];
    } catch (err) {
      logger.error('getUserLists failed', { error: err.message });
      return [];
    }
  }

  async shareList(userId, listName, targetId) {
    const list = await this.findList(userId, listName);
    if (!list || list.ownerUserId !== userId.toString()) return null;
    const sharedWith = [...new Set([...(list.sharedWith || []), targetId.toString()])];
    await db.collection('shared_lists').doc(list.id).update({ sharedWith, updatedAt: new Date() });
    return { ...list, sharedWith };
  }

  formatList(list) {
    if (!list) return 'List not found.';
    const pending = (list.items || []).filter(i => !i.done);
    const done    = (list.items || []).filter(i => i.done);
    if (!list.items?.length) return `📋 *${list.displayName}*\n\nEmpty. Add items by saying "add [item] to ${list.displayName} list".`;
    let msg = `📋 *${list.displayName}*\n\n`;
    pending.forEach(i => { msg += `☐ ${i.text}\n`; });
    if (done.length) {
      msg += `\n✅ Done\n`;
      done.forEach(i => { msg += `~~${i.text}~~\n`; });
    }
    return msg.trim();
  }
}

export const sharedListService = new SharedListService();
