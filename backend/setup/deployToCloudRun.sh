#!/bin/bash

# Deploy to Google Cloud Run
PROJECT_ID="abhishek-assistant-d2e8f"
SERVICE_NAME="abhishek-assistant-telegram"
REGION="asia-southeast1"

echo "🚀 Deploying to Cloud Run..."

gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars \
    TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN,\
    GROQ_API_KEY=$GROQ_API_KEY,\
    FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID,\
    FIREBASE_PRIVATE_KEY_ID=$FIREBASE_PRIVATE_KEY_ID,\
    FIREBASE_PRIVATE_KEY=$FIREBASE_PRIVATE_KEY,\
    FIREBASE_CLIENT_EMAIL=$FIREBASE_CLIENT_EMAIL,\
    FIREBASE_CLIENT_ID=$FIREBASE_CLIENT_ID,\
    NODE_ENV=production

echo "✅ Deployment complete!"
