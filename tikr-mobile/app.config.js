import 'dotenv/config';

export default {
  name: 'tikr-mobile',
  slug: 'tikr-mobile',
  version: '1.0.0',
  orientation: 'portrait',
  extra: {
    firebaseApiKey: process.env.FIREBASE_API_KEY ?? null,
    firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN ?? null,
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? null,
    firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? null,
    firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? null,
    firebaseAppId: process.env.FIREBASE_APP_ID ?? null,
    firebaseMeasurementId: process.env.MEASUREMENT_ID ?? null,
  },
  plugins: [
    // ... other plugins
  ],
}; 