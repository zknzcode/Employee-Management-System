import { initializeApp } from 'firebase/app'
import { getAnalytics, isSupported } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: 'AIzaSyBlREsqDtURVdUKvlEtKcPvV9UAeWclFSA',
  authDomain: 'top-clean-service.firebaseapp.com',
  projectId: 'top-clean-service',
  storageBucket: 'top-clean-service.firebasestorage.app',
  messagingSenderId: '957049267039',
  appId: '1:957049267039:web:7c93cd378ad87f4e4e4cea',
  measurementId: 'G-10S3SVSR86',
}

export const firebaseApp = initializeApp(firebaseConfig)

export const analyticsPromise = typeof window !== 'undefined' ? isSupported().then((ok) => (ok ? getAnalytics(firebaseApp) : null)) : Promise.resolve(null)







