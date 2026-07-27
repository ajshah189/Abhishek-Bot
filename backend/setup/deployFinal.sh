#!/bin/bash
set -e

PROJECT_ID="abhishek-assistant-d2e8f"
SERVICE_NAME="abhishek-assistant-telegram"
REGION="asia-southeast1"

echo "🚀 DEPLOYING TO GOOGLE CLOUD RUN"
echo "================================"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Authenticate
echo "🔐 Authenticating with Google Cloud..."
gcloud auth login
gcloud config set project $PROJECT_ID

# Create .env.production for deployment
echo "📝 Creating production environment..."
cat > .env.production << EOF
NODE_ENV=production
PORT=8080
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET=$TELEGRAM_WEBHOOK_SECRET
GROQ_API_KEY=$GROQ_API_KEY
LLM_PROVIDER=groq
FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID
FIREBASE_PRIVATE_KEY_ID=$FIREBASE_PRIVATE_KEY_ID
FIREBASE_PRIVATE_KEY=$FIREBASE_PRIVATE_KEY
FIREBASE_CLIENT_EMAIL=$FIREBASE_CLIENT_EMAIL
FIREBASE_CLIENT_ID=$FIREBASE_CLIENT_ID
EOF

# Deploy to Cloud Run
echo "🔨 Building and deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 512Mi \
  --timeout 60 \
  --max-instances 100 \
  --env-vars-file .env.production

# Get the service URL
echo "📍 Getting Cloud Run URL..."
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --format 'value(status.url)')

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo "================================"
echo "Service URL: $SERVICE_URL"
echo ""

# Set Telegram webhook
echo "🔔 Setting Telegram webhook..."
curl -X POST \
  "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"$SERVICE_URL/webhook\",
    \"secret_token\": \"$TELEGRAM_WEBHOOK_SECRET\"
  }"

echo ""
echo "✅ WEBHOOK SET!"
echo ""
echo "🎉 YOUR BOT IS NOW LIVE!"
echo ""
echo "Test it: Send a message to @Ajshah189Bot"
echo "Monitor: gcloud run services logs read $SERVICE_NAME --region $REGION --limit 50"
echo ""

# Cleanup
rm .env.production
