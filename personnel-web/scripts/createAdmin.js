import admin from 'firebase-admin'

const argv = process.argv.slice(2)
const arg = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}

const email = arg('email')
const password = arg('password')

if (!email || !password) {
  console.error('Kullanim: node scripts/createAdmin.js --email user@mail.com --password Sifre123!')
  process.exit(1)
}

// Kimlik bilgisi: GOOGLE_APPLICATION_CREDENTIALS ile verilmeli
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
})

const auth = admin.auth()
const db = admin.firestore()
const now = admin.firestore.FieldValue.serverTimestamp()

async function main() {
  let uid
  try {
    const existing = await auth.getUserByEmail(email)
    uid = existing.uid
    await auth.updateUser(uid, { password })
  } catch (err) {
    const created = await auth.createUser({ email, password, emailVerified: true })
    uid = created.uid
  }

  await auth.setCustomUserClaims(uid, { role: 'admin', admin: true })

  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        email,
        role: 'admin',
        updatedAt: now,
        createdAt: now,
      },
      { merge: true },
    )

  console.log('Admin olusturuldu/guncellendi:', email, 'uid:', uid)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})










