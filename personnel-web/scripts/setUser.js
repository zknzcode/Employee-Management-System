// Tek seferlik admin kullanıcı dokümanı eklemek için script.
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// TODO: Replace with your Firebase service account credentials
// Get this from Firebase Console > Project Settings > Service Accounts
const serviceAccount = {
  type: 'service_account',
  project_id: 'your-project-id',
  private_key_id: 'YOUR_PRIVATE_KEY_ID',
  private_key: '-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n',
  client_email: 'firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com',
  client_id: 'YOUR_CLIENT_ID',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url:
    'https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40your-project.iam.gserviceaccount.com',
}

initializeApp({
  credential: cert(serviceAccount),
})

const db = getFirestore()

async function main() {
  // TODO: Replace with your admin UID and email
  const uid = 'YOUR_ADMIN_UID'
  await db.collection('users').doc(uid).set({
    email: 'admin@example.com',
    role: 'admin',
    createdAt: FieldValue.serverTimestamp(),
  })
  console.log('users doc written for', uid)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})










