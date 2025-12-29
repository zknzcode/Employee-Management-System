const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBlREsqDtURVdUKvlEtKcPvV9UAeWclFSA',
  authDomain: 'top-clean-service.firebaseapp.com',
  projectId: 'top-clean-service',
  storageBucket: 'top-clean-service.firebasestorage.app',
  messagingSenderId: '957049267039',
  appId: '1:957049267039:web:7c93cd378ad87f4e4e4cea',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// YENİ ADMİN BİLGİLERİ - İSTEDİĞİN GİBİ DEĞİŞTİR
const ADMIN_EMAIL = 'admin@topclean.de';
const ADMIN_PASSWORD = 'TopClean2025!';

async function createAdmin() {
  try {
    console.log('Admin hesabı oluşturuluyor...');
    console.log('E-posta:', ADMIN_EMAIL);
    
    // Firebase Auth'da kullanıcı oluştur
    const userCredential = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
    const user = userCredential.user;
    
    console.log('Kullanıcı oluşturuldu! UID:', user.uid);
    
    // Firestore'da admin rolü ver
    await setDoc(doc(db, 'users', user.uid), {
      email: ADMIN_EMAIL,
      role: 'admin',
      createdAt: new Date(),
    });
    
    console.log('Admin rolü verildi!');
    console.log('');
    console.log('=================================');
    console.log('YENİ ADMİN HESABI OLUŞTURULDU!');
    console.log('=================================');
    console.log('E-posta:', ADMIN_EMAIL);
    console.log('Şifre:', ADMIN_PASSWORD);
    console.log('UID:', user.uid);
    console.log('=================================');
    
    process.exit(0);
  } catch (error) {
    console.error('Hata:', error.message);
    
    if (error.code === 'auth/email-already-in-use') {
      console.log('Bu e-posta zaten kullanımda. Farklı bir e-posta dene.');
    }
    
    process.exit(1);
  }
}

createAdmin();

