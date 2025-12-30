import { initializeApp } from 'firebase/app'
import { getAnalytics, isSupported } from 'firebase/analytics'

// TODO: Replace with your Firebase configuration
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project-id',
  storageBucket: 'your-project.firebasestorage.app',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
  measurementId: 'YOUR_MEASUREMENT_ID',
}

export const firebaseApp = initializeApp(firebaseConfig)

export const analyticsPromise = typeof window !== 'undefined' ? isSupported().then((ok) => (ok ? getAnalytics(firebaseApp) : null)) : Promise.resolve(null)










