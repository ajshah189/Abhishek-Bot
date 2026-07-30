import { google } from 'googleapis';
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(userId) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: userId.toString()
  });
}

export async function handleCallback(code, userId) {
  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);

    await db.collection('google_tokens').doc(userId.toString()).set({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type,
      updatedAt: new Date()
    });

    logger.info('Google tokens stored', { userId });
    return { success: true };
  } catch (error) {
    logger.error('OAuth callback failed', { userId, error: error.message });
    return { success: false, error: error.message };
  }
}

export async function getAuthenticatedClient(userId) {
  try {
    const doc = await db.collection('google_tokens').doc(userId.toString()).get();
    if (!doc.exists) return null;

    const tokens = doc.data();
    const client = createOAuthClient();
    client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type
    });

    // Persist refreshed tokens automatically
    client.on('tokens', async (newTokens) => {
      try {
        await db.collection('google_tokens').doc(userId.toString()).set(
          { ...newTokens, updatedAt: new Date() },
          { merge: true }
        );
      } catch (err) {
        logger.error('Failed to persist refreshed tokens', { userId, error: err.message });
      }
    });

    return client;
  } catch (error) {
    logger.error('Failed to get authenticated client', { userId, error: error.message });
    return null;
  }
}
