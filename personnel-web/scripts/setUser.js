// Tek seferlik admin kullanıcı dokümanı eklemek için script.
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const serviceAccount = {
  type: 'service_account',
  project_id: 'top-clean-service',
  private_key_id: 'ddfde19ed6cd63fb8a2bb10d5c0bcff468920ce2',
  private_key:
    '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDNrwAAqRLrzr06g3IUbMNRwyEx7KGYU+BdLSqRM4XhcvykCeqLk8A6UG2vLEyLiCsazN+vWqQmjqkreXhFUpCGzmx/VhzR6w/m3p+FHZdNf2Z69QWRrwzJTLa717mr8pDmP4fQw1pGk0kaJSxWcAjx91Oa+Va6o7YIGq/rhtOB/7ohAyTCOM0nR3obIpy/8D2ozelahBaxF/9rSejBrQ6sbbYmSSVKI6Q+fOahLCAmInEBlTtGhdt++0FuHBWCfTAVjpX6gE0JlF/kUFu3m7wcyiNa/d0K65LD/pJs4nVO2k57LNjQb7yf8pA975/9i/IfYLjQpvEcuzyF2wqrsXRhAgMBAAECggEAEko+RhDC17i733zqU1IjoTzokgOwj/bfc/GtABn0jQp4WE7wbiZ+mMDnrATUrrC2Yoz21CVLhQk5Fl5YGVQA+ZfYEo+yAuGz+Yvw4/mwZ2oNjyAENYL7MFhTxIrnnhh1FaBvH5uLhsyYmsxU77/JL9kWNGj5MyIVMQ3MeHV2D/BoXnGqqnX5rPSn4CpBwAgTefOSpe+6cnxq4EfFS78t9W7GdxEpHqZsfJUva13h+iDR4g6B4HbgzqRzf1yQ6m6Zds/SxIq2p7GxuFMuDsoawU0sog43JmMPEW/2slQjfadAfONvwHw7VkthRGCPr3LrBJM+8Md+/rN3b07cVNSelQKBgQD7RxTDRSrtDJJfDNtnIUavcCA47Z4BJLV9x+3zTc/LMiPy1egA05kV2oIoNcMzL72qV+ZHO6r+RHaLSSYVSz1lZNZEhO/t6rXV+vFEwdtYRIWM6z95XY/b6UGfZU6vCKdzMtGIpyAXuie4EEv0SDIKcck2bl8Et74qKVfd9YAzRQKBgQDRjI/VHJrHV9RQEs7Rc6oowg90/Z/LPDNbI0JpVVBKViLkMJpqgNGD9+jdeWYIhAPC1ebJ1D3VHK4bdgQOeG/zvqS5EZtuxh6wIL8tA1cMno+Y4Bh55m7m1a9b2bDic7gYIJ3KqEj2xE9T7vZDXlkEVIy2n7d6FfbWyISNYJcgbQKBgQCAhC9jXAoDaa2nPZ0tlwBfFFr2otlwPkUxCsNx8Dc59vAZ8DuTyKWAXty5Eh4/HMjFyeU2Q5dGKt/yhzwaIfxJ0pQgQVmxdpz/zzP89aVo9MrVczBos2izkg6FJrxim2uBaNlwKgIpAIX2ByfBzfcCDoZZ94NTl2KEj9an6DtkfQKBgCGM7NaFPu7dzBuJ910ntL3T3F+x3+zNVbeo3JA63aEZS3rXoVGeEG2dusYDEugYIvYGA26bMc82SVYSPjIG7H3NL1iGTimdRPqUM6fEWiKmHH2wm5qg327MFciSATUwq/AJANqauRvxcHYS05ETwRLlaqYuylScwam/7yEnruq9AoGANiWqXy1QA6Kmr0CrMuZX605JHU6jtTvqTjKpaZ0leyolA8YCdcntWwGT6DKJQBlef8gOoD3nyjOXmLbBkv0jy rp5hDUST52LZkD26AU2qI2e1Ffq0qi1vynGTElsad3c3/4vR3y4VQ9U6OJZqgUyKs9M7lMvDidqt5J/hQQJJI8=\n-----END PRIVATE KEY-----\n',
  client_email: 'firebase-adminsdk-fbsvc@top-clean-service.iam.gserviceaccount.com',
  client_id: '104247799855308147122',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url:
    'https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40top-clean-service.iam.gserviceaccount.com',
}

initializeApp({
  credential: cert(serviceAccount),
})

const db = getFirestore()

async function main() {
  const uid = 'RcYxSflDcOdTaA1BRjnEfH9fPON2'
  await db.collection('users').doc(uid).set({
    email: 'admin@topclean-service.de',
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







