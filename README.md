# Admin & Personnel Management System

A comprehensive admin panel and personnel web application built with React, TypeScript, and Firebase.

**English** | [Türkçe](#türkçe)

---

## Features

- **Admin Panel**: Full-featured admin dashboard for managing personnel, reports, leave requests, and support tickets
- **Personnel Web App**: Web application for personnel to track work hours, submit reports, and request leave
- **Real-time Location Tracking**: Live GPS tracking for personnel
- **Multi-language Support**: German and Arabic language support
- **Firebase Integration**: Authentication, Firestore, Storage, and Cloud Functions

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Firebase Account** ([Sign up](https://firebase.google.com/))
- **Google Maps API Key** (optional, for location features) ([Get API Key](https://console.cloud.google.com/))

---

## Complete Setup Guide

### Step 1: Clone the Repository

```bash
git clone https://github.com/zknzcode/top-clean.git
cd top-clean
```

### Step 2: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or **"Create a project"**
3. Enter your project name (e.g., "my-personnel-system")
4. Enable Google Analytics (optional)
5. Click **"Create project"**
6. Wait for project creation to complete

### Step 3: Enable Firebase Services

#### 3.1 Authentication

1. In Firebase Console, go to **Authentication** → **Get started**
2. Enable **Email/Password** sign-in method
3. Click **Save**

#### 3.2 Firestore Database

1. Go to **Firestore Database** → **Create database**
2. Start in **production mode** (we'll set rules later)
3. Choose a location (select closest to your users)
4. Click **Enable**

#### 3.3 Storage

1. Go to **Storage** → **Get started**
2. Start in **production mode**
3. Use the same location as Firestore
4. Click **Done**

#### 3.4 Hosting (for both apps)

1. Go to **Hosting** → **Get started**
2. Follow the setup wizard
3. You'll need to create **two hosting sites**:
   - One for admin app
   - One for personnel app

To create multiple sites:
- Go to **Hosting** → **Add another site**
- Create sites: `your-admin-site` and `your-personnel-site`

#### 3.5 Cloud Functions

1. Go to **Functions** → **Get started**
2. Enable billing (required for Cloud Functions)
3. Click **Continue**

### Step 4: Get Firebase Configuration

1. In Firebase Console, click the **gear icon** ⚙️ next to "Project Overview"
2. Select **Project settings**
3. Scroll down to **Your apps** section
4. Click **Web icon** `</>` to add a web app
5. Register app with a nickname (e.g., "Admin App")
6. Copy the `firebaseConfig` object

It should look like this:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
  measurementId: "G-XXXXXXXXXX"
};
```

### Step 5: Configure Admin App

#### 5.1 Update Firebase Configuration

1. Open `admin-app/src/App.tsx`
2. Find the `firebaseConfig` object (around line 150)
3. Replace with your Firebase config:

```typescript
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY_HERE',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project-id',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
  measurementId: 'YOUR_MEASUREMENT_ID',
}
```

#### 5.2 Update Admin Whitelist

In the same file (`admin-app/src/App.tsx`), find the admin whitelist (around line 694):

```typescript
// Replace with your admin email addresses
const adminWhitelistEmails: string[] = ['your-admin@example.com']
// Replace with your admin user IDs (you'll get these after creating admin users)
const adminWhitelistUids: string[] = []
```

#### 5.3 Update Google Maps API Key

1. Get Google Maps API Key:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Select your project
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **API Key**
   - Enable **Maps JavaScript API** and **Geocoding API**

2. In `admin-app/src/App.tsx`, find line ~4230:
   ```typescript
   src={`https://www.google.com/maps/embed/v1/place?key=YOUR_GOOGLE_MAPS_API_KEY&q=...`}
   ```
   Replace `YOUR_GOOGLE_MAPS_API_KEY` with your actual API key

#### 5.4 Update Firebase Hosting Site

1. Open `admin-app/firebase.json`
2. Replace `"site": "your-admin-site"` with your actual Firebase hosting site name

#### 5.5 Update Invite Link

In `admin-app/src/App.tsx`, find line ~2365:
```typescript
const link = `https://your-personnel-site.web.app/invite?email=${encodeURIComponent(form.email)}`
```
Replace `your-personnel-site` with your actual personnel app hosting URL

### Step 6: Configure Personnel Web App

#### 6.1 Update Firebase Configuration

1. Open `personnel-web/src/firebase.ts`
2. Replace the `firebaseConfig` with your Firebase config (same as admin app)

#### 6.2 Update Firebase Hosting Site

1. Open `personnel-web/firebase.json`
2. Replace `"site": "your-personnel-site"` with your actual Firebase hosting site name

#### 6.3 Update Service Worker

1. Open `personnel-web/public/sw.js`
2. Update:
   ```javascript
   const FIREBASE_PROJECT = 'your-project-id'
   const FIREBASE_API_KEY = 'YOUR_API_KEY'
   ```

### Step 7: Configure Firestore Security Rules

#### 7.1 Update Admin Whitelist in Rules

1. Open `personnel-web/firestore.rules`
2. Find the `isAdmin()` function (around line 9)
3. Update with your admin emails and UIDs:

```javascript
function isAdmin() {
  return isSignedIn() &&
    (request.auth.token.admin == true ||
     request.auth.token.email in [
       'your-admin@example.com',  // Add your admin emails
       'another-admin@example.com'
     ] ||
     request.auth.uid in [
       'YOUR_ADMIN_UID_1',  // Add your admin UIDs (you'll get these after creating admins)
       'YOUR_ADMIN_UID_2'
     ]);
}
```

4. Deploy the rules:
   ```bash
   cd personnel-web
   firebase deploy --only firestore:rules
   ```

### Step 8: Configure Cloud Functions

#### 8.1 Update SMTP Configuration

You have two options:

**Option A: Using Firebase Functions Config (Recommended)**

```bash
cd personnel-web
firebase functions:config:set \
  smtp.host="smtp.gmail.com" \
  smtp.port="587" \
  smtp.user="your-email@gmail.com" \
  smtp.pass="your-app-password" \
  smtp.from="Your App <your-email@gmail.com>"
```

**Option B: Direct Edit**

1. Open `personnel-web/functions/index.js`
2. Update the SMTP configuration (around line 20):
   ```javascript
   const smtp = {
     host: process.env.SMTP_HOST || cfg.host || 'smtp.gmail.com',
     port: Number(process.env.SMTP_PORT || cfg.port || 587),
     user: process.env.SMTP_USER || cfg.user || 'your-email@gmail.com',
     pass: process.env.SMTP_PASS || cfg.pass || 'your-app-password',
     from: process.env.SMTP_FROM || cfg.from || 'Your App <your-email@gmail.com>',
   }
   ```

#### 8.2 Update Admin Whitelist in Functions

In `personnel-web/functions/index.js`, find the whitelist (around line 50):

```javascript
// TODO: Replace with your admin whitelist
const whitelist = ['your-admin@example.com']  // Add your admin emails
const uidWhitelist = ['YOUR_ADMIN_UID']  // Add your admin UIDs
```

#### 8.3 Get Gmail App Password (if using Gmail)

1. Go to your Google Account settings
2. Enable **2-Step Verification**
3. Go to **App passwords**
4. Generate a new app password for "Mail"
5. Use this password in SMTP configuration

### Step 9: Install Dependencies

```bash
# Admin App
cd admin-app
npm install

# Personnel Web App
cd ../personnel-web
npm install

# Personnel Web Functions
cd functions
npm install
cd ..
```

### Step 10: Create Admin User

You need to create an admin user before you can use the admin panel.

#### Option A: Using Admin Script (Recommended)

1. Update `admin-app/scripts/createAdmin.js`:
   - Replace Firebase config with your config
   - Update admin email and password:
     ```javascript
     const ADMIN_EMAIL = 'admin@example.com';
     const ADMIN_PASSWORD = 'YourSecurePassword123!';
     ```

2. Run the script:
   ```bash
   cd admin-app
   node scripts/createAdmin.js
   ```

3. Copy the UID from the output and add it to:
   - `admin-app/src/App.tsx` → `adminWhitelistUids`
   - `personnel-web/firestore.rules` → `isAdmin()` function
   - `personnel-web/functions/index.js` → `uidWhitelist`

#### Option B: Using Firebase Console

1. Go to Firebase Console → **Authentication** → **Users**
2. Click **Add user**
3. Enter email and password
4. Copy the UID
5. Go to **Firestore Database**
6. Create a document in `users` collection:
   - Document ID: (the UID you copied)
   - Fields:
     - `email`: (string) admin@example.com
     - `role`: (string) admin
     - `createdAt`: (timestamp) current time

7. Add the email and UID to whitelists as described above

### Step 11: Update Scripts

#### 11.1 Admin Creation Scripts

- `admin-app/scripts/createAdmin.js`: Already updated in Step 10
- `personnel-web/scripts/createAdmin.js`: Uses Firebase Admin SDK
  - Requires service account key (see Step 12)
- `personnel-web/scripts/setUser.js`: Update service account and admin UID/email

#### 11.2 Invite Scripts

- `admin-app/scripts/sendInvite.js`: Update default link URL if needed

### Step 12: Setup Firebase Admin SDK (Optional, for advanced scripts)

If you want to use `personnel-web/scripts/createAdmin.js` or `setUser.js`:

1. Go to Firebase Console → **Project Settings** → **Service Accounts**
2. Click **Generate new private key**
3. Download the JSON file
4. Update `personnel-web/scripts/setUser.js` with the service account details
5. Set environment variable:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"
   ```

### Step 13: Configure Environment Variables (Admin App)

Create `admin-app/.env` file:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_NAME=Your App
FROM_EMAIL=your-email@gmail.com
```

### Step 14: Login to Firebase CLI

```bash
firebase login
```

Follow the browser authentication flow.

### Step 15: Initialize Firebase Projects

#### For Admin App:

```bash
cd admin-app
firebase init
```

Select:
- ✅ Hosting
- Use existing project → Select your project
- Public directory: `dist`
- Single-page app: Yes
- Set up automatic builds: No

#### For Personnel Web App:

```bash
cd personnel-web
firebase init
```

Select:
- ✅ Hosting
- ✅ Functions
- ✅ Firestore
- Use existing project → Select your project
- Public directory: `dist`
- Single-page app: Yes
- Functions language: JavaScript
- ESLint: Yes
- Install dependencies: Yes
- Firestore rules file: `firestore.rules`
- Firestore indexes file: `firestore.indexes.json`

### Step 16: Build Applications

#### Build Admin App:

```bash
cd admin-app
npm run build:ui
```

#### Build Personnel Web App:

```bash
cd personnel-web
npm run build
```

### Step 17: Deploy to Firebase

#### Deploy Admin App:

```bash
cd admin-app
firebase deploy --only hosting
```

#### Deploy Personnel Web App:

```bash
cd personnel-web
firebase deploy --only hosting,functions,firestore:rules
```

### Step 18: Test the Applications

1. **Admin App**: Visit `https://your-admin-site.web.app`
   - Login with the admin credentials you created
   - You should see the admin dashboard

2. **Personnel Web App**: Visit `https://your-personnel-site.web.app`
   - Try to register a new user
   - Check if invite system works

### Step 19: Create First Personnel User

1. In Admin App, go to **Dashboard**
2. Click **New Invite** or **Create Invite**
3. Enter personnel email and select role "Personal"
4. Copy the invite link
5. Send the link to the personnel
6. Personnel clicks the link and registers
7. Approve the registration request in Admin App

---

## Development Mode

### Run Admin App Locally:

```bash
cd admin-app
npm run dev
```

The app will open in Electron window.

### Run Personnel Web App Locally:

```bash
cd personnel-web
npm run dev
```

Visit `http://localhost:5173` (or the port shown in terminal)

---

## Troubleshooting

### Common Issues:

#### 1. "Permission denied" errors

- Check Firestore security rules
- Verify admin whitelist includes your email/UID
- Ensure user has `role: 'admin'` in Firestore `users` collection

#### 2. "Firebase: Error (auth/unauthorized-domain)"

- Go to Firebase Console → Authentication → Settings → Authorized domains
- Add your domain

#### 3. Email sending not working

- Verify SMTP credentials
- Check Gmail app password (if using Gmail)
- Check Firebase Functions logs: `firebase functions:log`

#### 4. Location tracking not working

- Ensure HTTPS (required for geolocation)
- Check browser permissions
- Verify service worker is registered

#### 5. Build errors

- Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`
- Check Node.js version: `node --version` (should be 18+)

---

## Project Structure

```
.
├── admin-app/                  # Admin panel application
│   ├── src/
│   │   ├── App.tsx            # Main admin app component
│   │   ├── App.css            # Styles
│   │   └── main.tsx           # Entry point
│   ├── electron/              # Electron desktop app
│   │   ├── main.js            # Electron main process
│   │   └── preload.js         # Preload script
│   ├── scripts/               # Utility scripts
│   │   ├── createAdmin.js     # Create admin user
│   │   └── sendInvite.js      # Send invite email
│   ├── public/                # Public assets
│   ├── firebase.json          # Firebase hosting config
│   └── package.json           # Dependencies
│
├── personnel-web/             # Personnel web application
│   ├── src/
│   │   ├── App.tsx            # Main personnel app
│   │   ├── firebase.ts        # Firebase configuration
│   │   └── main.tsx           # Entry point
│   ├── functions/             # Cloud Functions
│   │   ├── index.js           # Functions code
│   │   └── package.json       # Functions dependencies
│   ├── public/
│   │   └── sw.js              # Service Worker
│   ├── scripts/               # Utility scripts
│   │   ├── createAdmin.js     # Create admin (Admin SDK)
│   │   └── setUser.js         # Set user document
│   ├── firebase.json          # Firebase config
│   ├── firestore.rules        # Security rules
│   └── package.json           # Dependencies
│
└── README.md                  # This file
```

---

## Security Best Practices

⚠️ **Before deploying to production:**

1. ✅ Replace all placeholder values
2. ✅ Set up proper Firestore Security Rules
3. ✅ Configure CORS and domain restrictions
4. ✅ Use environment variables for sensitive data
5. ✅ Enable Firebase App Check
6. ✅ Set up proper authentication rules
7. ✅ Restrict Google Maps API key to your domains
8. ✅ Enable Firebase Security Rules testing
9. ✅ Set up monitoring and alerts
10. ✅ Regular security audits

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

**Important**: If you modify this software and use it as a network service (web application), you must make the source code of your modified version available to all users of that service under the same AGPL license.

For more details, see the [LICENSE](LICENSE) file.

---

## Support

For issues and questions:
- Open an issue on [GitHub](https://github.com/zknzcode/top-clean/issues)
- Check existing issues for solutions

---

# Türkçe

Kapsamlı admin paneli ve personel web uygulaması - React, TypeScript ve Firebase ile geliştirilmiştir.

## Özellikler

- **Admin Paneli**: Personel, raporlar, izin talepleri ve destek biletlerini yönetmek için tam özellikli admin kontrol paneli
- **Personel Web Uygulaması**: Personelin çalışma saatlerini takip etmesi, rapor göndermesi ve izin talep etmesi için web uygulaması
- **Canlı Konum Takibi**: Personel için gerçek zamanlı GPS takibi
- **Çoklu Dil Desteği**: Almanca ve Arapça dil desteği
- **Firebase Entegrasyonu**: Kimlik doğrulama, Firestore, Storage ve Cloud Functions

---

## Gereksinimler

Başlamadan önce aşağıdakilerin yüklü olduğundan emin olun:

- **Node.js** 18+ ([İndir](https://nodejs.org/))
- **npm** (Node.js ile birlikte gelir)
- **Git** ([İndir](https://git-scm.com/))
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Firebase Hesabı** ([Kayıt ol](https://firebase.google.com/))
- **Google Maps API Key** (isteğe bağlı, konum özellikleri için) ([API Key Al](https://console.cloud.google.com/))

---

## Tam Kurulum Kılavuzu

### Adım 1: Repository'yi Klonlayın

```bash
git clone https://github.com/zknzcode/top-clean.git
cd top-clean
```

### Adım 2: Firebase Projesi Oluşturun

1. [Firebase Console](https://console.firebase.google.com/)'a gidin
2. **"Proje ekle"** veya **"Proje oluştur"** butonuna tıklayın
3. Proje adınızı girin (örn: "personel-yonetim-sistemi")
4. Google Analytics'i etkinleştirin (isteğe bağlı)
5. **"Proje oluştur"** butonuna tıklayın
6. Proje oluşturulmasını bekleyin

### Adım 3: Firebase Servislerini Etkinleştirin

#### 3.1 Kimlik Doğrulama (Authentication)

1. Firebase Console'da **Authentication** → **Başlayın**'a gidin
2. **Email/Password** giriş yöntemini etkinleştirin
3. **Kaydet** butonuna tıklayın

#### 3.2 Firestore Veritabanı

1. **Firestore Database** → **Veritabanı oluştur**'a gidin
2. **Production modunda** başlatın (kuralları daha sonra ayarlayacağız)
3. Bir konum seçin (kullanıcılarınıza en yakın olanı)
4. **Etkinleştir** butonuna tıklayın

#### 3.3 Storage (Depolama)

1. **Storage** → **Başlayın**'a gidin
2. **Production modunda** başlatın
3. Firestore ile aynı konumu kullanın
4. **Tamam** butonuna tıklayın

#### 3.4 Hosting (Her iki uygulama için)

1. **Hosting** → **Başlayın**'a gidin
2. Kurulum sihirbazını takip edin
3. **İki hosting sitesi** oluşturmanız gerekecek:
   - Biri admin uygulaması için
   - Biri personel uygulaması için

Birden fazla site oluşturmak için:
- **Hosting** → **Başka bir site ekle**'ye gidin
- Siteleri oluşturun: `admin-siteniz` ve `personel-siteniz`

#### 3.5 Cloud Functions (Bulut Fonksiyonları)

1. **Functions** → **Başlayın**'a gidin
2. Faturalandırmayı etkinleştirin (Cloud Functions için gerekli)
3. **Devam et** butonuna tıklayın

### Adım 4: Firebase Yapılandırmasını Alın

1. Firebase Console'da "Proje genel bakış" yanındaki **dişli simgesi** ⚙️'ye tıklayın
2. **Proje ayarları**'nı seçin
3. **Uygulamalarınız** bölümüne kaydırın
4. Web uygulaması eklemek için **Web simgesi** `</>`'ye tıklayın
5. Bir takma adla uygulamayı kaydedin (örn: "Admin Uygulaması")
6. `firebaseConfig` nesnesini kopyalayın

Şöyle görünmelidir:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "projeniz.firebaseapp.com",
  projectId: "projeniz-id",
  storageBucket: "projeniz.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
  measurementId: "G-XXXXXXXXXX"
};
```

### Adım 5: Admin Uygulamasını Yapılandırın

#### 5.1 Firebase Yapılandırmasını Güncelleyin

1. `admin-app/src/App.tsx` dosyasını açın
2. `firebaseConfig` nesnesini bulun (yaklaşık 150. satır)
3. Firebase yapılandırmanızla değiştirin:

```typescript
const firebaseConfig = {
  apiKey: 'API_KEY_BURAYA',
  authDomain: 'projeniz.firebaseapp.com',
  projectId: 'projeniz-id',
  storageBucket: 'projeniz.appspot.com',
  messagingSenderId: 'MESSAGING_SENDER_ID',
  appId: 'APP_ID',
  measurementId: 'MEASUREMENT_ID',
}
```

#### 5.2 Admin Whitelist'i Güncelleyin

Aynı dosyada (`admin-app/src/App.tsx`), admin whitelist'i bulun (yaklaşık 694. satır):

```typescript
// Admin e-posta adreslerinizle değiştirin
const adminWhitelistEmails: string[] = ['admin@ornek.com']
// Admin kullanıcı ID'lerinizle değiştirin (admin kullanıcıları oluşturduktan sonra alacaksınız)
const adminWhitelistUids: string[] = []
```

#### 5.3 Google Maps API Key'ini Güncelleyin

1. Google Maps API Key alın:
   - [Google Cloud Console](https://console.cloud.google.com/)'a gidin
   - Projenizi seçin
   - **APIs & Services** → **Credentials**'a gidin
   - **Create Credentials** → **API Key**'e tıklayın
   - **Maps JavaScript API** ve **Geocoding API**'yi etkinleştirin

2. `admin-app/src/App.tsx` dosyasında yaklaşık 4230. satırı bulun:
   ```typescript
   src={`https://www.google.com/maps/embed/v1/place?key=GOOGLE_MAPS_API_KEY_BURAYA&q=...`}
   ```
   `GOOGLE_MAPS_API_KEY_BURAYA`'yı gerçek API key'inizle değiştirin

#### 5.4 Firebase Hosting Sitesini Güncelleyin

1. `admin-app/firebase.json` dosyasını açın
2. `"site": "your-admin-site"`'ı gerçek Firebase hosting site adınızla değiştirin

#### 5.5 Davet Linkini Güncelleyin

`admin-app/src/App.tsx` dosyasında yaklaşık 2365. satırı bulun:
```typescript
const link = `https://personel-siteniz.web.app/invite?email=${encodeURIComponent(form.email)}`
```
`personel-siteniz`'i gerçek personel uygulaması hosting URL'inizle değiştirin

### Adım 6: Personel Web Uygulamasını Yapılandırın

#### 6.1 Firebase Yapılandırmasını Güncelleyin

1. `personnel-web/src/firebase.ts` dosyasını açın
2. `firebaseConfig`'i Firebase yapılandırmanızla değiştirin (admin uygulamasıyla aynı)

#### 6.2 Firebase Hosting Sitesini Güncelleyin

1. `personnel-web/firebase.json` dosyasını açın
2. `"site": "your-personnel-site"`'ı gerçek Firebase hosting site adınızla değiştirin

#### 6.3 Service Worker'ı Güncelleyin

1. `personnel-web/public/sw.js` dosyasını açın
2. Güncelleyin:
   ```javascript
   const FIREBASE_PROJECT = 'projeniz-id'
   const FIREBASE_API_KEY = 'API_KEY_BURAYA'
   ```

### Adım 7: Firestore Güvenlik Kurallarını Yapılandırın

#### 7.1 Kurallarda Admin Whitelist'i Güncelleyin

1. `personnel-web/firestore.rules` dosyasını açın
2. `isAdmin()` fonksiyonunu bulun (yaklaşık 9. satır)
3. Admin e-postalarınız ve UID'lerinizle güncelleyin:

```javascript
function isAdmin() {
  return isSignedIn() &&
    (request.auth.token.admin == true ||
     request.auth.token.email in [
       'admin@ornek.com',  // Admin e-postalarınızı ekleyin
       'baska-admin@ornek.com'
     ] ||
     request.auth.uid in [
       'ADMIN_UID_1',  // Admin UID'lerinizi ekleyin (admin oluşturduktan sonra alacaksınız)
       'ADMIN_UID_2'
     ]);
}
```

4. Kuralları yayınlayın:
   ```bash
   cd personnel-web
   firebase deploy --only firestore:rules
   ```

### Adım 8: Cloud Functions'ı Yapılandırın

#### 8.1 SMTP Yapılandırmasını Güncelleyin

İki seçeneğiniz var:

**Seçenek A: Firebase Functions Config Kullanma (Önerilen)**

```bash
cd personnel-web
firebase functions:config:set \
  smtp.host="smtp.gmail.com" \
  smtp.port="587" \
  smtp.user="epostaniz@gmail.com" \
  smtp.pass="uygulama-sifreniz" \
  smtp.from="Uygulamaniz <epostaniz@gmail.com>"
```

**Seçenek B: Doğrudan Düzenleme**

1. `personnel-web/functions/index.js` dosyasını açın
2. SMTP yapılandırmasını güncelleyin (yaklaşık 20. satır):
   ```javascript
   const smtp = {
     host: process.env.SMTP_HOST || cfg.host || 'smtp.gmail.com',
     port: Number(process.env.SMTP_PORT || cfg.port || 587),
     user: process.env.SMTP_USER || cfg.user || 'epostaniz@gmail.com',
     pass: process.env.SMTP_PASS || cfg.pass || 'uygulama-sifreniz',
     from: process.env.SMTP_FROM || cfg.from || 'Uygulamaniz <epostaniz@gmail.com>',
   }
   ```

#### 8.2 Functions'ta Admin Whitelist'i Güncelleyin

`personnel-web/functions/index.js` dosyasında whitelist'i bulun (yaklaşık 50. satır):

```javascript
// Admin whitelist'inizle değiştirin
const whitelist = ['admin@ornek.com']  // Admin e-postalarınızı ekleyin
const uidWhitelist = ['ADMIN_UID']  // Admin UID'lerinizi ekleyin
```

#### 8.3 Gmail Uygulama Şifresi Alın (Gmail kullanıyorsanız)

1. Google Hesap ayarlarınıza gidin
2. **2 Adımlı Doğrulama**'yı etkinleştirin
3. **Uygulama şifreleri**'ne gidin
4. "Mail" için yeni bir uygulama şifresi oluşturun
5. Bu şifreyi SMTP yapılandırmasında kullanın

### Adım 9: Bağımlılıkları Yükleyin

```bash
# Admin Uygulaması
cd admin-app
npm install

# Personel Web Uygulaması
cd ../personnel-web
npm install

# Personel Web Functions
cd functions
npm install
cd ..
```

### Adım 10: Admin Kullanıcı Oluşturun

Admin panelini kullanabilmek için önce bir admin kullanıcı oluşturmanız gerekir.

#### Seçenek A: Admin Script Kullanma (Önerilen)

1. `admin-app/scripts/createAdmin.js` dosyasını güncelleyin:
   - Firebase config'i kendi config'inizle değiştirin
   - Admin e-posta ve şifresini güncelleyin:
     ```javascript
     const ADMIN_EMAIL = 'admin@ornek.com';
     const ADMIN_PASSWORD = 'GuvenliSifre123!';
     ```

2. Script'i çalıştırın:
   ```bash
   cd admin-app
   node scripts/createAdmin.js
   ```

3. Çıktıdan UID'yi kopyalayın ve şunlara ekleyin:
   - `admin-app/src/App.tsx` → `adminWhitelistUids`
   - `personnel-web/firestore.rules` → `isAdmin()` fonksiyonu
   - `personnel-web/functions/index.js` → `uidWhitelist`

#### Seçenek B: Firebase Console Kullanma

1. Firebase Console → **Authentication** → **Users**'a gidin
2. **Add user** butonuna tıklayın
3. E-posta ve şifre girin
4. UID'yi kopyalayın
5. **Firestore Database**'e gidin
6. `users` koleksiyonunda bir döküman oluşturun:
   - Döküman ID: (kopyaladığınız UID)
   - Alanlar:
     - `email`: (string) admin@ornek.com
     - `role`: (string) admin
     - `createdAt`: (timestamp) şu anki zaman

7. E-postayı ve UID'yi yukarıda açıklandığı gibi whitelist'lere ekleyin

### Adım 11: Script'leri Güncelleyin

#### 11.1 Admin Oluşturma Script'leri

- `admin-app/scripts/createAdmin.js`: Adım 10'da zaten güncellendi
- `personnel-web/scripts/createAdmin.js`: Firebase Admin SDK kullanır
  - Service account key gerektirir (Adım 12'ye bakın)
- `personnel-web/scripts/setUser.js`: Service account ve admin UID/e-postasını güncelleyin

#### 11.2 Davet Script'leri

- `admin-app/scripts/sendInvite.js`: Gerekirse varsayılan link URL'sini güncelleyin

### Adım 12: Firebase Admin SDK Kurulumu (İsteğe bağlı, gelişmiş script'ler için)

`personnel-web/scripts/createAdmin.js` veya `setUser.js` kullanmak istiyorsanız:

1. Firebase Console → **Proje Ayarları** → **Service Accounts**'a gidin
2. **Generate new private key** butonuna tıklayın
3. JSON dosyasını indirin
4. `personnel-web/scripts/setUser.js` dosyasını service account detaylarıyla güncelleyin
5. Ortam değişkenini ayarlayın:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="serviceAccountKey.json-dosya-yolu"
   ```

### Adım 13: Ortam Değişkenlerini Yapılandırın (Admin Uygulaması)

`admin-app/.env` dosyası oluşturun:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=epostaniz@gmail.com
SMTP_PASS=uygulama-sifreniz
FROM_NAME=Uygulamaniz
FROM_EMAIL=epostaniz@gmail.com
```

### Adım 14: Firebase CLI'ye Giriş Yapın

```bash
firebase login
```

Tarayıcı kimlik doğrulama akışını takip edin.

### Adım 15: Firebase Projelerini Başlatın

#### Admin Uygulaması için:

```bash
cd admin-app
firebase init
```

Seçin:
- ✅ Hosting
- Mevcut projeyi kullan → Projenizi seçin
- Public directory: `dist`
- Single-page app: Evet
- Otomatik build'leri ayarla: Hayır

#### Personel Web Uygulaması için:

```bash
cd personnel-web
firebase init
```

Seçin:
- ✅ Hosting
- ✅ Functions
- ✅ Firestore
- Mevcut projeyi kullan → Projenizi seçin
- Public directory: `dist`
- Single-page app: Evet
- Functions dili: JavaScript
- ESLint: Evet
- Bağımlılıkları yükle: Evet
- Firestore rules dosyası: `firestore.rules`
- Firestore indexes dosyası: `firestore.indexes.json`

### Adım 16: Uygulamaları Derleyin

#### Admin Uygulamasını Derleyin:

```bash
cd admin-app
npm run build:ui
```

#### Personel Web Uygulamasını Derleyin:

```bash
cd personnel-web
npm run build
```

### Adım 17: Firebase'e Yayınlayın

#### Admin Uygulamasını Yayınlayın:

```bash
cd admin-app
firebase deploy --only hosting
```

#### Personel Web Uygulamasını Yayınlayın:

```bash
cd personnel-web
firebase deploy --only hosting,functions,firestore:rules
```

### Adım 18: Uygulamaları Test Edin

1. **Admin Uygulaması**: `https://admin-siteniz.web.app` adresini ziyaret edin
   - Oluşturduğunuz admin bilgileriyle giriş yapın
   - Admin kontrol panelini görmelisiniz

2. **Personel Web Uygulaması**: `https://personel-siteniz.web.app` adresini ziyaret edin
   - Yeni bir kullanıcı kaydetmeyi deneyin
   - Davet sisteminin çalışıp çalışmadığını kontrol edin

### Adım 19: İlk Personel Kullanıcısını Oluşturun

1. Admin Uygulamasında **Dashboard**'a gidin
2. **New Invite** veya **Create Invite** butonuna tıklayın
3. Personel e-postasını girin ve "Personal" rolünü seçin
4. Davet linkini kopyalayın
5. Linki personele gönderin
6. Personel linke tıklayıp kayıt olur
7. Admin Uygulamasında kayıt isteğini onaylayın

---

## Geliştirme Modu

### Admin Uygulamasını Yerel Olarak Çalıştırın:

```bash
cd admin-app
npm run dev
```

Uygulama Electron penceresinde açılacaktır.

### Personel Web Uygulamasını Yerel Olarak Çalıştırın:

```bash
cd personnel-web
npm run dev
```

Terminalde gösterilen portu ziyaret edin (genellikle `http://localhost:5173`)

---

## Sorun Giderme

### Yaygın Sorunlar:

#### 1. "Permission denied" hataları

- Firestore güvenlik kurallarını kontrol edin
- Admin whitelist'inin e-postanızı/UID'nizi içerdiğini doğrulayın
- Kullanıcının Firestore `users` koleksiyonunda `role: 'admin'` olduğundan emin olun

#### 2. "Firebase: Error (auth/unauthorized-domain)"

- Firebase Console → Authentication → Settings → Authorized domains'e gidin
- Domain'inizi ekleyin

#### 3. E-posta gönderme çalışmıyor

- SMTP bilgilerini doğrulayın
- Gmail uygulama şifresini kontrol edin (Gmail kullanıyorsanız)
- Firebase Functions loglarını kontrol edin: `firebase functions:log`

#### 4. Konum takibi çalışmıyor

- HTTPS olduğundan emin olun (geolocation için gerekli)
- Tarayıcı izinlerini kontrol edin
- Service worker'ın kayıtlı olduğunu doğrulayın

#### 5. Build hataları

- node_modules'ı temizleyip yeniden yükleyin: `rm -rf node_modules package-lock.json && npm install`
- Node.js sürümünü kontrol edin: `node --version` (18+ olmalı)

---

## Proje Yapısı

```
.
├── admin-app/                  # Admin panel uygulaması
│   ├── src/
│   │   ├── App.tsx            # Ana admin uygulama bileşeni
│   │   ├── App.css            # Stiller
│   │   └── main.tsx           # Giriş noktası
│   ├── electron/              # Electron masaüstü uygulaması
│   │   ├── main.js            # Electron ana işlemi
│   │   └── preload.js         # Preload script
│   ├── scripts/               # Yardımcı script'ler
│   │   ├── createAdmin.js     # Admin kullanıcı oluştur
│   │   └── sendInvite.js      # Davet e-postası gönder
│   ├── public/                # Public varlıklar
│   ├── firebase.json          # Firebase hosting config
│   └── package.json           # Bağımlılıklar
│
├── personnel-web/             # Personel web uygulaması
│   ├── src/
│   │   ├── App.tsx            # Ana personel uygulaması
│   │   ├── firebase.ts        # Firebase yapılandırması
│   │   └── main.tsx           # Giriş noktası
│   ├── functions/             # Cloud Functions
│   │   ├── index.js           # Functions kodu
│   │   └── package.json       # Functions bağımlılıkları
│   ├── public/
│   │   └── sw.js              # Service Worker
│   ├── scripts/               # Yardımcı script'ler
│   │   ├── createAdmin.js     # Admin oluştur (Admin SDK)
│   │   └── setUser.js         # Kullanıcı dökümanı ayarla
│   ├── firebase.json          # Firebase config
│   ├── firestore.rules        # Güvenlik kuralları
│   └── package.json           # Bağımlılıklar
│
└── README.md                  # Bu dosya
```

---

## Güvenlik En İyi Uygulamaları

⚠️ **Production'a yayınlamadan önce:**

1. ✅ Tüm placeholder değerleri değiştirin
2. ✅ Uygun Firestore Güvenlik Kuralları ayarlayın
3. ✅ CORS ve domain kısıtlamalarını yapılandırın
4. ✅ Hassas veriler için ortam değişkenleri kullanın
5. ✅ Firebase App Check'i etkinleştirin
6. ✅ Uygun kimlik doğrulama kuralları ayarlayın
7. ✅ Google Maps API key'ini domain'lerinize kısıtlayın
8. ✅ Firebase Güvenlik Kuralları testini etkinleştirin
9. ✅ İzleme ve uyarılar ayarlayın
10. ✅ Düzenli güvenlik denetimleri yapın

---

## Lisans

Bu proje **GNU Affero General Public License v3.0 (AGPL-3.0)** lisansı altında lisanslanmıştır.

**Önemli**: Bu yazılımı değiştirip bir ağ servisi (web uygulaması) olarak kullanırsanız, değiştirilmiş sürümünüzün kaynak kodunu aynı AGPL lisansı altında tüm kullanıcılara açık hale getirmelisiniz.

Daha fazla detay için [LICENSE](LICENSE) dosyasına bakın.

---

## Destek

Sorunlar ve sorular için:
- [GitHub](https://github.com/zknzcode/top-clean/issues)'da bir issue açın
- Mevcut issue'ları çözümler için kontrol edin
