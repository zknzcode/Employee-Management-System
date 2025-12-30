import { useEffect, useMemo, useState, useRef } from 'react'
import './App.css'
import { initializeApp } from 'firebase/app'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  addDoc,
  orderBy,
  limit,
  where,
  deleteDoc,
} from 'firebase/firestore'
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'

type Lang = 'de' | 'ar'

type Tab = {
  id: string
  type: 'dashboard' | 'personnel' | 'personnel-detail' | 'tools' | 'support'
  label: string
  userId?: string
}

type SupportRequest = {
  id: string
  deviceId: string
  userName?: string
  userEmail?: string
  topic: 'wrong_report' | 'wrong_leave' | 'reset_account' | 'change_device' | 'other'
  relatedDate?: string
  affectedDate?: string
  message: string
  status: 'pending' | 'resolved'
  adminResponse?: string
  createdAt?: Timestamp
  resolvedAt?: Timestamp
}

type UserRow = {
  id: string
  email?: string
  name?: string
  surname?: string
  role?: string
  deviceId?: string
  photoURL?: string
  phone?: string
  address?: string
}

type Invite = {
  id: string
  email: string
  role: 'admin' | 'personal'
  status: 'pending' | 'accepted' | 'revoked'
  deviceId?: string
  createdAt?: Timestamp
}

type DeviceRequest = {
  id: string
  email: string
  name?: string
  note?: string
  deviceId: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt?: Timestamp
}

type LocationData = {
  latitude: number
  longitude: number
  accuracy?: number
  timestamp?: string | Date
}

type Report = {
  id: string
  date: string
  totalHours: number
  overtimeHours?: number
  status?: 'arbeit' | 'urlaub' | 'frei'
  leaveFrom?: string | null
  leaveTo?: string | null
  leaveReason?: string | null
  note?: string | null
  deviceId?: string | null
  createdAt?: Timestamp
  // Yeni alanlar - başlama/bitiş saatleri ve konum
  startTime?: string | null
  endTime?: string | null
  startSubmittedAt?: Timestamp | null
  endSubmittedAt?: Timestamp | null
  startLocation?: LocationData | null
  endLocation?: LocationData | null
  isOpen?: boolean
  // Mesai alanları
  overtimeStartTime?: string | null
  overtimeEndTime?: string | null
  overtimeStartSubmittedAt?: Timestamp | null
  overtimeEndSubmittedAt?: Timestamp | null
  overtimeStartLocation?: LocationData | null
  overtimeEndLocation?: LocationData | null
  isOvertimeOpen?: boolean
  hasOvertime?: boolean
}

type Notification = {
  id: string
  type: 'profile_update' | 'photo_update'
  deviceRequestId: string
  deviceId: string
  userName: string
  userEmail: string
  message: string
  read: boolean
  createdAt?: Timestamp
}

type Holiday = {
  id: string
  date: string // ISO yyyy-MM-dd
  note: string
  createdAt?: Timestamp
}

type LeaveRequest = {
  id: string
  deviceId: string
  userName: string
  userEmail: string
  leaveFrom: string
  leaveTo: string
  leaveReason?: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt?: Timestamp
}

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

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const auth = getAuth(app)
const storage = getStorage(app)

// Ondalık saati HH:MM formatına çevir (örn: 2.5 -> "2:30")
const formatDecimalHours = (decimalHours: number) => {
  const hours = Math.floor(decimalHours)
  const minutes = Math.round((decimalHours - hours) * 60)
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}

// Süreyi formatla (dakika cinsinden)
const formatDuration = (minutes: number, lang: Lang) => {
  if (minutes < 1) {
    return lang === 'de' ? '<1 Min' : '<1 دقيقة'
  }
  if (minutes < 60) {
    return `${Math.round(minutes)} ${lang === 'de' ? 'Min' : 'دقيقة'}`
  }
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  if (mins === 0) {
    return `${hours} ${lang === 'de' ? 'Std' : 'ساعة'}`
  }
  return `${hours} ${lang === 'de' ? 'Std' : 'ساعة'} ${mins} ${lang === 'de' ? 'Min' : 'دقيقة'}`
}

// Konumda kalınan süreyi hesapla
const calculateLocationDuration = (currentLoc: any, nextLoc: any | null) => {
  if (!nextLoc) return null // Son konum
  
  const currentTime = currentLoc.timestamp?.toDate 
    ? currentLoc.timestamp.toDate().getTime() 
    : (currentLoc.capturedAt ? new Date(currentLoc.capturedAt).getTime() : null)
  
  const nextTime = nextLoc.timestamp?.toDate 
    ? nextLoc.timestamp.toDate().getTime() 
    : (nextLoc.capturedAt ? new Date(nextLoc.capturedAt).getTime() : null)
  
  if (!currentTime || !nextTime) return null
  
  const durationMs = nextTime - currentTime
  const durationMinutes = durationMs / (1000 * 60)
  
  return durationMinutes
}

// Tarihi günden başlayacak şekilde formatla: 2025-12-28 -> 28.12.2025
const formatDate = (dateStr: string): string => {
  if (!dateStr || !dateStr.includes('-')) return dateStr
  const [year, month, day] = dateStr.split('-')
  return `${day}.${month}.${year}`
}

const copy: Record<Lang, any> = {
  de: {
    title: 'Admin Panel',
    subtitle: 'Einladungen & Geräteverwaltung',
    loginTitle: 'Admin Login',
    email: 'E-Mail',
    password: 'Passwort',
    login: 'Anmelden',
    logout: 'Abmelden',
    inviteSend: 'Einladung senden',
    role: 'Rolle',
    roleAdmin: 'Admin',
    rolePersonal: 'Personal',
    sending: 'Senden...',
    invites: 'Einladungen',
    status: 'Status',
    device: 'Gerät',
    action: 'Aktion',
    accept: 'Akzeptieren + Gerät ver',
    requests: 'Registrierungsanfragen',
    approve: 'Genehmigen',
    name: 'Name',
    deviceId: 'Gerät',
    personnel: 'Personal',
    search: 'Suchen',
    details: 'Details',
    reportsOf: ' • Einträge',
    noReports: 'Keine Einträge',
    loadingAuth: 'Anmeldestatus wird geprüft...',
    loading: 'Lädt...',
    errorLogin: 'Anmeldung fehlgeschlagen',
    unauthorized: 'Keine Admin-Berechtigung gefunden.',
    needRole: 'Bitte role: "admin" im users-Dokument hinterlegen.',
    inviteSaved: 'Einladung erstellt!',
    copyLink: 'Link kopieren',
    linkCopied: 'Link kopiert!',
    createInvite: 'Einladung erstellen',
    emailAlreadyExists: 'Diese E-Mail existiert bereits im System',
    emailAlreadyHasInvite: 'Für diese E-Mail existiert bereits eine Einladung',
    emailCanBeRecreated: 'Diese E-Mail wurde gelöscht und kann erneut erstellt werden',
    newInviteBtn: 'Neue Einladung',
    dashboard: 'Dashboard',
    tabPersonnel: 'Personal',
    date: 'Datum',
    hours: 'Stunden',
    overtime: 'Überstunden',
    statusWork: 'Arbeit',
    statusLeave: 'Urlaub',
    statusOff: 'Frei',
    reports: 'Berichte',
    closeTab: 'Schließen',
    monthlyTotal: 'Monatliche Zusammenfassung',
    totalOvertime: 'Gesamtüberstunden',
    totalCombined: 'Gesamt (inkl. Überstunden)',
    currentMonth: 'Aktueller Monat',
    editProfile: 'Profil bearbeiten',
    saveChanges: 'Speichern',
    cancel: 'Abbrechen',
    phone: 'Telefon',
    address: 'Adresse',
    uploadPhoto: 'Foto hochladen',
    photoUploaded: 'Foto hochgeladen',
    updating: 'Aktualisieren...',
    updated: 'Aktualisiert',
    notifications: 'Benachrichtigungen',
    noNotifications: 'Keine neuen Benachrichtigungen',
    markRead: 'Als gelesen markieren',
    profileUpdated: 'Profil aktualisiert',
    photoUpdated: 'Foto aktualisiert',
    overview: 'Übersicht',
    totalPersonnel: 'Gesamt Personal',
    activeDevices: 'Aktive Geräte',
    pendingRequests: 'Offene Anfragen',
    todayReports: 'Heute erfasst',
    thisMonth: 'Diesen Monat',
    totalHoursMonth: 'Stunden gesamt',
    quickActions: 'Schnellaktionen',
    recentActivity: 'Letzte Aktivitäten',
    viewAll: 'Alle anzeigen',
    newInvite: 'Neue Einladung',
    accepted: 'Akzeptiert',
    pending: 'Ausstehend',
    holidays: 'Feiertage / Sperrtage',
    addHoliday: 'Tag hinzufügen',
    holidayDate: 'Datum',
    holidayNote: 'Bezeichnung',
    deleteHoliday: 'Löschen',
    noHolidays: 'Keine Feiertage eingetragen',
    holidayAdded: 'Feiertag hinzugefügt',
    leaveRequests: 'Urlaubsanträge',
    leaveFrom: 'Von',
    leaveTo: 'Bis',
    leaveReason: 'Grund',
    approveLeave: 'Genehmigen',
    rejectLeave: 'Ablehnen',
    noLeaveRequests: 'Keine offenen Urlaubsanträge',
    leaveApproved: 'Urlaub genehmigt',
    leaveRejected: 'Urlaub abgelehnt',
    // Yeni alanlar için çeviriler
    startTime: 'Startzeit',
    endTime: 'Endzeit',
    submittedAt: 'Eingereicht am',
    location: 'Standort',
    startEntry: 'Arbeitsbeginn',
    endEntry: 'Arbeitsende',
    openEntry: 'Offen (noch kein Ende)',
    noLocation: 'Kein Standort',
    showOnMap: 'Auf Karte anzeigen',
    // Mesai
    overtimeEntry: 'Überstunden',
    overtimeTime: 'Überstundenzeit',
    normalWork: 'Normale Arbeit',
    noOvertime: 'Keine Überstunden',
    // Harita dialog
    mapDialogTitle: 'Standort auf Karte',
    closeMap: 'Schließen',
    workStart: 'Arbeitsbeginn',
    workEnd: 'Arbeitsende',
    overtimeStart: 'Überstunden-Beginn',
    overtimeEnd: 'Überstunden-Ende',
    // Araçlar
    adminTools: 'Admin-Werkzeuge',
    toolsDescription: 'Schnelle Aktionen für Datenverwaltung',
    deleteReportsForDevice: 'Berichte eines Geräts löschen',
    deleteAllPendingRequests: 'Alle wartenden Anfragen löschen',
    deleteUserAccount: 'Benutzerkonto löschen',
    deleteUserConfirm: 'Möchten Sie dieses Benutzerkonto wirklich löschen? Alle Berichte und Geräteinformationen werden gelöscht.',
    userDeleted: 'Benutzerkonto erfolgreich gelöscht',
    backupUserData: 'Benutzerdaten sichern',
    backupUserReports: 'Berichte sichern',
    backupSuccess: 'Backup erfolgreich erstellt',
    backupDownloaded: 'Backup heruntergeladen',
    restoreUserData: 'Benutzerdaten wiederherstellen',
    restoreFromBackup: 'Aus Backup wiederherstellen',
    restoreSuccess: 'Daten erfolgreich wiederhergestellt',
    selectBackupFile: 'Backup-Datei auswählen',
    changeDevice: 'Gerät wechseln',
    changeDeviceDescription: 'Benutzerdaten sichern, altes Konto löschen und auf neues Gerät übertragen',
    newDeviceId: 'Neue Geräte-ID',
    enterNewDeviceId: 'Neue Geräte-ID eingeben',
    deviceChanged: 'Gerät erfolgreich gewechselt',
    changeDeviceConfirm: 'Möchten Sie das Gerät wirklich wechseln? Die Daten werden gesichert, das alte Konto gelöscht und auf das neue Gerät übertragen.',
    support: 'Support',
    supportRequests: 'Support-Anfragen',
    supportTopic: 'Thema',
    supportTopicWrongReport: 'Falscher Bericht',
    supportTopicWrongLeave: 'Falscher Urlaub',
    supportTopicResetAccount: 'Konto zurücksetzen',
    supportTopicChangeDevice: 'Gerät wechseln',
    supportTopicOther: 'Andere',
    supportMessage: 'Nachricht',
    supportStatusPending: 'Ausstehend',
    supportStatusResolved: 'Gelöst',
    supportResolve: 'Als gelöst markieren',
    supportResolved: 'Anfrage als gelöst markiert',
    supportViewPersonnel: 'Personel anzeigen',
    supportRelatedDate: 'Betroffenes Datum',
    adminResponse: 'Admin-Antwort',
    clearSupportHistory: 'Verlauf löschen',
    clearSupportHistoryConfirm: 'Möchten Sie alle gelösten Support-Anfragen wirklich löschen?',
    supportHistoryCleared: 'Verlauf erfolgreich gelöscht',
    supportCreatedAt: 'Erstellt am',
    reportStatistics: 'Berichtstatistiken',
    statsPeriodWeek: 'Diese Woche',
    statsPeriodMonth: 'Dieser Monat',
    statsPeriodAll: 'Gesamt',
    totalReports: 'Gesamt Berichte',
    totalWorkHours: 'Gesamt Arbeitsstunden',
    totalOvertimeHours: 'Gesamt Überstunden',
    totalCombinedHours: 'Gesamt (inkl. Überstunden)',
    workDays: 'Arbeitstage',
    leaveDays: 'Urlaubstage',
    offDays: 'Freitage',
    topWorker: 'Meist arbeitender Mitarbeiter',
    filterByStatus: 'Nach Status filtern',
    filterByDate: 'Nach Datum filtern',
    allStatus: 'Alle Status',
    searchResults: 'Suchergebnisse',
    noSearchResults: 'Keine Ergebnisse gefunden',
    selectDevice: 'Gerät auswählen',
    selectDateRange: 'Datumsbereich',
    fromDate: 'Von',
    toDate: 'Bis',
    confirmDelete: 'Löschen bestätigen',
    deleteSuccess: 'Erfolgreich gelöscht!',
    deleteError: 'Fehler beim Löschen',
    dangerZone: 'Gefahrenzone',
    dangerWarning: 'Diese Aktionen können nicht rückgängig gemacht werden!',
    reportsDeleted: 'Berichte gelöscht',
    requestsDeleted: 'Anfragen gelöscht',
    resetUserOvertime: 'Überstunden zurücksetzen',
    clearAllReports: 'Alle Berichte löschen',
    exportData: 'Daten exportieren',
    noDataToDelete: 'Keine Daten zum Löschen',
    selectPersonnel: 'Personal auswählen',
    // Canlı konum takibi
    liveLocationTracking: 'Live-Standortverfolgung',
    activePersonnel: 'Aktive Mitarbeiter',
    lastLocation: 'Letzte Position',
    trackingTime: 'Zeitpunkt',
    noActivePersonnel: 'Keine aktiven Mitarbeiter',
    refreshLocation: 'Standort aktualisieren',
    locationHistory: 'Standortverlauf',
    liveTracking: 'Live-Tracking',
    playMapRecording: 'Kartenaufzeichnung abspielen',
    pauseMap: 'Pause',
    resumeMap: 'Fortsetzen',
    playbackSpeed: 'Wiedergabegeschwindigkeit',
    mapPlayback: 'Kartenwiedergabe',
    noLocationData: 'Keine Standortdaten für diesen Tag',
    deleteAllReports: 'Alle Berichte löschen',
    deleteSelectedReports: 'Ausgewählte Berichte löschen',
    selectAll: 'Alle auswählen',
    deselectAll: 'Auswahl aufheben',
    selectedCount: 'Ausgewählt',
    noReportsForUser: 'Keine Berichte für diesen Benutzer',
    selectReportsToDelete: 'Berichte zum Löschen auswählen',
    editReport: 'Bericht bearbeiten',
    reportUpdated: 'Bericht aktualisiert',
    updateReport: 'Aktualisieren',
    editingReport: 'Bearbeite Bericht',
    note: 'Notiz',
    autoCalculated: '(Automatisch)',
  },
  ar: {
    title: 'Admin Panel',
    subtitle: 'دعوات وإدارة الأجهزة',
    loginTitle: 'تسجيل دخول المدير',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    login: 'تسجيل',
    logout: 'تسجيل خروج',
    inviteSend: 'إرسال دعوة',
    role: 'الصلاحية',
    roleAdmin: 'مدير',
    rolePersonal: 'موظف',
    sending: 'يتم الإرسال...',
    invites: 'الدعوات',
    status: 'الحالة',
    device: 'الجهاز',
    action: 'إجراء',
    accept: 'قبول + ربط جهاز',
    requests: 'طلبات التسجيل',
    approve: 'موافقة',
    name: 'الاسم',
    deviceId: 'معرّف الجهاز',
    personnel: 'الموظفون',
    search: 'بحث',
    details: 'تفاصيل',
    reportsOf: ' • السجلات',
    noReports: 'لا توجد سجلات',
    loadingAuth: 'يتم التحقق من الجلسة...',
    loading: 'جارٍ التحميل...',
    errorLogin: 'فشل تسجيل الدخول',
    unauthorized: 'لا توجد صلاحية مدير.',
    needRole: 'يجب أن يكون role: "admin" في وثيقة المستخدم.',
    inviteSaved: 'تم إنشاء الدعوة!',
    copyLink: 'نسخ الرابط',
    linkCopied: 'تم نسخ الرابط!',
    createInvite: 'إنشاء دعوة',
    emailAlreadyExists: 'هذا البريد الإلكتروني موجود بالفعل في النظام',
    emailAlreadyHasInvite: 'يوجد دعوة بالفعل لهذا البريد الإلكتروني',
    emailCanBeRecreated: 'تم حذف هذا البريد الإلكتروني ويمكن إنشاؤه مرة أخرى',
    newInviteBtn: 'دعوة جديدة',
    dashboard: 'لوحة التحكم',
    tabPersonnel: 'الموظفون',
    date: 'التاريخ',
    hours: 'الساعات',
    overtime: 'ساعات إضافية',
    statusWork: 'عمل',
    statusLeave: 'إجازة',
    statusOff: 'عطلة',
    reports: 'التقارير',
    closeTab: 'إغلاق',
    monthlyTotal: 'ملخص الشهر',
    totalOvertime: 'إجمالي الساعات الإضافية',
    totalCombined: 'الإجمالي (شامل الإضافي)',
    currentMonth: 'الشهر الحالي',
    editProfile: 'تعديل الملف الشخصي',
    saveChanges: 'حفظ',
    cancel: 'إلغاء',
    phone: 'الهاتف',
    address: 'العنوان',
    uploadPhoto: 'تحميل صورة',
    photoUploaded: 'تم تحميل الصورة',
    updating: 'جاري التحديث...',
    updated: 'تم التحديث',
    notifications: 'الإشعارات',
    noNotifications: 'لا توجد إشعارات جديدة',
    markRead: 'وضع علامة مقروء',
    profileUpdated: 'تم تحديث الملف الشخصي',
    photoUpdated: 'تم تحديث الصورة',
    overview: 'نظرة عامة',
    totalPersonnel: 'إجمالي الموظفين',
    activeDevices: 'الأجهزة النشطة',
    pendingRequests: 'طلبات معلقة',
    todayReports: 'تسجيلات اليوم',
    thisMonth: 'هذا الشهر',
    totalHoursMonth: 'إجمالي الساعات',
    quickActions: 'إجراءات سريعة',
    recentActivity: 'النشاط الأخير',
    viewAll: 'عرض الكل',
    newInvite: 'دعوة جديدة',
    accepted: 'مقبول',
    pending: 'معلق',
    holidays: 'العطل الرسمية',
    addHoliday: 'إضافة يوم',
    holidayDate: 'التاريخ',
    holidayNote: 'الوصف',
    deleteHoliday: 'حذف',
    noHolidays: 'لا توجد عطل مسجلة',
    holidayAdded: 'تمت إضافة العطلة',
    leaveRequests: 'طلبات الإجازة',
    leaveFrom: 'من',
    leaveTo: 'إلى',
    leaveReason: 'السبب',
    approveLeave: 'موافقة',
    rejectLeave: 'رفض',
    noLeaveRequests: 'لا توجد طلبات إجازة معلقة',
    leaveApproved: 'تمت الموافقة على الإجازة',
    leaveRejected: 'تم رفض الإجازة',
    // Yeni alanlar için çeviriler
    startTime: 'وقت البدء',
    endTime: 'وقت الانتهاء',
    submittedAt: 'تم الإرسال في',
    location: 'الموقع',
    startEntry: 'بدء العمل',
    endEntry: 'نهاية العمل',
    openEntry: 'مفتوح (لم ينتهِ بعد)',
    noLocation: 'لا يوجد موقع',
    showOnMap: 'عرض على الخريطة',
    // Mesai
    overtimeEntry: 'ساعات إضافية',
    overtimeTime: 'وقت الساعات الإضافية',
    normalWork: 'العمل العادي',
    noOvertime: 'لا توجد ساعات إضافية',
    // Harita dialog
    mapDialogTitle: 'الموقع على الخريطة',
    closeMap: 'إغلاق',
    workStart: 'بداية العمل',
    workEnd: 'نهاية العمل',
    overtimeStart: 'بداية الإضافي',
    overtimeEnd: 'نهاية الإضافي',
    // Araçlar
    adminTools: 'أدوات المسؤول',
    toolsDescription: 'إجراءات سريعة لإدارة البيانات',
    deleteReportsForDevice: 'حذف تقارير جهاز',
    deleteAllPendingRequests: 'حذف جميع الطلبات المعلقة',
    deleteUserAccount: 'حذف حساب المستخدم',
    deleteUserConfirm: 'هل تريد حقًا حذف حساب المستخدم هذا؟ سيتم حذف جميع التقارير ومعلومات الجهاز.',
    userDeleted: 'تم حذف حساب المستخدم بنجاح',
    backupUserData: 'نسخ احتياطي لبيانات المستخدم',
    backupUserReports: 'نسخ احتياطي للتقارير',
    backupSuccess: 'تم إنشاء النسخة الاحتياطية بنجاح',
    backupDownloaded: 'تم تنزيل النسخة الاحتياطية',
    restoreUserData: 'استعادة بيانات المستخدم',
    restoreFromBackup: 'استعادة من النسخة الاحتياطية',
    restoreSuccess: 'تم استعادة البيانات بنجاح',
    selectBackupFile: 'اختر ملف النسخة الاحتياطية',
    changeDevice: 'تغيير الجهاز',
    changeDeviceDescription: 'نسخ احتياطي لبيانات المستخدم، حذف الحساب القديم ونقلها إلى الجهاز الجديد',
    newDeviceId: 'معرف الجهاز الجديد',
    enterNewDeviceId: 'أدخل معرف الجهاز الجديد',
    deviceChanged: 'تم تغيير الجهاز بنجاح',
    changeDeviceConfirm: 'هل تريد حقًا تغيير الجهاز؟ سيتم نسخ البيانات احتياطيًا وحذف الحساب القديم ونقلها إلى الجهاز الجديد.',
    support: 'الدعم',
    supportRequests: 'طلبات الدعم',
    supportTopic: 'الموضوع',
    supportTopicWrongReport: 'تسجيل وقت خاطئ',
    supportTopicWrongLeave: 'إجازة خاطئة',
    supportTopicResetAccount: 'إعادة تعيين الحساب',
    supportTopicChangeDevice: 'تغيير الجهاز',
    supportTopicOther: 'أخرى',
    supportMessage: 'الرسالة',
    supportStatusPending: 'قيد الانتظار',
    supportStatusResolved: 'تم الحل',
    supportResolve: 'تمييز كحل',
    supportResolved: 'تم تمييز الطلب كحل',
    supportViewPersonnel: 'عرض الموظف',
    supportRelatedDate: 'التاريخ المعني',
    adminResponse: 'رد المشرف',
    clearSupportHistory: 'مسح السجل',
    clearSupportHistoryConfirm: 'هل تريد حقًا حذف جميع طلبات الدعم المحلولة؟',
    supportHistoryCleared: 'تم مسح السجل بنجاح',
    supportCreatedAt: 'تم الإنشاء في',
    reportStatistics: 'إحصائيات التقارير',
    statsPeriodWeek: 'هذا الأسبوع',
    statsPeriodMonth: 'هذا الشهر',
    statsPeriodAll: 'الإجمالي',
    totalReports: 'إجمالي التقارير',
    totalWorkHours: 'إجمالي ساعات العمل',
    totalOvertimeHours: 'إجمالي الساعات الإضافية',
    totalCombinedHours: 'الإجمالي (بما في ذلك الإضافي)',
    workDays: 'أيام العمل',
    leaveDays: 'أيام الإجازة',
    offDays: 'أيام الراحة',
    topWorker: 'أكثر موظف يعمل',
    filterByStatus: 'تصفية حسب الحالة',
    filterByDate: 'تصفية حسب التاريخ',
    allStatus: 'جميع الحالات',
    searchResults: 'نتائج البحث',
    noSearchResults: 'لم يتم العثور على نتائج',
    selectDevice: 'اختر الجهاز',
    selectDateRange: 'نطاق التاريخ',
    fromDate: 'من',
    toDate: 'إلى',
    confirmDelete: 'تأكيد الحذف',
    deleteSuccess: 'تم الحذف بنجاح!',
    deleteError: 'خطأ في الحذف',
    dangerZone: 'منطقة الخطر',
    dangerWarning: 'لا يمكن التراجع عن هذه الإجراءات!',
    reportsDeleted: 'تم حذف التقارير',
    requestsDeleted: 'تم حذف الطلبات',
    resetUserOvertime: 'إعادة تعيين الإضافي',
    clearAllReports: 'حذف جميع التقارير',
    exportData: 'تصدير البيانات',
    noDataToDelete: 'لا توجد بيانات للحذف',
    selectPersonnel: 'اختر الموظف',
    // Canlı konum takibi
    liveLocationTracking: 'تتبع الموقع المباشر',
    activePersonnel: 'الموظفون النشطون',
    lastLocation: 'آخر موقع',
    trackingTime: 'الوقت',
    noActivePersonnel: 'لا يوجد موظفون نشطون',
    refreshLocation: 'تحديث الموقع',
    locationHistory: 'سجل الموقع',
    liveTracking: 'تتبع مباشر',
    playMapRecording: 'تشغيل تسجيل الخريطة',
    pauseMap: 'إيقاف مؤقت',
    resumeMap: 'استئناف',
    playbackSpeed: 'سرعة التشغيل',
    mapPlayback: 'تشغيل الخريطة',
    noLocationData: 'لا توجد بيانات موقع لهذا اليوم',
    deleteAllReports: 'حذف جميع التقارير',
    deleteSelectedReports: 'حذف التقارير المحددة',
    selectAll: 'تحديد الكل',
    deselectAll: 'إلغاء التحديد',
    selectedCount: 'محدد',
    noReportsForUser: 'لا توجد تقارير لهذا المستخدم',
    selectReportsToDelete: 'اختر التقارير للحذف',
    editReport: 'تعديل التقرير',
    reportUpdated: 'تم تحديث التقرير',
    updateReport: 'تحديث',
    editingReport: 'تعديل التقرير',
    note: 'ملاحظة',
    autoCalculated: '(تلقائي)',
  },
}

declare global {
  interface Window {
    api?: {
      sendMail: (payload: { to: string; link: string }) => Promise<void>
    }
  }
}

function App() {
  const [lang, setLang] = useState<Lang>(() => {
    // localStorage'dan dil tercihini oku
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tc_admin_lang')
      if (saved === 'ar' || saved === 'de') return saved
    }
    return 'de'
  })
  const [langAnimating, setLangAnimating] = useState(false)
  const t = copy[lang]

  const switchLang = (newLang: Lang) => {
    if (newLang === lang) return
    setLangAnimating(true)
    // Dil değiştiğinde bildirimi temizle (çünkü metin eski dilde kalıyor)
    setToolsMessage(null)
    setTimeout(() => {
      setLang(newLang)
      localStorage.setItem('tc_admin_lang', newLang)
      setTimeout(() => setLangAnimating(false), 300)
    }, 150)
  }
  // TODO: Replace with your admin whitelist emails and UIDs
  const adminWhitelistEmails: string[] = [] // Add your admin emails here
  const adminWhitelistUids: string[] = [] // Add your admin UIDs here

  const functions = useMemo(() => getFunctions(app, 'us-central1'), [])
  const sendInviteFn = useMemo(() => httpsCallable(functions, 'sendInvite'), [functions])

  const [authUser, setAuthUser] = useState<{ uid: string; email: string | null } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [userRole, setUserRole] = useState<string | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ email: '', role: 'personal' as Invite['role'] })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [requests, setRequests] = useState<DeviceRequest[]>([])
  const [reqLoading, setReqLoading] = useState(true)
  const [reports, setReports] = useState<Report[]>([])
  const [repLoading, setRepLoading] = useState(true)
  const [users, setUsers] = useState<UserRow[]>([])
  const [userLoading, setUserLoading] = useState(true)
  const [userSearch, setUserSearch] = useState('')

  // Bildirimler
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifLoading, setNotifLoading] = useState(true)

  // Tatil günleri
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [holidayForm, setHolidayForm] = useState({ date: '', note: '' })
  const [holidayAdding, setHolidayAdding] = useState(false)
  const [holidayMsg, setHolidayMsg] = useState<string | null>(null)

  // İzin talepleri
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  
  // Destek istekleri
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([])
  const [supportLoading, setSupportLoading] = useState(true)
  const [prevLeaveCount, setPrevLeaveCount] = useState(0)
  
  // Aktif cihazlar (deviceAccess)
  const [activeDevices, setActiveDevices] = useState<Set<string>>(new Set())

  // Profil düzenleme
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', surname: '', phone: '', address: '' })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const startEditing = (user: UserRow) => {
    setEditingUserId(user.id)
    setEditForm({
      name: user.name || '',
      surname: user.surname || '',
      phone: user.phone || '',
      address: user.address || '',
    })
    setSaveMsg(null)
  }

  const cancelEditing = () => {
    setEditingUserId(null)
    setSaveMsg(null)
  }

  const handlePhotoUpload = async (userId: string, file: File) => {
    setUploading(true)
    try {
      // Dosya uzantısını al
      const ext = file.name.split('.').pop() || 'jpg'
      const storageRef = ref(storage, `profile-photos/${userId}.${ext}`)
      // Content-type ile yükle
      await uploadBytes(storageRef, file, { contentType: file.type })
      const url = await getDownloadURL(storageRef)
      await updateDoc(doc(db, 'deviceRequests', userId), { photoURL: url })
      setSaveMsg(t.photoUploaded)
    } catch (e) {
      console.error('Photo upload error:', e)
    } finally {
      setUploading(false)
    }
  }

  const handleSaveProfile = async (userId: string) => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const fullName = `${editForm.name} ${editForm.surname}`.trim()
      await updateDoc(doc(db, 'deviceRequests', userId), {
        name: fullName,
        phone: editForm.phone,
        address: editForm.address,
      })
      setSaveMsg(t.updated)
      setEditingUserId(null)
    } catch (e) {
      console.error('Save profile error:', e)
    } finally {
      setSaving(false)
    }
  }

  // Sekme yönetimi
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'dashboard', type: 'dashboard', label: 'Dashboard' },
    { id: 'personnel', type: 'personnel', label: 'Personal' },
    { id: 'support', type: 'support', label: 'Support' },
    { id: 'tools', type: 'tools', label: 'Werkzeuge' },
  ])
  const [activeTabId, setActiveTabId] = useState('dashboard')

  const openPersonnelDetail = (user: UserRow) => {
    const existingTab = tabs.find((t) => t.type === 'personnel-detail' && t.userId === user.id)
    if (existingTab) {
      setActiveTabId(existingTab.id)
    } else {
      const newTab: Tab = {
        id: `detail-${user.id}`,
        type: 'personnel-detail',
        label: user.name ? `${user.name} ${user.surname || ''}`.trim() : user.email || user.id,
        userId: user.id,
      }
      setTabs((prev) => [...prev, newTab])
      setActiveTabId(newTab.id)
    }
  }

  const closeTab = (tabId: string) => {
    const idx = tabs.findIndex((t) => t.id === tabId)
    setTabs((prev) => prev.filter((t) => t.id !== tabId))
    if (activeTabId === tabId) {
      setActiveTabId(tabs[idx - 1]?.id || 'dashboard')
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          setAuthUser({ uid: user.uid, email: user.email })
          try {
            const userDoc = await getDoc(doc(db, 'users', user.uid))
            setUserRole(userDoc.exists() ? (userDoc.data() as any).role : null)
          } catch (e) {
            setUserRole(null)
          }
        } else {
          setAuthUser(null)
          setUserRole(null)
        }
      } finally {
        setAuthLoading(false)
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!authUser) return
    const q = query(collection(db, 'invites'), orderBy('createdAt', 'desc'), limit(50))
    const unsub = onSnapshot(q, (snap) => {
      const rows: Invite[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      setInvites(rows)
      setLoading(false)
    })
    return () => unsub()
  }, [authUser])

  useEffect(() => {
    if (!authUser) return
    const q = query(collection(db, 'deviceRequests'), orderBy('createdAt', 'desc'), limit(50))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: DeviceRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        setRequests(rows)
        setReqLoading(false)
      },
      () => setReqLoading(false),
    )
    return () => unsub()
  }, [authUser])

  useEffect(() => {
    if (!authUser) return
    // Tüm deviceRequests'i al ve client-side filtrele (index problemi önlenir)
    const q = query(collection(db, 'deviceRequests'), limit(500))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: UserRow[] = snap.docs
          .filter((d) => (d.data() as any).status === 'approved')
          .map((d) => {
            const data = d.data() as any
            const fullName = data.name || ''
            const nameParts = fullName.trim().split(' ')
            const firstName = nameParts[0] || ''
            const surname = nameParts.slice(1).join(' ') || ''
            return {
              id: d.id,
              email: data.email || '',
              name: firstName,
              surname: surname,
              role: 'personal',
              deviceId: data.deviceId || '',
              photoURL: data.photoURL || '',
              phone: data.phone || '',
              address: data.address || '',
            }
          })
        setUsers(rows)
        setUserLoading(false)
      },
      (err) => {
        console.error('Users fetch error:', err)
        setUserLoading(false)
      },
    )
    return () => unsub()
  }, [authUser])

  // Bildirimleri çek
  useEffect(() => {
    if (!authUser) return
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(50))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Notification[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        setNotifications(rows)
        setNotifLoading(false)
      },
      () => setNotifLoading(false),
    )
    return () => unsub()
  }, [authUser])

  // Destek isteklerini çek
  useEffect(() => {
    if (!authUser) return
    const q = query(collection(db, 'supportRequests'), orderBy('createdAt', 'desc'), limit(100))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: SupportRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        setSupportRequests(rows)
        setSupportLoading(false)
      },
      () => setSupportLoading(false),
    )
    return () => unsub()
  }, [authUser])

  // Tatil günlerini çek
  useEffect(() => {
    if (!authUser) return
    const q = query(collection(db, 'holidays'), orderBy('date', 'asc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Holiday[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        setHolidays(rows)
      },
      (err) => console.error('Holidays fetch error:', err),
    )
    return () => unsub()
  }, [authUser])

  // İzin taleplerini çek
  useEffect(() => {
    if (!authUser) return
    const q = query(collection(db, 'leaveRequests'), orderBy('createdAt', 'desc'), limit(50))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: LeaveRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        const pendingCount = rows.filter((r) => r.status === 'pending').length
        
        // Yeni izin talebi geldi mi kontrol et ve ses çal
        if (pendingCount > prevLeaveCount && prevLeaveCount > 0) {
          // Sesli bildirim çal
          try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp2LcmBkaHaBjpmXhXJkZGp3goyVk4FvY2Vqdn+IkI6AcGNlaXV9hYyKf3BjZWl0fISKiH5vY2VpdHyDiYd9b2NlanR7goiGfG9jZWp0e4KHhXtvY2VqdHuBhoR7b2RmanR6gIWDeW5kZmp0eoCEgnhuZGZqdHp/g4F3bmRmanR5f4KAd25kZmp0eX6BgHZtZGZqdXl+gH91bWRmanV5fX99dW1kZmt1eX19fXVtZGZrdXl8fXx1bWRma3V5fHx8dW1kZmt1eHx8fHRtZWZrdXh8fHt0bWVma3V4e3t7dG1lZmt1eHt7e3RtZWZrdXh7e3p0bWVma3V4ent6dG1lZmt1eHp6enRtZWZrdXh6enl0bWVma3V4enp5dG1lZ2t1eHl5eXRtZWdrdXh5eXl0bWVna3V4eXl5dG1lZ2t1eHl5eHRtZWdrdXh5eXh0bWVna3V4eXh4dG1lZ2t1eHh4eHRtZWdrdXh4eHh0bWVna3V4eHh4')
            audio.volume = 0.5
            audio.play().catch(() => {})
          } catch (e) {
            console.log('Audio not supported')
          }
        }
        
        setPrevLeaveCount(pendingCount)
        setLeaveRequests(rows)
      },
      (err) => console.error('Leave requests fetch error:', err),
    )
    return () => unsub()
  }, [authUser, prevLeaveCount])

  // İzin talebini onayla
  const approveLeaveRequest = async (req: LeaveRequest) => {
    try {
      // Her gün için ayrı rapor oluştur
      const fromDate = new Date(req.leaveFrom)
      const toDate = new Date(req.leaveTo)
      const currentDate = new Date(fromDate)
      
      while (currentDate <= toDate) {
        const dateStr = currentDate.toISOString().slice(0, 10)
        await addDoc(collection(db, 'reports'), {
          date: dateStr,
          totalHours: 0,
          overtimeHours: 0,
          status: 'urlaub',
          leaveFrom: req.leaveFrom,
          leaveTo: req.leaveTo,
          leaveReason: req.leaveReason || null,
          deviceId: req.deviceId,
          createdAt: Timestamp.now(),
        })
        currentDate.setDate(currentDate.getDate() + 1)
      }
      
      // Talebi approved olarak işaretle
      await updateDoc(doc(db, 'leaveRequests', req.id), { 
        status: 'approved',
        approvedAt: Timestamp.now(),
      })
      
      setInfo(t.leaveApproved)
    } catch (e) {
      console.error('Approve leave error:', e)
      setError('Genehmigung fehlgeschlagen')
    }
  }

  // İzin talebini reddet
  const rejectLeaveRequest = async (req: LeaveRequest) => {
    try {
      await updateDoc(doc(db, 'leaveRequests', req.id), { 
        status: 'rejected',
        rejectedAt: Timestamp.now(),
      })
      setInfo(t.leaveRejected)
    } catch (e) {
      console.error('Reject leave error:', e)
      setError('Ablehnung fehlgeschlagen')
    }
  }

  const pendingLeaveCount = leaveRequests.filter((r) => r.status === 'pending').length

  const markNotificationRead = async (notifId: string) => {
    await updateDoc(doc(db, 'notifications', notifId), { read: true })
  }

  const addHoliday = async () => {
    if (!holidayForm.date || !holidayForm.note.trim()) return
    setHolidayAdding(true)
    setHolidayMsg(null)
    try {
      await addDoc(collection(db, 'holidays'), {
        date: holidayForm.date,
        note: holidayForm.note.trim(),
        createdAt: Timestamp.now(),
      })
      setHolidayForm({ date: '', note: '' })
      setHolidayMsg(t.holidayAdded)
    } catch (e) {
      console.error('Add holiday error:', e)
    } finally {
      setHolidayAdding(false)
    }
  }

  const deleteHoliday = async (holidayId: string) => {
    try {
      await deleteDoc(doc(db, 'holidays', holidayId))
    } catch (e) {
      console.error('Delete holiday error:', e)
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!authUser) return
    const q = query(collection(db, 'reports'), orderBy('date', 'desc'), limit(100))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Report[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        setReports(rows)
        setRepLoading(false)
      },
      () => setRepLoading(false),
    )
    return () => unsub()
  }, [authUser])

  // Aktif cihazları dinle (deviceAccess collection)
  useEffect(() => {
    if (!authUser) return
    const q = collection(db, 'deviceAccess')
    const unsub = onSnapshot(
      q,
      (snap) => {
        const deviceIds = new Set<string>()
        snap.docs.forEach((d) => {
          const data = d.data()
          if (data.allowed === true) {
            deviceIds.add(d.id) // Document ID = deviceId
          }
        })
        setActiveDevices(deviceIds)
      },
      (error) => {
        console.error('Error listening to deviceAccess:', error)
      }
    )
    return () => unsub()
  }, [authUser])

  // Canlı konum takibi - son 1 saat içindeki konumları al
  useEffect(() => {
    if (!authUser) return
    
    console.log('📍 Admin: Starting location tracking listener...')
    
    const q = query(
      collection(db, 'locationTracking'),
      orderBy('timestamp', 'desc'),
      limit(1000)
    )
    
    const unsub = onSnapshot(
      q,
      (snap) => {
        console.log('📍 Admin: Location data received, count:', snap.docs.length)
        const locationMap = new Map<string, any>()
        const historyMap = new Map<string, any[]>()
        
        // Her deviceId için en son konumu ve geçmişi al
        snap.docs.forEach((d) => {
          const data = d.data() as any
          const deviceId = data.deviceId
          
          if (deviceId) {
            // En son konumu güncelle
            if (!locationMap.has(deviceId) || 
                (locationMap.get(deviceId).timestamp?.toDate?.() || new Date(0)) < 
                (data.timestamp?.toDate?.() || new Date(0))) {
              locationMap.set(deviceId, {
                ...data,
                id: d.id,
              })
            }
            
            // Geçmişi topla
            if (!historyMap.has(deviceId)) {
              historyMap.set(deviceId, [])
            }
            historyMap.get(deviceId)!.push({
              ...data,
              id: d.id,
            })
          }
        })
        
        console.log('📍 Admin: Location map size:', locationMap.size)
        console.log('📍 Admin: Device IDs:', Array.from(locationMap.keys()))
        setLocationTracking(locationMap)
        setLocationHistory(historyMap)
      },
      (err) => {
        console.error('❌ Admin: Location tracking error:', err)
      }
    )
    
    return () => {
      console.log('📍 Admin: Location tracking listener stopped')
      unsub()
    }
  }, [authUser, db])

  const handleLogin = async () => {
    setAuthError(null)
    setLoginLoading(true)
    try {
      await signInWithEmailAndPassword(auth, loginForm.email.trim(), loginForm.password)
    } catch (e: any) {
      setAuthError(e?.message || t.errorLogin)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = async () => {
    await signOut(auth)
  }

  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  
  // Harita dialog state
  const [mapDialog, setMapDialog] = useState<{
    isOpen: boolean
    latitude: number
    longitude: number
    title: string
    address?: string
    startLocation?: LocationData | null
    endLocation?: LocationData | null
  } | null>(null)

  // Reverse geocoding - koordinatlardan adres al
  const getAddressFromCoordinates = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        headers: {
          'User-Agent': 'Your App Name'
        }
      })
      const data = await response.json()
      if (data.address) {
        // Adresi düzenle - önemli bilgileri birleştir
        const parts: string[] = []
        if (data.address.road) parts.push(data.address.road)
        if (data.address.house_number) parts.push(data.address.house_number)
        if (parts.length === 0 && data.address.suburb) parts.push(data.address.suburb)
        if (parts.length === 0 && data.address.neighbourhood) parts.push(data.address.neighbourhood)
        if (data.address.postcode) parts.push(data.address.postcode)
        if (data.address.city || data.address.town || data.address.village) {
          parts.push(data.address.city || data.address.town || data.address.village)
        }
        return parts.length > 0 ? parts.join(', ') : data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      }
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    } catch (error) {
      console.error('Reverse geocoding error:', error)
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    }
  }

  const openMapDialog = async (lat: number, lng: number, title: string) => {
    const address = await getAddressFromCoordinates(lat, lng)
    setMapDialog({ isOpen: true, latitude: lat, longitude: lng, title, address })
  }

  // Harita dialog'u kapat
  const closeMapDialog = () => {
    setMapDialog(null)
  }

  // Araçlar state'leri
  const [toolsDeviceId, setToolsDeviceId] = useState('')
  const [toolsUserId, setToolsUserId] = useState('')
  const [toolsLoading, setToolsLoading] = useState(false)
  const [toolsMessage, setToolsMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [messageTimeout, setMessageTimeout] = useState<NodeJS.Timeout | null>(null)
  
  // Bildirim göster ve otomatik temizle (hover durumunda iptal edilir)
  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    // Önceki timeout'u temizle
    if (messageTimeout) {
      clearTimeout(messageTimeout)
    }
    setToolsMessage({ type, text })
    // 3 saniye sonra otomatik temizle
    const timeout = setTimeout(() => {
      setToolsMessage(null)
      setMessageTimeout(null)
    }, 3000)
    setMessageTimeout(timeout)
  }
  
  // Geri yükleme için yeni kullanıcı seçimi
  const [restoreUserId, setRestoreUserId] = useState('')
  
  // Rapor istatistikleri için state
  const [statsPeriod, setStatsPeriod] = useState<'week' | 'month' | 'all'>('month')
  
  // Personel rapor silme state'leri
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set())
  const [toolsDeleteMode, setToolsDeleteMode] = useState<'all' | 'selected'>('all')
  
  // Rapor düzenleme state'leri
  const [editingReportId, setEditingReportId] = useState<string | null>(null)
  const [editReportForm, setEditReportForm] = useState({
    startTime: '',
    endTime: '',
    totalHours: 0,
    overtimeHours: 0,
    overtimeStartTime: '',
    overtimeEndTime: '',
    note: '',
  })
  const [updatingReport, setUpdatingReport] = useState(false)
  
  // Canlı konum takibi state'leri
  const [locationTracking, setLocationTracking] = useState<Map<string, any>>(new Map())
  const [locationHistory, setLocationHistory] = useState<Map<string, any[]>>(new Map()) // deviceId -> locations array
  const [selectedPersonnelForTracking, setSelectedPersonnelForTracking] = useState<string | null>(null)
  const trackingDialogMapRef = useRef<{ map: any; marker: any; polyline: any } | null>(null)
  const [trackingMapDialog, setTrackingMapDialog] = useState<{
    isOpen: boolean
    deviceId: string
    personnelName: string
  } | null>(null)
  
  // Harita ref'leri (her personel için) - Leaflet kullanıyoruz
  const mapRefs = useRef<Map<string, { map: any; marker: any; polyline: any; labels?: any[] }>>(new Map())
  
  // Harita açık/kapalı durumları (her mapId için)
  const [mapOpenStates, setMapOpenStates] = useState<Map<string, boolean>>(new Map())

  // Harita oluşturma - sadece bir kez, harita yoksa
  useEffect(() => {
    // Leaflet yüklendi mi kontrol et
    if (typeof (window as any).L === 'undefined') {
      console.warn('⚠️ Leaflet not loaded yet')
      return
    }
    
    const L = (window as any).L
    
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (activeTab?.type !== 'personnel-detail' || !activeTab.userId) return
    
    const user = users.find((u) => u.id === activeTab.userId)
    if (!user || !user.deviceId) return
    
    const mapId = `map-${user.deviceId}`
    
    // Harita zaten var mı kontrol et
    const existingMapData = mapRefs.current.get(mapId)
    if (existingMapData && existingMapData.map) {
      // Harita zaten var, oluşturma yapma
      return
    }
    
    const initializeMap = () => {
      const mapElement = document.getElementById(mapId)
      if (!mapElement) {
        // Element henüz render edilmemiş (CollapsibleMap kapalı olabilir), kısa bir süre bekle
        setTimeout(initializeMap, 500)
        return
      }
      
      // Element görünür mü kontrol et
      if (mapElement.offsetParent === null || mapElement.offsetHeight === 0) {
        // Element görünür değil, bekle
        setTimeout(initializeMap, 500)
        return
      }
      
      // currentLocation'ı fonksiyonun başında tanımla (tüm bloklarda kullanılacak)
      const currentLocation = locationTracking.get(user.deviceId!)
      const center: [number, number] = currentLocation 
        ? [Number(currentLocation.latitude), Number(currentLocation.longitude)]
        : [52.5200, 13.4050] // Berlin default
      
      // Harita zaten oluşturulmuş mu kontrol et (mapId ile)
      let mapData = mapRefs.current.get(mapId)
      
      // DOM element'inin zaten bir Leaflet haritasına sahip olup olmadığını kontrol et
      if ((mapElement as any)._leaflet_id) {
        // Element zaten bir harita tarafından kullanılıyor
        // mapRefs'te mevcut harita var mı kontrol et
        if (mapData && mapData.map) {
          // Mevcut haritayı kullandık, güncelleme yapılacak
          return
        }
        // mapRefs'te yoksa, element'i temizle ve yeniden oluştur
        // Leaflet'in internal state'ini temizlemek için element'i yeniden oluştur
        const parent = mapElement.parentNode
        const nextSibling = mapElement.nextSibling
        const newElement = document.createElement('div')
        newElement.id = mapId
        newElement.className = mapElement.className
        newElement.style.cssText = mapElement.style.cssText
        parent?.removeChild(mapElement)
        parent?.insertBefore(newElement, nextSibling)
        // Yeni element ile devam et
        return initializeMap()
      }
      
      if (!mapData || !mapData.map) {
        
        const map = L.map(mapElement).setView(center, currentLocation ? 17 : 10)
        
        // OpenStreetMap tile layer ekle
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map)
        
        // Marker oluştur - İnsan şeklinde
        const marker = L.marker(center, {
          title: `${user.name || user.email}`,
        }).addTo(map)
        
        // Marker için özel icon (insan emoji)
        const personIcon = L.divIcon({
          className: 'custom-marker-person',
          html: '<div style="font-size: 32px; text-align: center; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🧍</div>',
          iconSize: [32, 32],
          iconAnchor: [16, 32], // Alt kısmından tuttur
        })
        marker.setIcon(personIcon)
        
        // Polyline oluştur
        const polyline = L.polyline([], {
          color: '#3b82f6',
          weight: 3,
          opacity: 1.0,
        }).addTo(map)
        
        mapData = { map, marker, polyline, labels: [] }
        mapRefs.current.set(mapId, mapData)
        
        // Harita boyutlarını güncelle
        setTimeout(() => {
          map.invalidateSize()
        }, 100)
      }
      
      // Harita oluşturuldu, konum güncellemeleri ayrı bir useEffect'te yapılacak
    }
    
    initializeMap()
  }, [activeTabId, tabs, users]) // locationTracking ve locationHistory'yi kaldırdık - sadece harita oluşturma için
  
  // Konum güncellemeleri - harita zaten varsa sadece güncelle
  useEffect(() => {
    // Leaflet yüklendi mi kontrol et
    if (typeof (window as any).L === 'undefined') {
      return
    }
    
    const L = (window as any).L
    
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (activeTab?.type !== 'personnel-detail' || !activeTab.userId) return
    
    const user = users.find((u) => u.id === activeTab.userId)
    if (!user || !user.deviceId) return
    
    const mapId = `map-${user.deviceId}`
    
    // Harita var mı kontrol et
    const mapData = mapRefs.current.get(mapId)
    if (!mapData || !mapData.map) {
      // Harita yok, güncelleme yapma
      return
    }
    
    // Konumları güncelle - Canlı GPS takibi
    const history = locationHistory.get(user.deviceId!) || []
    const currentLocation = locationTracking.get(user.deviceId!)
    
    if (currentLocation && mapData.map && mapData.marker) {
        const position: [number, number] = [Number(currentLocation.latitude), Number(currentLocation.longitude)]
        
        // Marker'ı yumuşak bir şekilde güncelle (canlı hareket - GPS gibi)
        const currentMarkerPos = mapData.marker.getLatLng()
        if (currentMarkerPos) {
          // Her zaman güncelle (canlı takip için)
          const distance = mapData.map.distance(currentMarkerPos, position)
          if (distance > 1) { // 1 metreden fazla hareket varsa güncelle
            // Yumuşak animasyon ile marker'ı hareket ettir
            mapData.marker.setLatLng(position, { animate: true, duration: 0.5 })
            // Haritayı da yumuşak bir şekilde takip ettir
            if (mapData.map.getZoom() >= 15) {
              mapData.map.panTo(position, { animate: true, duration: 0.5 })
            }
          }
        } else {
          mapData.marker.setLatLng(position)
        }
        
        // Eski label'ları temizle
        if (!mapData.labels) {
          mapData.labels = []
        } else {
          mapData.labels.forEach((label: any) => {
            if (label && mapData.map) {
              mapData.map.removeLayer(label)
            }
          })
          mapData.labels = []
        }
        
        // Tüm konumları birleştir
        const allLocations = [...history]
        if (currentLocation) {
          allLocations.push(currentLocation)
        }
        
        // Her konum için süre hesapla ve label ekle
        allLocations.forEach((loc, index) => {
          if (index < allLocations.length - 1) {
            const nextLoc = allLocations[index + 1]
            const duration = calculateLocationDuration(loc, nextLoc)
            
            if (duration !== null && duration > 0) {
              const locPosition: [number, number] = [Number(loc.latitude), Number(loc.longitude)]
              const durationText = formatDuration(duration, lang)
              
              // Label marker oluştur - Marker'ın hemen altında
              const labelText = durationText
              const labelWidth = labelText.length * 7 + 16 // Yaklaşık genişlik
              
              const labelIcon = L.divIcon({
                className: 'location-duration-label',
                html: `<div style="
                  background: rgba(59, 130, 246, 0.95);
                  color: white;
                  padding: 4px 8px;
                  border-radius: 12px;
                  font-size: 11px;
                  font-weight: 600;
                  white-space: nowrap;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
                  border: 2px solid white;
                  text-align: center;
                  min-width: ${labelWidth}px;
                ">${labelText}</div>`,
                iconSize: [labelWidth, 24],
                iconAnchor: [labelWidth / 2, 0], // Üstten ortalanmış
              })
              
              const labelMarker = L.marker(locPosition, {
                icon: labelIcon,
                zIndexOffset: 1000,
              }).addTo(mapData.map)
              
              // Label'ı marker'ın hemen altına yerleştir (latitude offset)
              const zoom = mapData.map.getZoom()
              const latOffset = zoom > 15 ? 0.00008 : (zoom > 12 ? 0.00015 : 0.0003) // Zoom seviyesine göre offset
              labelMarker.setLatLng([
                locPosition[0] - latOffset, // Marker'ın altına
                locPosition[1]
              ])
              
              if (!mapData.labels) {
                mapData.labels = []
              }
              mapData.labels.push(labelMarker)
            }
          }
        })
        
        // Polyline'ı güncelle (tüm konum geçmişi - canlı rota)
        const path: [number, number][] = allLocations
          .map((loc) => [Number(loc.latitude), Number(loc.longitude)])
        
        if (path.length > 0) {
          mapData.polyline?.setLatLngs(path)
          
          // Haritayı tüm konumları gösterecek şekilde ayarla (otomatik zoom)
          if (path.length > 1) {
            const bounds = L.latLngBounds(path)
            // Eğer harita çok zoom in yapılmışsa, bounds'a göre ayarla
            if (mapData.map.getZoom() < 15) {
              mapData.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 })
            } else {
              // Zoom yeterliyse sadece pan yap
              if (!bounds.contains(mapData.map.getCenter())) {
                mapData.map.panTo(position, { animate: true, duration: 0.5 })
              }
            }
          } else {
            mapData.map.setView(position, 17)
          }
        } else {
          mapData.map.setView(position, 17)
        }
      } else if (mapData.map) {
        // Konum yoksa haritayı varsayılan merkeze ayarla
        mapData.map.setView([52.5200, 13.4050], 10)
      }
  }, [activeTabId, tabs, users, locationTracking, locationHistory, lang]) // Konum güncellemeleri için

  // Tracking Dialog haritası için useEffect
  useEffect(() => {
    if (!trackingMapDialog?.isOpen) {
      if (trackingDialogMapRef.current) {
        if (trackingDialogMapRef.current.map) {
          trackingDialogMapRef.current.map.remove()
        }
        trackingDialogMapRef.current = null
      }
      return
    }

    if (typeof (window as any).L === 'undefined') {
      return
    }

    const L = (window as any).L
    const location = locationTracking.get(trackingMapDialog.deviceId)
    const history = locationHistory.get(trackingMapDialog.deviceId) || []

    const initializeDialogMap = () => {
      const mapElement = document.getElementById('tracking-dialog-map')
      if (!mapElement) {
        setTimeout(initializeDialogMap, 100)
        return
      }

      if (!trackingDialogMapRef.current || !trackingDialogMapRef.current.map) {
        const center: [number, number] = location
          ? [Number(location.latitude), Number(location.longitude)]
          : [52.5200, 13.4050]

        const map = L.map(mapElement).setView(center, location ? 17 : 10)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map)

        const marker = L.marker(center, {
          title: trackingMapDialog.personnelName,
        }).addTo(map)

        const personIcon = L.divIcon({
          className: 'custom-marker-person',
          html: '<div style="font-size: 32px; text-align: center; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🧍</div>',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        })
        marker.setIcon(personIcon)

        const polyline = L.polyline([], {
          color: '#3b82f6',
          weight: 3,
          opacity: 1.0,
        }).addTo(map)

        trackingDialogMapRef.current = { map, marker, polyline }

        setTimeout(() => {
          map.invalidateSize()
        }, 100)
      }

      if (location && trackingDialogMapRef.current) {
        const position: [number, number] = [Number(location.latitude), Number(location.longitude)]

        const currentMarkerPos = trackingDialogMapRef.current.marker.getLatLng()
        if (currentMarkerPos) {
          const distance = trackingDialogMapRef.current.map.distance(currentMarkerPos, position)
          if (distance > 1) {
            trackingDialogMapRef.current.marker.setLatLng(position, { animate: true, duration: 0.5 })
            if (trackingDialogMapRef.current.map.getZoom() >= 15) {
              trackingDialogMapRef.current.map.panTo(position, { animate: true, duration: 0.5 })
            }
          }
        } else {
          trackingDialogMapRef.current.marker.setLatLng(position)
        }

        const path: [number, number][] = history
          .map((loc) => [Number(loc.latitude), Number(loc.longitude)])

        if (path.length === 0 || path[path.length - 1][0] !== position[0] || path[path.length - 1][1] !== position[1]) {
          path.push(position)
        }

        if (path.length > 0) {
          trackingDialogMapRef.current.polyline?.setLatLngs(path)

          if (path.length > 1) {
            const bounds = L.latLngBounds(path)
            if (trackingDialogMapRef.current.map.getZoom() < 15) {
              trackingDialogMapRef.current.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 })
            } else {
              if (!bounds.contains(trackingDialogMapRef.current.map.getCenter())) {
                trackingDialogMapRef.current.map.panTo(position, { animate: true, duration: 0.5 })
              }
            }
          } else {
            trackingDialogMapRef.current.map.setView(position, 17)
          }
        } else {
          trackingDialogMapRef.current.map.setView(position, 17)
        }
      }
    }

    initializeDialogMap()
  }, [trackingMapDialog, locationTracking, locationHistory])

  // Günlük haritalar ve playback kaldırıldı - sadece başlangıç ve bitiş konumları gösteriliyor

  // Tüm raporları getir (filtreleme kaldırıldı)
  const getFilteredReports = () => {
    return reports
  }

  // Rapor istatistiklerini hesapla
  const getReportStats = () => {
    const now = new Date()
    let filteredReports = reports

    // Dönem filtresi
    if (statsPeriod === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      filteredReports = reports.filter((r) => {
        const reportDate = new Date(`${r.date}T00:00:00`)
        return reportDate >= weekAgo
      })
    } else if (statsPeriod === 'month') {
      const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1)
      filteredReports = reports.filter((r) => {
        const reportDate = new Date(`${r.date}T00:00:00`)
        return reportDate >= monthAgo
      })
    }

    const totalHours = filteredReports.reduce((sum, r) => sum + (r.totalHours || 0), 0)
    const totalOvertime = filteredReports.reduce((sum, r) => sum + (r.overtimeHours || 0), 0)
    const workReports = filteredReports.filter((r) => r.status === 'arbeit').length
    const leaveReports = filteredReports.filter((r) => r.status === 'urlaub').length
    const offReports = filteredReports.filter((r) => r.status === 'frei').length

    // En çok çalışan personel
    const userHours = new Map<string, { hours: number; overtime: number; name: string }>()
    filteredReports.forEach((r) => {
      const user = users.find((u) => u.deviceId === r.deviceId)
      const userId = user?.id || r.deviceId || 'unknown'
      const userName = user?.name || user?.email || r.deviceId || 'Unknown'
      const current = userHours.get(userId) || { hours: 0, overtime: 0, name: userName }
      userHours.set(userId, {
        hours: current.hours + (r.totalHours || 0),
        overtime: current.overtime + (r.overtimeHours || 0),
        name: userName,
      })
    })
    const topWorker = Array.from(userHours.entries())
      .sort((a, b) => (b[1].hours + b[1].overtime) - (a[1].hours + a[1].overtime))[0]

    return {
      totalReports: filteredReports.length,
      totalHours,
      totalOvertime,
      totalCombined: totalHours + totalOvertime,
      workReports,
      leaveReports,
      offReports,
      topWorker: topWorker ? { name: topWorker[1].name, hours: topWorker[1].hours, overtime: topWorker[1].overtime } : null,
    }
  }

  // Cihaza göre raporları sil
  const deleteReportsByDevice = async () => {
    if (!toolsUserId) return
    
    // Seçilen kullanıcının deviceId'sini bul
    const selectedUser = users.find((u) => u.id === toolsUserId)
    if (!selectedUser || !selectedUser.deviceId) {
      setToolsMessage({ type: 'error', text: lang === 'de' ? 'Benutzer hat keine Geräte-ID' : 'المستخدم ليس لديه معرف جهاز' })
      return
    }
    
    setToolsLoading(true)
    setToolsMessage(null)
    try {
      const q = query(collection(db, 'reports'), where('deviceId', '==', selectedUser.deviceId))
      const snap = await getDocs(q)
      
      if (snap.docs.length === 0) {
        setToolsMessage({ type: 'error', text: lang === 'de' ? 'Keine Berichte für dieses Gerät gefunden' : 'لم يتم العثور على تقارير لهذا الجهاز' })
        setToolsUserId('')
        return
      }
      
      const batch: Promise<void>[] = []
      snap.docs.forEach((d) => {
        batch.push(deleteDoc(doc(db, 'reports', d.id)))
      })
      await Promise.all(batch)
      setToolsMessage({ type: 'success', text: `${snap.docs.length} ${t.reportsDeleted}` })
      setToolsUserId('')
    } catch (e) {
      console.error('Delete reports error:', e)
      setToolsMessage({ type: 'error', text: t.deleteError })
    } finally {
      setToolsLoading(false)
    }
  }

  // Kullanıcı hesabını sil (cihaz kaydı ve tüm raporlar dahil)
  const deleteUserAccount = async () => {
    if (!selectedUserId) return
    
    if (!window.confirm(t.deleteUserConfirm)) return
    
    const selectedUser = users.find((u) => u.id === selectedUserId)
    if (!selectedUser) return
    
    setToolsLoading(true)
    setToolsMessage(null)
    try {
      const batch: Promise<void>[] = []
      
      // Kullanıcının tüm raporlarını sil
      if (selectedUser.deviceId) {
        const reportsQuery = query(collection(db, 'reports'), where('deviceId', '==', selectedUser.deviceId))
        const reportsSnap = await getDocs(reportsQuery)
        reportsSnap.docs.forEach((d) => {
          batch.push(deleteDoc(doc(db, 'reports', d.id)))
        })
      }
      
      // Device request'leri sil (email ve deviceId'ye göre)
      const deviceRequestIdsToDelete = new Set<string>()
      
      // Email'e göre sil
      if (selectedUser.email) {
        const deviceRequestQueryByEmail = query(collection(db, 'deviceRequests'), where('email', '==', selectedUser.email.toLowerCase()))
        const deviceRequestSnapByEmail = await getDocs(deviceRequestQueryByEmail)
        deviceRequestSnapByEmail.docs.forEach((d) => {
          deviceRequestIdsToDelete.add(d.id)
        })
      }
      
      // DeviceId'ye göre sil (eğer deviceId varsa)
      if (selectedUser.deviceId) {
        const deviceRequestQueryByDeviceId = query(collection(db, 'deviceRequests'), where('deviceId', '==', selectedUser.deviceId))
        const deviceRequestSnapByDeviceId = await getDocs(deviceRequestQueryByDeviceId)
        deviceRequestSnapByDeviceId.docs.forEach((d) => {
          deviceRequestIdsToDelete.add(d.id)
        })
      }
      
      // Tüm device request'leri sil
      deviceRequestIdsToDelete.forEach((id) => {
        batch.push(deleteDoc(doc(db, 'deviceRequests', id)))
      })
      
      // DeviceAccess kaydını sil (eğer deviceId varsa)
      if (selectedUser.deviceId) {
        const deviceAccessDocRef = doc(db, 'deviceAccess', selectedUser.deviceId)
        const deviceAccessSnap = await getDoc(deviceAccessDocRef)
        if (deviceAccessSnap.exists()) {
          batch.push(deleteDoc(deviceAccessDocRef))
        }
      }
      
      // Kullanıcı hesabını sil
      batch.push(deleteDoc(doc(db, 'users', selectedUserId)))
      
      await Promise.all(batch)
      setToolsMessage({ type: 'success', text: t.userDeleted })
      setSelectedUserId('')
      setSelectedReportIds(new Set())
    } catch (e) {
      console.error('Delete user account error:', e)
      setToolsMessage({ type: 'error', text: t.deleteError })
    } finally {
      setToolsLoading(false)
    }
  }

  // Kullanıcı verilerini yedekle (sadece raporlar ve izinler, profil bilgileri değil)
  const backupUserData = async () => {
    if (!selectedUserId) return
    
    const selectedUser = users.find((u) => u.id === selectedUserId)
    if (!selectedUser || !selectedUser.deviceId) return
    
    setToolsLoading(true)
    setToolsMessage(null)
    try {
      const backupData: any = {
        deviceId: selectedUser.deviceId, // Sadece deviceId referans için
        reports: [],
        leaveRequests: [],
        backupDate: new Date().toISOString(),
      }
      
      // Kullanıcının tüm raporlarını al (başlama ve bitirme saatleri dahil)
      const reportsQuery = query(collection(db, 'reports'), where('deviceId', '==', selectedUser.deviceId))
      const reportsSnap = await getDocs(reportsQuery)
      backupData.reports = reportsSnap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          // Başlama ve bitirme saatlerini açıkça dahil et
          startTime: data.startTime || null,
          endTime: data.endTime || null,
          overtimeStartTime: data.overtimeStartTime || null,
          overtimeEndTime: data.overtimeEndTime || null,
          // Timestamp'leri ISO string'e çevir
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          startSubmittedAt: data.startSubmittedAt?.toDate ? data.startSubmittedAt.toDate().toISOString() : data.startSubmittedAt,
          endSubmittedAt: data.endSubmittedAt?.toDate ? data.endSubmittedAt.toDate().toISOString() : data.endSubmittedAt,
        }
      })
      
      // Kullanıcının tüm izin taleplerini al
      const leaveRequestsQuery = query(collection(db, 'leaveRequests'), where('deviceId', '==', selectedUser.deviceId))
      const leaveRequestsSnap = await getDocs(leaveRequestsQuery)
      backupData.leaveRequests = leaveRequestsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      
      // JSON dosyası olarak indir
      const jsonStr = JSON.stringify(backupData, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup_${selectedUser.email || selectedUser.id}_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      
      setToolsMessage({ type: 'success', text: t.backupDownloaded })
    } catch (e) {
      console.error('Backup user data error:', e)
      setToolsMessage({ type: 'error', text: t.deleteError })
    } finally {
      setToolsLoading(false)
    }
  }

  // Yedekten geri yükle (seçilen kullanıcının deviceId'sine göre)
  const restoreUserData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    if (!restoreUserId) {
      setToolsMessage({ type: 'error', text: lang === 'de' ? 'Bitte wählen Sie zuerst einen Benutzer aus' : 'يرجى اختيار مستخدم أولاً' })
      event.target.value = ''
      return
    }
    
    const targetUser = users.find((u) => u.id === restoreUserId)
    if (!targetUser || !targetUser.deviceId) {
      setToolsMessage({ type: 'error', text: lang === 'de' ? 'Der ausgewählte Benutzer hat keine Geräte-ID' : 'المستخدم المحدد ليس لديه معرف جهاز' })
      event.target.value = ''
      return
    }
    
    setToolsLoading(true)
    setToolsMessage(null)
    try {
      const text = await file.text()
      const backupData = JSON.parse(text)
      
      if (!backupData.reports) {
        setToolsMessage({ type: 'error', text: lang === 'de' ? 'Ungültige Backup-Datei' : 'ملف النسخة الاحتياطية غير صالح' })
        event.target.value = ''
        return
      }
      
      // Raporları yeni deviceId ile geri yükle (başlama ve bitirme saatleri dahil)
      for (const report of backupData.reports || []) {
        const { id, createdAt, startSubmittedAt, endSubmittedAt, ...reportData } = report
        
        // Timestamp'leri geri yükle
        const restoreData: any = {
          ...reportData,
          deviceId: targetUser.deviceId, // Yeni kullanıcının deviceId'si ile güncelle
          // Başlama ve bitirme saatlerini açıkça koru
          startTime: reportData.startTime || null,
          endTime: reportData.endTime || null,
          overtimeStartTime: reportData.overtimeStartTime || null,
          overtimeEndTime: reportData.overtimeEndTime || null,
        }
        
        // Timestamp'leri geri yükle (eğer string ise Timestamp'e çevir)
        if (createdAt) {
          restoreData.createdAt = typeof createdAt === 'string' ? Timestamp.fromDate(new Date(createdAt)) : createdAt
        }
        if (startSubmittedAt) {
          restoreData.startSubmittedAt = typeof startSubmittedAt === 'string' ? Timestamp.fromDate(new Date(startSubmittedAt)) : startSubmittedAt
        }
        if (endSubmittedAt) {
          restoreData.endSubmittedAt = typeof endSubmittedAt === 'string' ? Timestamp.fromDate(new Date(endSubmittedAt)) : endSubmittedAt
        }
        
        await setDoc(doc(db, 'reports', id), restoreData)
      }
      
      // İzin taleplerini yeni deviceId ile geri yükle
      for (const leaveRequest of backupData.leaveRequests || []) {
        const { id, ...leaveData } = leaveRequest
        await setDoc(doc(db, 'leaveRequests', id), {
          ...leaveData,
          deviceId: targetUser.deviceId, // Yeni kullanıcının deviceId'si ile güncelle
          userName: targetUser.name || targetUser.email || '',
          userEmail: targetUser.email || '',
        })
      }
      
      setRestoreUserId('')
      
      setToolsMessage({ type: 'success', text: t.restoreSuccess })
      
      // Input'u temizle
      event.target.value = ''
    } catch (e) {
      console.error('Restore user data error:', e)
      setToolsMessage({ type: 'error', text: lang === 'de' ? 'Fehler beim Wiederherstellen' : 'خطأ في الاستعادة' })
      event.target.value = ''
    } finally {
      setToolsLoading(false)
    }
  }

  // Bekleyen istekleri sil
  const deletePendingRequests = async () => {
    setToolsLoading(true)
    setToolsMessage(null)
    try {
      const q = query(collection(db, 'deviceRequests'), where('status', '==', 'pending'))
      const snap = await getDocs(q)
      const batch: Promise<void>[] = []
      snap.docs.forEach((d) => {
        batch.push(deleteDoc(doc(db, 'deviceRequests', d.id)))
      })
      await Promise.all(batch)
      setToolsMessage({ type: 'success', text: `${snap.docs.length} ${t.requestsDeleted}` })
    } catch (e) {
      console.error('Delete requests error:', e)
      setToolsMessage({ type: 'error', text: t.deleteError })
    } finally {
      setToolsLoading(false)
    }
  }

  // Verileri CSV olarak export et - filtrelenmiş raporları export et
  const exportReportsCSV = () => {
    const filteredReports = getFilteredReports()
    if (filteredReports.length === 0) {
      setToolsMessage({ type: 'error', text: lang === 'de' ? 'Keine Berichte zum Exportieren' : 'لا توجد تقارير للتصدير' })
      return
    }
    
    const headers = ['Date', 'Name', 'Email', 'DeviceID', 'Status', 'StartTime', 'EndTime', 'TotalHours', 'OvertimeHours', 'Note']
    const rows = filteredReports.map((r) => {
      const user = users.find((u) => u.deviceId === r.deviceId)
      return [
        formatDate(r.date),
        user?.name || '',
        user?.email || '',
        r.deviceId || '',
        r.status || 'arbeit',
        r.startTime || '',
        r.endTime || '',
        r.totalHours?.toString() || '0',
        r.overtimeHours?.toString() || '0',
        r.note || '',
      ]
    })
    const csv = [headers.join(','), ...rows.map((r) => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reports_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setToolsMessage({ type: 'success', text: `${filteredReports.length} ${lang === 'de' ? 'Berichte exportiert' : 'تقرير تم تصديره'}` })
  }

  // Personel seçildiğinde raporları getir
  const getSelectedUserReports = () => {
    if (!selectedUserId) return []
    const user = users.find((u) => u.id === selectedUserId)
    if (!user || !user.deviceId) return []
    return reports.filter((r) => r.deviceId === user.deviceId)
  }

  // Personelin tüm raporlarını sil
  const deleteAllUserReports = async () => {
    if (!selectedUserId) return
    const userReports = getSelectedUserReports()
    if (userReports.length === 0) {
      setToolsMessage({ type: 'error', text: t.noDataToDelete })
      return
    }
    
    setToolsLoading(true)
    setToolsMessage(null)
    try {
      const batch: Promise<void>[] = []
      userReports.forEach((r) => {
        batch.push(deleteDoc(doc(db, 'reports', r.id)))
      })
      await Promise.all(batch)
      setToolsMessage({ type: 'success', text: `${userReports.length} ${t.reportsDeleted}` })
      setSelectedUserId('')
      setSelectedReportIds(new Set())
    } catch (e) {
      console.error('Delete user reports error:', e)
      setToolsMessage({ type: 'error', text: t.deleteError })
    } finally {
      setToolsLoading(false)
    }
  }

  // Seçilen raporları sil
  const deleteSelectedReports = async () => {
    if (selectedReportIds.size === 0) {
      setToolsMessage({ type: 'error', text: t.noDataToDelete })
      return
    }
    
    setToolsLoading(true)
    setToolsMessage(null)
    try {
      const batch: Promise<void>[] = []
      selectedReportIds.forEach((reportId) => {
        batch.push(deleteDoc(doc(db, 'reports', reportId)))
      })
      await Promise.all(batch)
      setToolsMessage({ type: 'success', text: `${selectedReportIds.size} ${t.reportsDeleted}` })
      setSelectedReportIds(new Set())
    } catch (e) {
      console.error('Delete selected reports error:', e)
      setToolsMessage({ type: 'error', text: t.deleteError })
    } finally {
      setToolsLoading(false)
    }
  }

  // Rapor seçimi toggle
  const toggleReportSelection = (reportId: string) => {
    setSelectedReportIds((prev) => {
      const next = new Set(prev)
      if (next.has(reportId)) {
        next.delete(reportId)
      } else {
        next.add(reportId)
      }
      return next
    })
  }

  // Tüm raporları seç/seçimi kaldır
  const toggleAllReports = () => {
    const userReports = getSelectedUserReports()
    if (selectedReportIds.size === userReports.length) {
      setSelectedReportIds(new Set())
    } else {
      setSelectedReportIds(new Set(userReports.map((r) => r.id)))
    }
  }

  // Rapor düzenlemeyi başlat
  const startEditingReport = (report: Report) => {
    setEditingReportId(report.id)
    setEditReportForm({
      startTime: report.startTime || '',
      endTime: report.endTime || '',
      totalHours: report.totalHours || 0,
      overtimeHours: report.overtimeHours || 0,
      overtimeStartTime: report.overtimeStartTime || '',
      overtimeEndTime: report.overtimeEndTime || '',
      note: report.note || '',
    })
  }

  // Rapor düzenlemeyi iptal et
  const cancelEditingReport = () => {
    setEditingReportId(null)
    setEditReportForm({
      startTime: '',
      endTime: '',
      totalHours: 0,
      overtimeHours: 0,
      overtimeStartTime: '',
      overtimeEndTime: '',
      note: '',
    })
  }

  // Saat hesaplama fonksiyonu
  const calculateHours = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 0
    
    try {
      const [startH, startM] = startTime.split(':').map(Number)
      const [endH, endM] = endTime.split(':').map(Number)
      const startMinutes = startH * 60 + startM
      const endMinutes = endH * 60 + endM
      let totalMinutes = endMinutes - startMinutes
      if (totalMinutes < 0) totalMinutes += 24 * 60 // Gece yarısını geçtiyse
      return Math.round((totalMinutes / 60) * 100) / 100
    } catch (e) {
      return 0
    }
  }

  // Başlama ve bitiş saatlerine göre toplam saatleri otomatik hesapla
  useEffect(() => {
    if (editReportForm.startTime && editReportForm.endTime) {
      const calculatedHours = calculateHours(editReportForm.startTime, editReportForm.endTime)
      setEditReportForm((prev) => {
        // Eğer mesai saatleri manuel girilmişse, normal saatleri 8 ile sınırla
        const hasManualOvertime = prev.overtimeStartTime && prev.overtimeEndTime
        const normalHours = calculatedHours > 8 && !hasManualOvertime ? 8 : calculatedHours
        const autoOvertime = calculatedHours > 8 && !hasManualOvertime ? calculatedHours - 8 : prev.overtimeHours
        
        // Sadece değişiklik varsa güncelle (sonsuz döngüyü önlemek için)
        if (Math.abs(normalHours - prev.totalHours) > 0.01 || (!hasManualOvertime && Math.abs(autoOvertime - prev.overtimeHours) > 0.01)) {
          return {
            ...prev,
            totalHours: normalHours,
            overtimeHours: autoOvertime,
          }
        }
        return prev
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editReportForm.startTime, editReportForm.endTime])

  // Mesai saatlerine göre mesai saatlerini otomatik hesapla
  useEffect(() => {
    if (editReportForm.overtimeStartTime && editReportForm.overtimeEndTime) {
      const calculatedOvertime = calculateHours(editReportForm.overtimeStartTime, editReportForm.overtimeEndTime)
      setEditReportForm((prev) => {
        // Sadece değişiklik varsa güncelle (sonsuz döngüyü önlemek için)
        if (Math.abs(calculatedOvertime - prev.overtimeHours) > 0.01) {
          return {
            ...prev,
            overtimeHours: calculatedOvertime,
          }
        }
        return prev
      })
    } else if (!editReportForm.overtimeStartTime && !editReportForm.overtimeEndTime) {
      // Mesai saatleri temizlendiyse, eğer normal saatler 8'den fazlaysa mesaiyi otomatik hesapla
      if (editReportForm.startTime && editReportForm.endTime) {
        const calculatedHours = calculateHours(editReportForm.startTime, editReportForm.endTime)
        setEditReportForm((prev) => {
          const autoOvertime = calculatedHours > 8 ? calculatedHours - 8 : 0
          if (Math.abs(autoOvertime - prev.overtimeHours) > 0.01) {
            return {
              ...prev,
              overtimeHours: autoOvertime,
            }
          }
          return prev
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editReportForm.overtimeStartTime, editReportForm.overtimeEndTime, editReportForm.startTime, editReportForm.endTime])

  // Raporu güncelle
  const updateReport = async () => {
    if (!editingReportId) return
    
    setUpdatingReport(true)
    setToolsMessage(null)
    try {
      const updateData: any = {
        startTime: editReportForm.startTime || null,
        endTime: editReportForm.endTime || null,
        totalHours: editReportForm.totalHours || 0,
        overtimeHours: editReportForm.overtimeHours || 0,
        note: editReportForm.note || null,
      }
      
      // Mesai saatleri varsa ekle
      if (editReportForm.overtimeStartTime && editReportForm.overtimeEndTime) {
        updateData.overtimeStartTime = editReportForm.overtimeStartTime
        updateData.overtimeEndTime = editReportForm.overtimeEndTime
        updateData.hasOvertime = true
        updateData.isOvertimeOpen = false
      } else {
        updateData.overtimeStartTime = null
        updateData.overtimeEndTime = null
        updateData.hasOvertime = false
      }
      
      // Eğer endTime varsa isOpen false yap
      if (editReportForm.endTime) {
        updateData.isOpen = false
      }
      
      await updateDoc(doc(db, 'reports', editingReportId), updateData)
      setToolsMessage({ type: 'success', text: t.reportUpdated })
      setEditingReportId(null)
      setEditReportForm({
        startTime: '',
        endTime: '',
        totalHours: 0,
        overtimeHours: 0,
        overtimeStartTime: '',
        overtimeEndTime: '',
        note: '',
      })
    } catch (e) {
      console.error('Update report error:', e)
      setToolsMessage({ type: 'error', text: t.deleteError })
    } finally {
      setUpdatingReport(false)
    }
  }

  const handleSend = async () => {
    setSending(true)
    setError(null)
    setInfo(null)
    setGeneratedLink(null)
    setLinkCopied(false)
    try {
      const emailLower = form.email.trim().toLowerCase()
      
      // 1. Aynı email ile aktif (pending veya accepted) bir davet var mı kontrol et
      const existingInvites = await getDocs(
        query(
          collection(db, 'invites'),
          where('email', '==', emailLower)
        )
      )
      
      const hasActiveInvite = existingInvites.docs.some(
        (d) => {
          const data = d.data()
          return data.status === 'pending' || data.status === 'accepted'
        }
      )
      
      if (hasActiveInvite) {
        setError(t.emailAlreadyHasInvite)
        setSending(false)
        return
      }
      
      // 2. Aynı email ile approved bir deviceRequest var mı kontrol et
      const existingDeviceRequests = await getDocs(
        query(
          collection(db, 'deviceRequests'),
          where('email', '==', emailLower)
        )
      )
      
      const hasApprovedRequest = existingDeviceRequests.docs.some(
        (d) => {
          const data = d.data()
          return data.status === 'approved'
        }
      )
      
      if (hasApprovedRequest) {
        setError(t.emailAlreadyExists)
        setSending(false)
        return
      }
      
      // 3. Eğer silinmiş (rejected veya revoked) kayıtlar varsa, yeni davet oluşturulabilir
      // Bu durumda devam edebiliriz
      
      const link = `https://your-app.web.app/invite?email=${encodeURIComponent(form.email)}`
      const docRef = doc(collection(db, 'invites'))
      await setDoc(docRef, {
        email: emailLower,
        role: form.role,
        status: 'pending',
        createdAt: Timestamp.now(),
        link,
      })
      setGeneratedLink(link)
      setInfo(t.inviteSaved)
    } catch (e: any) {
      setError(e?.message || 'Oluşturulamadı')
    } finally {
      setSending(false)
    }
  }

  const copyLink = async () => {
    if (!generatedLink) return
    try {
      await navigator.clipboard.writeText(generatedLink)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 3000)
    } catch (e) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = generatedLink
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 3000)
    }
  }

  const resetInviteForm = () => {
    setForm({ email: '', role: 'personal' })
    setGeneratedLink(null)
    setLinkCopied(false)
    setInfo(null)
    setError(null)
  }

  const markAccepted = async (id: string, deviceId?: string) => {
    await updateDoc(doc(db, 'invites', id), { status: 'accepted', deviceId })
  }

  const createDeviceAccess = async (deviceId: string, email: string) => {
    await setDoc(doc(db, 'deviceAccess', deviceId), { allowed: true, email })
  }

  const quickAccept = async (item: Invite) => {
    const fakeDevice = `dev-${Math.floor(Math.random() * 1e6)}`
    await markAccepted(item.id, fakeDevice)
    await createDeviceAccess(fakeDevice, item.email)
  }

  const approveRequest = async (req: DeviceRequest) => {
    setError(null)
    setInfo(null)
    try {
      const emailLower = req.email.trim().toLowerCase()
      
      // Aynı email ile zaten approved bir deviceRequest var mı kontrol et
      const existingApproved = await getDocs(
        query(
          collection(db, 'deviceRequests'),
          where('email', '==', emailLower),
          where('status', '==', 'approved')
        )
      )
      
      // Mevcut request hariç, başka bir approved request var mı?
      const hasOtherApproved = existingApproved.docs.some((d) => d.id !== req.id)
      
      if (hasOtherApproved) {
        setError(t.emailAlreadyExists)
        return
      }
      
      await createDeviceAccess(req.deviceId, emailLower)
      await updateDoc(doc(db, 'deviceRequests', req.id), { status: 'approved', approvedAt: Timestamp.now() })
      const inviteSnap = await getDocs(query(collection(db, 'invites'), where('email', '==', emailLower), limit(1)))
      if (!inviteSnap.empty) {
        await updateDoc(inviteSnap.docs[0].ref, { status: 'accepted', deviceId: req.deviceId })
      }
      setInfo('Onaylandı')
    } catch (e: any) {
      setError(e?.message || 'Onaylanamadı')
    }
  }

  if (authLoading) {
    return (
      <div className="shell">
        <div className="card">{t.loadingAuth}</div>
      </div>
    )
  }

  const hasWhitelistAccess =
    (authUser?.email && adminWhitelistEmails.includes(authUser.email)) ||
    (authUser?.uid && adminWhitelistUids.includes(authUser.uid))

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase().trim()
    if (!q) return true
    return (
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.surname && u.surname.toLowerCase().includes(q))
    )
  })

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const getDetailUser = (userId?: string) => (userId ? users.find((u) => u.id === userId) : null)
  const getDetailReports = (userId?: string) => {
    const user = getDetailUser(userId)
    return user?.deviceId ? reports.filter((r) => r.deviceId === user.deviceId) : []
  }

  if (!authUser || (userRole !== 'admin' && !hasWhitelistAccess)) {
    return (
      <div className="shell auth-shell">
        <div className="card auth-card">
          <div className="title">{t.loginTitle}</div>
          <div className={`lang-switch ${langAnimating ? 'is-animating' : ''}`}>
            <button className={`lang-btn ${lang === 'de' ? 'is-active' : ''}`} onClick={() => switchLang('de')}>
              <img src="/flag-de.svg" alt="DE" className="lang-flag-img" />
              <span className="lang-code">DE</span>
            </button>
            <button className={`lang-btn ${lang === 'ar' ? 'is-active' : ''}`} onClick={() => switchLang('ar')}>
              <img src="/flag-ar.jpg" alt="AR" className="lang-flag-img" />
              <span className="lang-code">AR</span>
            </button>
          </div>
          <div className="form-col">
            <label className="field">
              <span>{t.email}</span>
              <input
                value={loginForm.email}
                onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
                autoComplete="email"
              />
            </label>
            <label className="field">
              <span>{t.password}</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                autoComplete="current-password"
              />
            </label>
            {authError && <div className="error">{authError}</div>}
            {authUser && userRole !== 'admin' && !hasWhitelistAccess ? (
              <div className="error">
                {t.unauthorized}
                <br />
                {t.needRole}
                <br />
                UID: {authUser.uid}
              </div>
            ) : null}
            <button className="btn" onClick={handleLogin} disabled={!loginForm.email || !loginForm.password || loginLoading}>
              {loginLoading ? '...' : t.login}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Dil değiştirme komponenti
  const LanguageSwitcher = () => (
    <div className={`lang-switch ${langAnimating ? 'is-animating' : ''}`}>
      <button className={`lang-btn ${lang === 'de' ? 'is-active' : ''}`} onClick={() => switchLang('de')}>
        <img src="/flag-de.svg" alt="DE" className="lang-flag-img" />
        <span className="lang-code">DE</span>
      </button>
      <button className={`lang-btn ${lang === 'ar' ? 'is-active' : ''}`} onClick={() => switchLang('ar')}>
        <img src="/flag-ar.jpg" alt="AR" className="lang-flag-img" />
        <span className="lang-code">AR</span>
      </button>
    </div>
  )

  // Sayfa başlığı komponenti (dil değiştirme ile)
  const PageHeader = ({ title }: { title: string }) => (
    <div className="dashboard-header">
      <h2 className="dashboard-title">{title}</h2>
      <LanguageSwitcher />
    </div>
  )

  const renderDashboard = () => {
    // İstatistikler
    const totalPersonnel = users.length
    const pendingReqs = requests.filter((r) => r.status === 'pending').length
    // Aktif cihaz sayısı = deviceAccess collection'ındaki kayıt sayısı
    const acceptedInvites = activeDevices.size
    const pendingInvites = invites.filter((i) => i.status === 'pending').length
    
    // Bu ay için toplam saat
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const monthlyReports = reports.filter((r) => r.date >= monthStart)
    const totalMonthHours = monthlyReports.reduce((sum, r) => sum + (r.totalHours ?? 0) + (r.overtimeHours ?? 0), 0)
    const todayIso = now.toISOString().slice(0, 10)
    const todayReportsCount = reports.filter((r) => r.date === todayIso).length

    return (
      <>
        {/* Üst Bar - Dil Seçimi */}
        <PageHeader title={t.overview} />

        {/* İstatistik Kartları */}
        <div className="stats-grid">
          <div className="stat-card stat-card--primary">
            <div className="stat-icon">👥</div>
            <div className="stat-info">
              <div className="stat-value">{totalPersonnel}</div>
              <div className="stat-label">{t.totalPersonnel}</div>
            </div>
          </div>
          <div className="stat-card stat-card--success">
            <div className="stat-icon">✅</div>
            <div className="stat-info">
              <div className="stat-value">{acceptedInvites}</div>
              <div className="stat-label">{t.activeDevices}</div>
            </div>
          </div>
          <div className="stat-card stat-card--warning">
            <div className="stat-icon">⏳</div>
            <div className="stat-info">
              <div className="stat-value">{pendingReqs}</div>
              <div className="stat-label">{t.pendingRequests}</div>
            </div>
          </div>
          <div className="stat-card stat-card--info">
            <div className="stat-icon">📊</div>
            <div className="stat-info">
              <div className="stat-value">{formatDecimalHours(totalMonthHours)}</div>
              <div className="stat-label">{t.thisMonth}</div>
            </div>
          </div>
        </div>

        {/* Bildirimler */}
        {unreadCount > 0 && (
          <section className="card notification-card">
            <div className="section-title">
              {t.notifications}
              <span className="notif-badge">{unreadCount}</span>
            </div>
            <div className="notif-list">
              {notifications.filter((n) => !n.read).slice(0, 5).map((notif) => (
                <div key={notif.id} className="notif-item">
                  <div className="notif-icon">{notif.type === 'photo_update' ? '📷' : '✏️'}</div>
                  <div className="notif-content">
                    <div className="notif-message">{notif.message}</div>
                    <div className="notif-meta">{notif.userEmail}</div>
                  </div>
                  <button className="btn ghost small" onClick={() => markNotificationRead(notif.id)}>✓</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Rapor İstatistikleri */}
        <section className="card tool-card-stats">
          <div className="section-title">
            <span style={{ fontSize: '24px', marginRight: '8px' }}>📊</span>
            {t.reportStatistics}
          </div>
          <div className="tool-card__content">
            <div className="stats-period-selector">
              <button
                className={`period-btn ${statsPeriod === 'week' ? 'active' : ''}`}
                onClick={() => setStatsPeriod('week')}
              >
                {t.statsPeriodWeek}
              </button>
              <button
                className={`period-btn ${statsPeriod === 'month' ? 'active' : ''}`}
                onClick={() => setStatsPeriod('month')}
              >
                {t.statsPeriodMonth}
              </button>
              <button
                className={`period-btn ${statsPeriod === 'all' ? 'active' : ''}`}
                onClick={() => setStatsPeriod('all')}
              >
                {t.statsPeriodAll}
              </button>
            </div>
            {(() => {
              const stats = getReportStats()
              return (
                <div className="stats-grid">
                  <div className="stat-item">
                    <div className="stat-label">{t.totalReports}</div>
                    <div className="stat-value">{stats.totalReports}</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">{t.totalWorkHours}</div>
                    <div className="stat-value">{formatDecimalHours(stats.totalHours)}</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">{t.totalOvertimeHours}</div>
                    <div className="stat-value">{formatDecimalHours(stats.totalOvertime)}</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">{t.totalCombinedHours}</div>
                    <div className="stat-value highlight">{formatDecimalHours(stats.totalCombined)}</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">{t.workDays}</div>
                    <div className="stat-value">{stats.workReports}</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">{t.leaveDays}</div>
                    <div className="stat-value">{stats.leaveReports}</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">{t.offDays}</div>
                    <div className="stat-value">{stats.offReports}</div>
                  </div>
                  {stats.topWorker && (
                    <div className="stat-item stat-item--full">
                      <div className="stat-label">{t.topWorker}</div>
                      <div className="stat-value">
                        {stats.topWorker.name}: {formatDecimalHours(stats.topWorker.hours)} 
                        {stats.topWorker.overtime > 0 && ` (+${formatDecimalHours(stats.topWorker.overtime)})`}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </section>

        {/* İki Sütunlu Alan */}
        <div className="dashboard-grid">
          {/* Sol: Hızlı Davet */}
          <section className="card">
            <div className="section-title">{t.newInvite}</div>
            {!generatedLink ? (
              <div className="form-col">
                <label className="field">
                  <span>{t.email}</span>
                  <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
                </label>
                <label className="field">
                  <span>{t.role}</span>
                  <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as Invite['role'] }))}>
                    <option value="personal">{t.rolePersonal}</option>
                    <option value="admin">{t.roleAdmin}</option>
                  </select>
                </label>
                <button className="btn" onClick={handleSend} disabled={sending || !form.email}>
                  {sending ? t.sending : t.createInvite}
                </button>
                {error && <div className="error">{error}</div>}
              </div>
            ) : (
              <div className="invite-success">
                <div className="success-icon">✅</div>
                <div className="success-message">{info}</div>
                <div className="invite-link-box">
                  <input 
                    type="text" 
                    value={generatedLink} 
                    readOnly 
                    className="invite-link-input"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button 
                    className={`btn copy-btn ${linkCopied ? 'copied' : ''}`} 
                    onClick={copyLink}
                  >
                    {linkCopied ? '✓ ' + t.linkCopied : '📋 ' + t.copyLink}
                  </button>
                </div>
                <button className="btn ghost" onClick={resetInviteForm} style={{ marginTop: 12 }}>
                  {t.newInviteBtn}
                </button>
              </div>
            )}
          </section>

          {/* Sağ: Bekleyen Talepler */}
          <section className="card">
            <div className="section-title">
              {t.pendingRequests}
              {pendingReqs > 0 && <span className="notif-badge">{pendingReqs}</span>}
            </div>
            {reqLoading ? (
              <div>{t.loading}</div>
            ) : requests.filter((r) => r.status === 'pending').length === 0 ? (
              <div className="empty-state">✓ {lang === 'de' ? 'Keine offenen Anfragen' : 'لا توجد طلبات معلقة'}</div>
            ) : (
              <div className="request-list">
                {requests.filter((r) => r.status === 'pending').slice(0, 5).map((req) => (
                  <div key={req.id} className="request-item">
                    <div className="request-info">
                      <div className="request-name">{req.name || req.email}</div>
                      <div className="request-meta">{req.email}</div>
                    </div>
                    <button className="btn" onClick={() => approveRequest(req)}>{t.approve}</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* İzin Talepleri ve Tatiller - Yan Yana */}
        <div className="leave-holiday-grid">
          {/* İzin Talepleri */}
          <section className="card leave-requests-section-compact">
            <div className="section-title-small">
              🏖️ {t.leaveRequests}
              {pendingLeaveCount > 0 && <span className="notif-badge pulse">{pendingLeaveCount}</span>}
            </div>
            {leaveRequests.filter((r) => r.status === 'pending').length === 0 ? (
              <div className="empty-state-tiny">✓ {t.noLeaveRequests}</div>
            ) : (
              <div className="leave-list-tight">
                {leaveRequests.filter((r) => r.status === 'pending').map((req) => (
                  <div key={req.id} className="leave-item-tight">
                    <div className="leave-info-tight">
                      <div className="leave-name-small">{req.userName || req.userEmail}</div>
                      <div className="leave-dates-small">
                        {formatDate(req.leaveFrom)} → {formatDate(req.leaveTo)}
                      </div>
                      {req.leaveReason && (
                        <div className="leave-reason-small" title={req.leaveReason}>
                          {req.leaveReason}
                        </div>
                      )}
                    </div>
                    <div className="leave-actions-tight">
                      <button 
                        className="btn-icon-success-small" 
                        onClick={() => approveLeaveRequest(req)}
                        title={t.approveLeave}
                      >
                        ✓
                      </button>
                      <button 
                        className="btn-icon-danger-small" 
                        onClick={() => rejectLeaveRequest(req)}
                        title={t.rejectLeave}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Tatil / Sperrtage Yönetimi */}
          <section className="card holiday-section">
          <div className="holiday-header-compact">
            <div className="section-title-small">{t.holidays}</div>
            <div className="holiday-form-inline">
              <input
                type="date"
                value={holidayForm.date}
                onChange={(e) => setHolidayForm((p) => ({ ...p, date: e.target.value }))}
                className="holiday-input-date-small"
              />
              <input
                type="text"
                value={holidayForm.note}
                onChange={(e) => setHolidayForm((p) => ({ ...p, note: e.target.value }))}
                placeholder={lang === 'de' ? 'z.B. Weihnachten...' : 'مثال: عيد...'}
                className="holiday-input-note-small"
              />
              <button
                className="btn small"
                onClick={addHoliday}
                disabled={holidayAdding || !holidayForm.date || !holidayForm.note.trim()}
              >
                {holidayAdding ? '...' : t.addHoliday}
              </button>
            </div>
          </div>
          {holidayMsg && <div className="info holiday-msg-small">{holidayMsg}</div>}
          
          <div className="holiday-list-tight">
            {holidays.length === 0 ? (
              <div className="empty-state-tiny">{t.noHolidays}</div>
            ) : (
              holidays.map((h) => {
                const dateObj = new Date(`${h.date}T00:00:00`)
                const dayName = dateObj.toLocaleDateString(lang === 'de' ? 'de-DE' : 'ar', { weekday: 'short' })
                return (
                  <div key={h.id} className="holiday-item-tight">
                    <span className="holiday-day-small">{dayName}</span>
                    <span className="holiday-date-tight">{formatDate(h.date)}</span>
                    <span className="holiday-note-tight">{h.note}</span>
                    <button 
                      className="btn-icon-danger-small" 
                      onClick={() => deleteHoliday(h.id)}
                      title={t.deleteHoliday}
                    >
                      🗑️
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </section>
        </div>
      </>
    )
  }

  const renderTools = () => {
    const selectedUserReports = getSelectedUserReports()
    
    return (
      <div className="tools-page">
        <div className="tools-page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h2 className="tools-page-title">🛠️ {t.adminTools}</h2>
            <LanguageSwitcher />
          </div>
          <div className="tools-page-description">{t.toolsDescription}</div>
        </div>

        {toolsMessage && (
          <div 
            className={`tools-message ${toolsMessage.type}`}
            onMouseEnter={() => {
              if (messageTimeout) {
                clearTimeout(messageTimeout)
                setMessageTimeout(null)
              }
            }}
            onMouseLeave={() => {
              const timeout = setTimeout(() => {
                setToolsMessage(null)
                setMessageTimeout(null)
              }, 3000)
              setMessageTimeout(timeout)
            }}
          >
            {toolsMessage.type === 'success' ? '✅' : toolsMessage.type === 'error' ? '❌' : 'ℹ️'} {toolsMessage.text}
          </div>
        )}

        <div className="tools-layout">
          {/* Sol: Genel Araçlar */}
          <div className="tools-left">
            {/* Personel Rapor Silme */}
            <section className="card tools-section">
              <div className="section-title">👤 {t.selectPersonnel}</div>
              
              <select 
                value={selectedUserId} 
                onChange={(e) => {
                  setSelectedUserId(e.target.value)
                  setSelectedReportIds(new Set())
                }}
                className="tool-select-large"
              >
                <option value="">{t.selectPersonnel}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email} {u.surname || ''} ({u.deviceId?.slice(0, 8)}...)
                  </option>
                ))}
              </select>

              {selectedUserId && (
                <div className="user-reports-actions">
                  <div className="delete-mode-selector">
                    <button
                      className={`mode-btn ${toolsDeleteMode === 'all' ? 'active' : ''}`}
                      onClick={() => setToolsDeleteMode('all')}
                    >
                      {t.deleteAllReports}
                    </button>
                    <button
                      className={`mode-btn ${toolsDeleteMode === 'selected' ? 'active' : ''}`}
                      onClick={() => setToolsDeleteMode('selected')}
                    >
                      {t.deleteSelectedReports}
                    </button>
                  </div>

                  {toolsDeleteMode === 'all' && (
                    <button 
                      className="btn danger"
                      onClick={deleteAllUserReports}
                      disabled={toolsLoading || selectedUserReports.length === 0}
                    >
                      {toolsLoading ? '...' : `${t.deleteAllReports} (${selectedUserReports.length})`}
                    </button>
                  )}

                  {toolsDeleteMode === 'selected' && (
                    <>
                      <div className="selection-controls">
                        <button
                          className="btn ghost small"
                          onClick={toggleAllReports}
                        >
                          {selectedReportIds.size === selectedUserReports.length ? t.deselectAll : t.selectAll}
                        </button>
                        <span className="selected-count">
                          {t.selectedCount}: {selectedReportIds.size} / {selectedUserReports.length}
                        </span>
                      </div>
                      <button 
                        className="btn danger"
                        onClick={deleteSelectedReports}
                        disabled={toolsLoading || selectedReportIds.size === 0}
                      >
                        {toolsLoading ? '...' : `${t.deleteSelectedReports} (${selectedReportIds.size})`}
                      </button>
                    </>
                  )}
                </div>
              )}
            </section>

            {/* Diğer Araçlar */}
            <section className="card tools-section">
              <div className="section-title">⚙️ {lang === 'de' ? 'Weitere Werkzeuge' : 'أدوات أخرى'}</div>
              
              <div className="tools-grid">
                {/* Cihaza göre rapor sil */}
                <div className="tool-card">
                  <div className="tool-card__icon">📱</div>
                  <div className="tool-card__title">{t.deleteReportsForDevice}</div>
                  <div className="tool-card__content">
                    <select 
                      value={toolsUserId} 
                      onChange={(e) => setToolsUserId(e.target.value)}
                      className="tool-select"
                    >
                      <option value="">{t.selectPersonnel}</option>
                      {users.filter((u) => u.deviceId).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.email} {u.surname || ''} ({u.deviceId?.slice(0, 8)}...)
                        </option>
                      ))}
                    </select>
                    <button 
                      className="btn danger small"
                      onClick={deleteReportsByDevice}
                      disabled={!toolsUserId || toolsLoading}
                    >
                      {toolsLoading ? '...' : t.confirmDelete}
                    </button>
                  </div>
                </div>

                {/* Veri Yedekleme */}
                <div className="tool-card">
                  <div className="tool-card__icon">💾</div>
                  <div className="tool-card__title">{t.backupUserData}</div>
                  <div className="tool-card__content">
                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                      {lang === 'de' ? 'Wählen Sie einen Benutzer aus, um Daten zu sichern' : 'اختر مستخدمًا لنسخ البيانات احتياطيًا'}
                    </div>
                    <select 
                      value={selectedUserId} 
                      onChange={(e) => {
                        setSelectedUserId(e.target.value)
                        setSelectedReportIds(new Set())
                      }}
                      className="tool-select"
                      style={{ marginBottom: '8px' }}
                    >
                      <option value="">{t.selectPersonnel}</option>
                      {users.filter((u) => u.deviceId).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.email} {u.surname || ''} ({u.deviceId?.slice(0, 8)}...)
                        </option>
                      ))}
                    </select>
                    <button 
                      className="btn primary small"
                      onClick={backupUserData}
                      disabled={!selectedUserId || toolsLoading}
                      style={{ width: '100%' }}
                    >
                      💾 {t.backupUserData}
                    </button>
                  </div>
                </div>

                {/* Veri Geri Yükleme */}
                <div className="tool-card">
                  <div className="tool-card__icon">📥</div>
                  <div className="tool-card__title">{t.restoreFromBackup}</div>
                  <div className="tool-card__content">
                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                      {lang === 'de' ? 'Wählen Sie den neuen Benutzer aus, um Daten wiederherzustellen' : 'اختر المستخدم الجديد لاستعادة البيانات'}
                    </div>
                    <select 
                      value={restoreUserId} 
                      onChange={(e) => setRestoreUserId(e.target.value)}
                      className="tool-select"
                      style={{ marginBottom: '8px' }}
                    >
                      <option value="">{t.selectPersonnel}</option>
                      {users.filter((u) => u.deviceId).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.email} {u.surname || ''} ({u.deviceId?.slice(0, 8)}...)
                        </option>
                      ))}
                    </select>
                        <label className="btn secondary small" style={{ cursor: restoreUserId ? 'pointer' : 'not-allowed', display: 'block', textAlign: 'center', opacity: restoreUserId ? 1 : 0.5, width: '100%' }}>
                          📥 {t.restoreFromBackup}
                          <input
                            type="file"
                            accept=".json"
                            onChange={restoreUserData}
                            style={{ display: 'none' }}
                            disabled={!restoreUserId || toolsLoading}
                          />
                        </label>
                  </div>
                </div>

                {/* Personel Hesabı Silme */}
                <div className="tool-card">
                  <div className="tool-card__icon">🗑️</div>
                  <div className="tool-card__title">{t.deleteUserAccount}</div>
                  <div className="tool-card__content">
                    <select 
                      value={selectedUserId} 
                      onChange={(e) => {
                        setSelectedUserId(e.target.value)
                        setSelectedReportIds(new Set())
                      }}
                      className="tool-select"
                      style={{ marginBottom: '8px' }}
                    >
                      <option value="">{t.selectPersonnel}</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.email} {u.surname || ''}
                        </option>
                      ))}
                    </select>
                    <button 
                      className="btn danger small"
                      onClick={deleteUserAccount}
                      disabled={!selectedUserId || toolsLoading}
                      style={{ width: '100%' }}
                    >
                      🗑️ {t.deleteUserAccount}
                    </button>
                  </div>
                </div>
                
                {/* Bekleyen istekleri sil */}
                <div className="tool-card">
                  <div className="tool-card__icon">🗑️</div>
                  <div className="tool-card__title">{t.deleteAllPendingRequests}</div>
                  <div className="tool-card__content">
                    <div className="tool-info">
                      {requests.filter((r) => r.status === 'pending').length} {lang === 'de' ? 'wartende Anfragen' : 'طلب معلق'}
                    </div>
                    <button 
                      className="btn danger small"
                      onClick={deletePendingRequests}
                      disabled={toolsLoading}
                    >
                      {toolsLoading ? '...' : t.confirmDelete}
                    </button>
                  </div>
                </div>
                
                {/* Verileri export et */}
                <div className="tool-card export-card">
                  <div className="tool-card__icon">📊</div>
                  <div className="tool-card__title">{t.exportData}</div>
                  <div className="tool-card__content">
                    <div className="tool-info">
                      {getFilteredReports().length} {lang === 'de' ? 'Berichte' : 'تقرير'}
                    </div>
                    <button 
                      className="btn primary small"
                      onClick={exportReportsCSV}
                      disabled={getFilteredReports().length === 0}
                    >
                      CSV Export
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <div className="danger-zone">
              <div className="danger-zone__header">
                <span className="danger-icon">⚠️</span>
                <span className="danger-title">{t.dangerZone}</span>
              </div>
              <div className="danger-warning">{t.dangerWarning}</div>
            </div>
          </div>

          {/* Sağ: Rapor Listesi veya Tüm Raporlar */}
          <div className="tools-right">
            {selectedUserId ? (
              <section className="card">
                <div className="section-title">
                  {lang === 'de' ? 'Berichte' : 'التقارير'} ({selectedUserReports.length})
                </div>
                
                {selectedUserReports.length === 0 ? (
                  <div className="empty-state">{t.noReportsForUser}</div>
                ) : (
                  <div className="reports-list-tools">
                    {toolsDeleteMode === 'selected' && (
                      <div className="reports-list-header">
                        <input
                          type="checkbox"
                          checked={selectedReportIds.size === selectedUserReports.length && selectedUserReports.length > 0}
                          onChange={toggleAllReports}
                          className="select-all-checkbox"
                        />
                        <span className="select-all-label">{t.selectAll}</span>
                      </div>
                    )}
                    {selectedUserReports.map((r) => (
                      <div key={r.id} className={`report-item-tools ${selectedReportIds.has(r.id) ? 'selected' : ''} ${editingReportId === r.id ? 'editing' : ''}`}>
                        {toolsDeleteMode === 'selected' && (
                          <input
                            type="checkbox"
                            checked={selectedReportIds.has(r.id)}
                            onChange={() => toggleReportSelection(r.id)}
                            className="report-checkbox"
                            disabled={editingReportId === r.id}
                          />
                        )}
                        {editingReportId === r.id ? (
                          <div className="report-edit-form">
                            <div className="section-title-small">{t.editingReport}</div>
                            <div className="edit-form-grid">
                              <label className="form-field">
                                <span>{t.startTime}</span>
                                <input
                                  type="time"
                                  value={editReportForm.startTime}
                                  onChange={(e) => setEditReportForm((prev) => ({ ...prev, startTime: e.target.value }))}
                                />
                              </label>
                              <label className="form-field">
                                <span>{t.endTime}</span>
                                <input
                                  type="time"
                                  value={editReportForm.endTime}
                                  onChange={(e) => setEditReportForm((prev) => ({ ...prev, endTime: e.target.value }))}
                                />
                              </label>
                              <label className="form-field">
                                <span>{t.hours} {editReportForm.startTime && editReportForm.endTime ? t.autoCalculated : ''}</span>
                                <input
                                  type="number"
                                  step="0.25"
                                  min="0"
                                  value={editReportForm.totalHours}
                                  onChange={(e) => setEditReportForm((prev) => ({ ...prev, totalHours: parseFloat(e.target.value) || 0 }))}
                                  readOnly={!!(editReportForm.startTime && editReportForm.endTime)}
                                  style={editReportForm.startTime && editReportForm.endTime ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                                  title={editReportForm.startTime && editReportForm.endTime ? (lang === 'de' ? 'Wird automatisch basierend auf Start- und Endzeit berechnet' : 'يتم حسابه تلقائيًا بناءً على وقت البدء والانتهاء') : ''}
                                />
                              </label>
                              <label className="form-field">
                                <span>{t.overtimeTime} - {t.startTime}</span>
                                <input
                                  type="time"
                                  value={editReportForm.overtimeStartTime}
                                  onChange={(e) => setEditReportForm((prev) => ({ ...prev, overtimeStartTime: e.target.value }))}
                                />
                              </label>
                              <label className="form-field">
                                <span>{t.overtimeTime} - {t.endTime}</span>
                                <input
                                  type="time"
                                  value={editReportForm.overtimeEndTime}
                                  onChange={(e) => setEditReportForm((prev) => ({ ...prev, overtimeEndTime: e.target.value }))}
                                />
                              </label>
                              <label className="form-field">
                                <span>{t.overtime} {editReportForm.overtimeStartTime && editReportForm.overtimeEndTime ? t.autoCalculated : editReportForm.startTime && editReportForm.endTime ? t.autoCalculated : ''}</span>
                                <input
                                  type="number"
                                  step="0.25"
                                  min="0"
                                  value={editReportForm.overtimeHours}
                                  onChange={(e) => setEditReportForm((prev) => ({ ...prev, overtimeHours: parseFloat(e.target.value) || 0 }))}
                                  readOnly={!!((editReportForm.overtimeStartTime && editReportForm.overtimeEndTime) || (editReportForm.startTime && editReportForm.endTime))}
                                  style={(editReportForm.overtimeStartTime && editReportForm.overtimeEndTime) || (editReportForm.startTime && editReportForm.endTime) ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                                  title={(editReportForm.overtimeStartTime && editReportForm.overtimeEndTime) || (editReportForm.startTime && editReportForm.endTime) ? (lang === 'de' ? 'Wird automatisch basierend auf Überstunden- oder Normalzeiten berechnet' : 'يتم حسابه تلقائيًا بناءً على ساعات الإضافية أو الساعات العادية') : ''}
                                />
                              </label>
                              <label className="form-field form-field--full">
                                <span>{t.note}</span>
                                <textarea
                                  value={editReportForm.note}
                                  onChange={(e) => setEditReportForm((prev) => ({ ...prev, note: e.target.value }))}
                                  rows={2}
                                />
                              </label>
                            </div>
                            <div className="edit-form-actions">
                              <button
                                className="btn primary small"
                                onClick={updateReport}
                                disabled={updatingReport}
                              >
                                {updatingReport ? '...' : t.updateReport}
                              </button>
                              <button
                                className="btn secondary small"
                                onClick={cancelEditingReport}
                                disabled={updatingReport}
                              >
                                {t.cancel}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="report-item-content">
                              <div className="report-item-date">{formatDate(r.date)}</div>
                              <div className="report-item-info">
                                <span>{r.startTime || '-'} → {r.endTime || '-'}</span>
                                <span className="report-hours">{formatDecimalHours(r.totalHours ?? 0)}</span>
                                {r.overtimeHours && r.overtimeHours > 0 && (
                                  <span className="report-overtime">+{formatDecimalHours(r.overtimeHours)}</span>
                                )}
                              </div>
                              {r.overtimeStartTime && r.overtimeEndTime && (
                                <div className="report-item-overtime">
                                  {t.overtimeTime}: {r.overtimeStartTime} → {r.overtimeEndTime}
                                </div>
                              )}
                              {r.note && (
                                <div className="report-item-note">{r.note}</div>
                              )}
                            </div>
                            {toolsDeleteMode !== 'selected' && (
                              <button
                                className="btn ghost small report-edit-btn"
                                onClick={() => startEditingReport(r)}
                                title={t.editReport}
                              >
                                ✏️ {t.editReport}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <section className="card">
                <div className="section-title">
                  {lang === 'de' ? 'Alle Berichte' : 'جميع التقارير'} ({getFilteredReports().length})
                </div>
                
                {getFilteredReports().length === 0 ? (
                  <div className="empty-state">{lang === 'de' ? 'Keine Berichte gefunden' : 'لم يتم العثور على تقارير'}</div>
                ) : (
                  <div className="reports-list-tools">
                    {getFilteredReports().slice(0, 50).map((r) => {
                      const user = users.find((u) => u.deviceId === r.deviceId)
                      return (
                        <div key={r.id} className="report-item-tools">
                          <div className="report-item-content">
                            <div className="report-item-date">{formatDate(r.date)}</div>
                            <div className="report-item-user">{user?.name || user?.email || r.deviceId || '-'}</div>
                            <div className="report-item-info">
                              <span>{r.startTime || '-'} → {r.endTime || '-'}</span>
                              <span className="report-hours">{formatDecimalHours(r.totalHours ?? 0)}</span>
                              {r.overtimeHours && r.overtimeHours > 0 && (
                                <span className="report-overtime">+{formatDecimalHours(r.overtimeHours)}</span>
                              )}
                            </div>
                            <div className="report-item-status">
                              {r.status === 'urlaub' ? '🏖️' : r.status === 'frei' ? '🌙' : '💼'} {r.status === 'urlaub' ? t.statusLeave : r.status === 'frei' ? t.statusOff : t.statusWork}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {getFilteredReports().length > 50 && (
                      <div className="list-note" style={{ textAlign: 'center', marginTop: 12 }}>
                        {lang === 'de' ? `Zeige 50 von ${getFilteredReports().length} Berichten` : `عرض 50 من ${getFilteredReports().length} تقرير`}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Destek isteğini çözüldü olarak işaretle
  const resolveSupportRequest = async (requestId: string) => {
    try {
      await updateDoc(doc(db, 'supportRequests', requestId), {
        status: 'resolved',
        resolvedAt: Timestamp.now(),
      })
      setToolsMessage({ type: 'success', text: t.supportResolved })
    } catch (e) {
      console.error('Resolve support request error:', e)
      setToolsMessage({ type: 'error', text: t.deleteError })
    }
  }

  // Destek isteğinden personel detayına git
  const openPersonnelFromSupport = (supportRequest: SupportRequest) => {
    const user = users.find((u) => u.deviceId === supportRequest.deviceId)
    if (user) {
      openPersonnelDetail(user)
    } else {
      setToolsMessage({ type: 'error', text: lang === 'de' ? 'Personel nicht gefunden' : 'لم يتم العثور على الموظف' })
    }
  }

  // Çözülen destek isteklerini temizle
  const clearSupportHistory = async () => {
    if (!window.confirm(t.clearSupportHistoryConfirm)) return

    const resolvedRequests = supportRequests.filter((r) => r.status === 'resolved')
    if (resolvedRequests.length === 0) {
      setToolsMessage({ type: 'info', text: lang === 'de' ? 'Keine gelösten Anfragen zum Löschen' : 'لا توجد طلبات محلولة للحذف' })
      return
    }

    setToolsLoading(true)
    setToolsMessage(null)
    try {
      const batch: Promise<void>[] = []
      resolvedRequests.forEach((req) => {
        batch.push(deleteDoc(doc(db, 'supportRequests', req.id)))
      })
      await Promise.all(batch)
      showMessage('success', t.supportHistoryCleared)
    } catch (e) {
      console.error('Clear support history error:', e)
      showMessage('error', t.deleteError)
    } finally {
      setToolsLoading(false)
    }
  }

  const renderSupport = () => {
    const pendingRequests = supportRequests.filter((r) => r.status === 'pending')
    const resolvedRequests = supportRequests.filter((r) => r.status === 'resolved')
    
    const getTopicLabel = (topic: string) => {
      switch (topic) {
        case 'wrong_report':
        case 'wrongReport':
          return t.supportTopicWrongReport
        case 'wrong_leave':
        case 'wrongLeave':
          return t.supportTopicWrongLeave
        case 'reset_account':
        case 'resetAccount':
          return t.supportTopicResetAccount
        case 'change_device':
        case 'changeDevice':
          return t.supportTopicChangeDevice
        default:
          return t.supportTopicOther
      }
    }

    return (
      <div className="support-page">
        <div className="support-page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h2 className="support-page-title">🆘 {t.support}</h2>
            <LanguageSwitcher />
          </div>
          <div className="support-page-description">
            {lang === 'de' ? 'Verwalten Sie Support-Anfragen von Personal' : 'إدارة طلبات الدعم من الموظفين'}
          </div>
        </div>

        {toolsMessage && (
          <div 
            className={`tools-message ${toolsMessage.type}`}
            onMouseEnter={() => {
              if (messageTimeout) {
                clearTimeout(messageTimeout)
                setMessageTimeout(null)
              }
            }}
            onMouseLeave={() => {
              const timeout = setTimeout(() => {
                setToolsMessage(null)
                setMessageTimeout(null)
              }, 3000)
              setMessageTimeout(timeout)
            }}
          >
            {toolsMessage.type === 'success' ? '✅' : toolsMessage.type === 'error' ? '❌' : 'ℹ️'} {toolsMessage.text}
          </div>
        )}

        {/* Bekleyen İstekler */}
        <section className="card">
          <div className="section-title">
            {t.supportStatusPending}
            {pendingRequests.length > 0 && <span className="notif-badge pulse">{pendingRequests.length}</span>}
          </div>
          {supportLoading ? (
            <div>{t.loading}</div>
          ) : pendingRequests.length === 0 ? (
            <div className="empty-state">✓ {lang === 'de' ? 'Keine ausstehenden Anfragen' : 'لا توجد طلبات معلقة'}</div>
          ) : (
            <div className="support-list">
              {pendingRequests.map((req) => {
                const user = users.find((u) => u.deviceId === req.deviceId)
                return (
                  <div key={req.id} className="support-item support-item--pending">
                    <div className="support-item__header">
                      <div className="support-item-user">
                        <div className="support-user-name">{req.userName || req.userEmail || user?.name || user?.email || req.deviceId}</div>
                        <div className="support-meta">
                          <span className="support-user-meta">{req.userEmail || user?.email || ''} • {req.deviceId?.slice(0, 8)}...</span>
                          <span className="support-date-created">
                            {req.createdAt ? formatDate(req.createdAt.toDate().toISOString().slice(0, 10)) : '-'}
                          </span>
                        </div>
                      </div>
                      <div className="support-status pending">{t.supportStatusPending}</div>
                    </div>
                    <div className="support-topic">
                      <span className="support-topic-label">{t.supportTopic}:</span>
                      <span className="support-topic-value">{getTopicLabel(req.topic)}</span>
                    </div>
                    {(req.relatedDate || req.affectedDate) && (
                      <div className="support-affected-date">
                        <span className="support-label">{t.supportRelatedDate}:</span>
                        <span className="support-value">{formatDate(req.relatedDate || req.affectedDate || '')}</span>
                      </div>
                    )}
                    <div className="support-message">
                      <span className="support-label">{t.supportMessage}:</span>
                      <div className="support-message-text">{req.message}</div>
                    </div>
                    <div className="support-item-actions">
                      <button
                        className="btn primary small"
                        onClick={() => openPersonnelFromSupport(req)}
                      >
                        👤 {t.supportViewPersonnel}
                      </button>
                      <button
                        className="btn success small"
                        onClick={() => resolveSupportRequest(req.id)}
                      >
                        ✓ {t.supportResolve}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Çözülen İstekler */}
        {resolvedRequests.length > 0 && (
          <section className="card">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                {t.supportStatusResolved} ({resolvedRequests.length})
              </span>
              <button
                className="btn danger small"
                onClick={clearSupportHistory}
                disabled={toolsLoading}
                title={t.clearSupportHistory}
              >
                🗑️ {t.clearSupportHistory}
              </button>
            </div>
            <div className="support-list">
              {resolvedRequests.slice(0, 20).map((req) => {
                const user = users.find((u) => u.deviceId === req.deviceId)
                return (
                  <div key={req.id} className="support-item support-item--resolved">
                    <div className="support-item__header">
                      <div className="support-item-user">
                        <div className="support-user-name">{req.userName || req.userEmail || user?.name || user?.email || req.deviceId}</div>
                        <div className="support-meta">
                          <span className="support-user-meta">{req.userEmail || user?.email || ''} • {req.deviceId?.slice(0, 8)}...</span>
                          <span className="support-date-created">
                            {req.resolvedAt ? formatDate(req.resolvedAt.toDate().toISOString().slice(0, 10)) : '-'}
                          </span>
                        </div>
                      </div>
                      <div className="support-status resolved">{t.supportStatusResolved}</div>
                    </div>
                    <div className="support-topic">
                      <span className="support-topic-label">{t.supportTopic}:</span>
                      <span className="support-topic-value">{getTopicLabel(req.topic)}</span>
                    </div>
                    {(req.relatedDate || req.affectedDate) && (
                      <div className="support-affected-date">
                        <span className="support-label">{t.supportRelatedDate}:</span>
                        <span className="support-value">{formatDate(req.relatedDate || req.affectedDate || '')}</span>
                      </div>
                    )}
                    <div className="support-message">
                      <span className="support-label">{t.supportMessage}:</span>
                      <div className="support-message-text">{req.message}</div>
                    </div>
                    {req.adminResponse && (
                      <div className="support-admin-response">
                        <span className="support-label">{t.adminResponse}:</span>
                        <span>{req.adminResponse}</span>
                      </div>
                    )}
                    <div className="support-item-actions">
                      <button
                        className="btn ghost small"
                        onClick={() => openPersonnelFromSupport(req)}
                      >
                        👤 {t.supportViewPersonnel}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    )
  }

  // Açılır/Kapanır Harita Component'i
  const CollapsibleMap = ({ title, mapId, defaultOpen = false }: { title: string; mapId: string; defaultOpen?: boolean }) => {
    // Parent component'teki state'i kullan (yeniden render'da kaybolmaz)
    const isOpen = mapOpenStates.get(mapId) ?? defaultOpen
    const mapContainerRef = useRef<HTMLDivElement>(null)
    
    const toggleMap = () => {
      setMapOpenStates((prev) => {
        const newMap = new Map(prev)
        const currentState = prev.get(mapId) ?? defaultOpen
        newMap.set(mapId, !currentState)
        return newMap
      })
    }
    
    // İlk render'da defaultOpen değerini set et
    useEffect(() => {
      if (!mapOpenStates.has(mapId)) {
        setMapOpenStates((prev) => {
          const newMap = new Map(prev)
          newMap.set(mapId, defaultOpen)
          return newMap
        })
      }
    }, [mapId, defaultOpen])
    
    // Harita açıldığında oluştur
    useEffect(() => {
      if (!isOpen) {
        return
      }
      
      // Kısa bir gecikme ile harita oluştur (DOM'un render edilmesi için)
      const timer = setTimeout(() => {
        if (typeof (window as any).L === 'undefined') {
          return
        }
        
        const L = (window as any).L
        const mapElement = document.getElementById(mapId)
        if (!mapElement) {
          return
        }
        
        // Harita zaten oluşturulmuş mu kontrol et
        let mapData = mapRefs.current.get(mapId)
        
        // DOM element'inin zaten bir Leaflet haritasına sahip olup olmadığını kontrol et
        if ((mapElement as any)._leaflet_id) {
          // Element zaten bir harita tarafından kullanılıyor
          // mapRefs'te mevcut harita var mı kontrol et
          if (mapData && mapData.map) {
            // Harita zaten var, sadece boyutunu güncelle
            setTimeout(() => {
              mapData.map.invalidateSize()
            }, 300)
            return
          }
          // mapRefs'te yoksa, element'i temizle ve yeniden oluştur
          // Leaflet'in internal state'ini temizlemek için element'i yeniden oluştur
          const parent = mapElement.parentNode
          const nextSibling = mapElement.nextSibling
          const newElement = document.createElement('div')
          newElement.id = mapId
          newElement.className = mapElement.className
          newElement.style.cssText = mapElement.style.cssText
          parent?.removeChild(mapElement)
          parent?.insertBefore(newElement, nextSibling)
          // Yeni element ile devam et (recursive call yapmayalım, sadece return edelim)
          return
        }
        
        if (mapData && mapData.map) {
          // Harita zaten var, sadece boyutunu güncelle
          setTimeout(() => {
            mapData.map.invalidateSize()
          }, 300)
          return
        }
        
        // Yeni harita oluştur
        const center: [number, number] = [52.5200, 13.4050] // Default center
        const map = L.map(mapId, {
          preferCanvas: false,
        }).setView(center, 10)
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map)
        
        const marker = L.marker(center).addTo(map)
        const personIcon = L.divIcon({
          className: 'custom-marker-person',
          html: '<div style="font-size: 24px; text-align: center; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🧍</div>',
          iconSize: [24, 24],
          iconAnchor: [12, 24],
        })
        marker.setIcon(personIcon)
        
        const polyline = L.polyline([], {
          color: '#3b82f6',
          weight: 3,
          opacity: 0.8,
        }).addTo(map)
        
        mapRefs.current.set(mapId, { map, marker, polyline, labels: [] })
        
        // Harita oluşturulduktan sonra boyutunu güncelle
        setTimeout(() => {
          map.invalidateSize()
        }, 300)
      }, 300)
      
      return () => clearTimeout(timer)
    }, [isOpen, mapId])
    
    return (
      <div className="collapsible-map-container">
        <div 
          className="collapsible-map-header"
          onClick={toggleMap}
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            cursor: 'pointer',
            border: '1px solid #e2e8f0',
            marginBottom: isOpen ? '12px' : '0',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '14px' }}>{title}</span>
          <span style={{ fontSize: '18px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▼
          </span>
        </div>
        {isOpen && (
          <div 
            ref={mapContainerRef}
            id={mapId}
            className="live-map"
            style={{ 
              width: '100%', 
              height: '400px',
              borderRadius: '8px', 
              overflow: 'hidden', 
              marginTop: '8px',
            }}
          />
        )}
      </div>
    )
  }

  const renderPersonnelList = () => (
    <>
      <PageHeader title={t.personnel} />
      <section className="card">
        <div className="section-title">{t.personnel}</div>
      <div className="form-row" style={{ marginBottom: 10 }}>
        <label className="field" style={{ flex: 1 }}>
          <span>{t.search}</span>
          <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder={t.search} />
        </label>
      </div>
      {userLoading ? (
        <div>{t.loading}</div>
      ) : (
        <table className="table clickable">
          <thead>
            <tr>
              <th>{t.name}</th>
              <th>{t.email}</th>
              <th>{t.device}</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id} onDoubleClick={() => openPersonnelDetail(u)} style={{ cursor: 'pointer' }}>
                <td>{u.name ? `${u.name} ${u.surname || ''}`.trim() : '-'}</td>
                <td>{u.email || '-'}</td>
                <td>{u.deviceId || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="hint">{lang === 'de' ? 'Doppelklick zum Öffnen' : 'انقر نقرًا مزدوجًا لفتح التفاصيل'}</div>
    </section>
    </>
  )

  const renderPersonnelDetail = (userId?: string) => {
    const user = getDetailUser(userId)
    const userReports = getDetailReports(userId)
    if (!user) return <div>{t.loading}</div>
    
    // Harita için unique ID
    const mapId = `map-${user.deviceId || userId}`

    // Bulunduğu ay için hesaplamalar
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() // 0-11
    const currentDay = now.getDate()
    
    // Ayın 1'inden bugüne kadar olan raporları filtrele
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`
    const today = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`
    
    const monthlyReports = userReports.filter((r) => r.date >= monthStart && r.date <= today)
    
    // Toplam hesaplamalar
    const totalWorkHours = monthlyReports.reduce((sum, r) => sum + (r.totalHours ?? 0), 0)
    const totalOvertimeHours = monthlyReports.reduce((sum, r) => sum + (r.overtimeHours ?? 0), 0)
    const totalCombined = totalWorkHours + totalOvertimeHours
    
    // Gün sayıları
    const workDays = monthlyReports.filter((r) => r.status === 'arbeit' || !r.status).length
    const leaveDays = monthlyReports.filter((r) => r.status === 'urlaub').length
    const offDays = monthlyReports.filter((r) => r.status === 'frei').length
    
    // Ay adı
    const monthName = now.toLocaleDateString(lang === 'de' ? 'de-DE' : 'ar', { month: 'long', year: 'numeric' })

    const isEditing = editingUserId === user.id

    return (
      <>
        <PageHeader title={`${user.name || user.email} ${user.surname || ''} ${t.reportsOf}`} />
        <section className="card">
          <div className="section-title">
            {user.name || user.email} {user.surname || ''} {t.reportsOf}
          </div>

        {/* Profil Bölümü */}
        <div className="profile-section">
          <div className="profile-photo-area">
            {user.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="profile-photo" />
            ) : (
              <div className="profile-photo-placeholder">👤</div>
            )}
            <label className="photo-upload-btn">
              {uploading ? '...' : t.uploadPhoto}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handlePhotoUpload(user.id, file)
                }}
              />
            </label>
          </div>

          {isEditing ? (
            <div className="profile-edit-form">
              <div className="form-row">
                <label className="field">
                  <span>{t.name}</span>
                  <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
                </label>
                <label className="field">
                  <span>Nachname</span>
                  <input value={editForm.surname} onChange={(e) => setEditForm((p) => ({ ...p, surname: e.target.value }))} />
                </label>
              </div>
              <div className="form-row">
                <label className="field">
                  <span>{t.phone}</span>
                  <input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
                </label>
                <label className="field">
                  <span>{t.address}</span>
                  <input value={editForm.address} onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))} />
                </label>
              </div>
              <div className="form-row" style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => handleSaveProfile(user.id)} disabled={saving}>
                  {saving ? t.updating : t.saveChanges}
                </button>
                <button className="btn ghost" onClick={cancelEditing}>
                  {t.cancel}
                </button>
              </div>
              {saveMsg && <div className="info">{saveMsg}</div>}
            </div>
          ) : (
            <div className="profile-info">
              <div><strong>{t.name}:</strong> {user.name} {user.surname}</div>
              <div><strong>{t.email}:</strong> {user.email || '-'}</div>
              <div><strong>{t.phone}:</strong> {user.phone || '-'}</div>
              <div><strong>{t.address}:</strong> {user.address || '-'}</div>
              <div><strong>{t.device}:</strong> {user.deviceId || '-'}</div>
              <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => startEditing(user)}>
                {t.editProfile}
              </button>
            </div>
          )}
        </div>

        {/* Aylık Özet */}
        <div className="monthly-summary">
          <div className="summary-header">{t.monthlyTotal} - {monthName}</div>
          <div className="summary-grid">
            <div className="summary-item">
              <div className="summary-label">{t.totalWorkHours}</div>
              <div className="summary-value">{formatDecimalHours(totalWorkHours)}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">{t.totalOvertime}</div>
              <div className="summary-value">{formatDecimalHours(totalOvertimeHours)}</div>
            </div>
            <div className="summary-item highlight">
              <div className="summary-label">{t.totalCombined}</div>
              <div className="summary-value">{formatDecimalHours(totalCombined)}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">{t.workDays}</div>
              <div className="summary-value">{workDays}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">{t.leaveDays}</div>
              <div className="summary-value">{leaveDays}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">{t.offDays}</div>
              <div className="summary-value">{offDays}</div>
            </div>
          </div>
        </div>

        {/* Canlı Konum Takibi */}
        {user.deviceId ? (
          <section className="card location-tracking-section">
            <div className="section-title">
              📍 {t.liveLocationTracking}
              {locationTracking.has(user.deviceId) && (
                <span className="tracking-badge">🟢 {lang === 'de' ? 'Aktiv' : 'نشط'}</span>
              )}
              {!locationTracking.has(user.deviceId) && (
                <span className="tracking-badge inactive">⚪ {lang === 'de' ? 'Inaktiv' : 'غير نشط'}</span>
              )}
            </div>
            
            {(() => {
              const currentLocation = locationTracking.get(user.deviceId)
              const history = locationHistory.get(user.deviceId) || []
              const recentHistory = history.slice(0, 20).reverse() // Son 20 kayıt, en eskiden yeniye
              
              
              if (!currentLocation && history.length === 0) {
                return (
                  <div className="empty-state">
                    {t.noActivePersonnel}
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#9ca3af' }}>
                      {lang === 'de' 
                        ? 'Personel muss zuerst die Arbeit starten, damit die Standortverfolgung beginnt.' 
                        : 'يجب على الموظف بدء العمل أولاً لبدء تتبع الموقع'}
                    </div>
                  </div>
                )
              }
              
              return (
                <div className="location-tracking-detail">
                  {/* Canlı Harita - Açılır/Kapanır */}
                  <CollapsibleMap
                    title={lang === 'de' ? '🗺️ Live-Karte' : '🗺️ خريطة مباشرة'}
                    mapId={mapId}
                    defaultOpen={false}
                  />
                </div>
              )
            })()}
          </section>
        ) : (
          <section className="card">
            <div className="section-title">📍 {t.liveLocationTracking}</div>
            <div className="empty-state">
              {lang === 'de' 
                ? 'Kein Gerät zugewiesen. Bitte Gerät zuweisen, um Standortverfolgung zu aktivieren.' 
                : 'لم يتم تعيين جهاز. يرجى تعيين جهاز لتفعيل تتبع الموقع'}
            </div>
          </section>
        )}

        {/* Raporlar Tablosu - Geliştirilmiş */}
        {userReports.length === 0 ? (
          <div>{t.noReports}</div>
        ) : (
          <div className="reports-list-compact">
            {userReports.map((r) => (
              <div key={r.id} className={`report-row ${r.isOpen ? 'is-open' : ''} ${r.isOvertimeOpen ? 'overtime-open' : ''}`}>
                {/* Tarih ve Durum */}
                <div className="report-row__date">
                  <span className="report-date-text">{formatDate(r.date)}</span>
                  <div className="report-badges">
                    <span className={`status-badge ${r.status || 'arbeit'}`}>
                      {r.status === 'urlaub' ? '🏖️' : r.status === 'frei' ? '🌙' : '💼'}
                    </span>
                    {r.isOpen && <span className="open-badge">⏳</span>}
                    {r.isOvertimeOpen && <span className="overtime-open-badge">⏱️</span>}
                  </div>
                </div>
                
                {/* Normal Çalışma */}
                <div className="report-row__work">
                  <div className="work-block">
                    <span className="block-label">🟢 {t.workStart}</span>
                    <span className="block-time">{r.startTime || '-'}</span>
                    {r.startLocation && r.startLocation.latitude && r.startLocation.longitude && (
                      <button 
                        className="map-btn"
                        onClick={() => openMapDialog(r.startLocation!.latitude, r.startLocation!.longitude, t.workStart)}
                        title={t.showOnMap}
                      >
                        📍
                      </button>
                    )}
                  </div>
                  <span className="time-separator">→</span>
                  <div className="work-block">
                    <span className="block-label">🔴 {t.workEnd}</span>
                    <span className="block-time">{r.endTime || '-'}</span>
                    {r.endLocation && r.endLocation.latitude && r.endLocation.longitude && (
                      <button 
                        className="map-btn"
                        onClick={() => openMapDialog(r.endLocation!.latitude, r.endLocation!.longitude, t.workEnd)}
                        title={t.showOnMap}
                      >
                        📍
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Mesai */}
                {r.hasOvertime && (
                  <div className="report-row__overtime">
                    <div className="work-block overtime">
                      <span className="block-label">⏱️ {t.overtimeStart}</span>
                      <span className="block-time">{r.overtimeStartTime || '-'}</span>
                      {r.overtimeStartLocation && r.overtimeStartLocation.latitude && r.overtimeStartLocation.longitude && (
                        <button 
                          className="map-btn"
                          onClick={() => openMapDialog(r.overtimeStartLocation!.latitude, r.overtimeStartLocation!.longitude, t.overtimeStart)}
                          title={t.showOnMap}
                        >
                          📍
                        </button>
                      )}
                    </div>
                    <span className="time-separator">→</span>
                    <div className="work-block overtime">
                      <span className="block-label">⏹️ {t.overtimeEnd}</span>
                      <span className="block-time">{r.overtimeEndTime || '...'}</span>
                      {r.overtimeEndLocation && r.overtimeEndLocation.latitude && r.overtimeEndLocation.longitude && (
                        <button 
                          className="map-btn"
                          onClick={() => openMapDialog(r.overtimeEndLocation!.latitude, r.overtimeEndLocation!.longitude, t.overtimeEnd)}
                          title={t.showOnMap}
                        >
                          📍
                        </button>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Harita - Başlangıç ve Bitiş Konumları */}
                {((r.startLocation && r.startLocation.latitude && r.startLocation.longitude) || 
                  (r.endLocation && r.endLocation.latitude && r.endLocation.longitude)) && (
                  <div style={{ marginTop: '12px' }}>
                    <button
                      className="btn ghost small"
                      onClick={async () => {
                        // Başlangıç ve bitiş konumlarını gösteren harita aç
                        const startLoc = r.startLocation
                        const endLoc = r.endLocation
                        if (!startLoc && !endLoc) return
                        
                        // İlk konumu al (başlangıç varsa, yoksa bitiş)
                        const centerLoc = startLoc || endLoc!
                        const address = await getAddressFromCoordinates(centerLoc.latitude, centerLoc.longitude)
                        setMapDialog({ 
                          isOpen: true, 
                          latitude: centerLoc.latitude, 
                          longitude: centerLoc.longitude, 
                          title: `${formatDate(r.date)} - ${lang === 'de' ? 'Arbeitsorte' : 'مواقع العمل'}`,
                          address,
                          startLocation: startLoc,
                          endLocation: endLoc,
                        })
                      }}
                      title={lang === 'de' ? 'Karte mit Start- und Endposition anzeigen' : 'عرض الخريطة مع موقع البداية والنهاية'}
                    >
                      🗺️ {lang === 'de' ? 'Karte anzeigen' : 'عرض الخريطة'}
                    </button>
                  </div>
                )}
                
                {/* Toplam Saatler */}
                <div className="report-row__hours">
                  <div className="hours-item">
                    <span className="hours-label">{t.hours}</span>
                    <span className="hours-value">{formatDecimalHours(r.totalHours ?? 0)}</span>
                  </div>
                  {(r.overtimeHours ?? 0) > 0 && (
                    <div className="hours-item overtime">
                      <span className="hours-label">{t.overtime}</span>
                      <span className="hours-value">+{formatDecimalHours(r.overtimeHours ?? 0)}</span>
                    </div>
                  )}
                </div>
                
                {/* Not */}
                {r.note && (
                  <div className="report-row__note">
                    <span className="note-icon">📝</span>
                    <span className="note-text">{r.note}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      </>
    )
  }

  return (
    <div className="shell" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <header className="top">
        <div>
          <div className="title">{t.title}</div>
          <div className="subtitle">{t.subtitle}</div>
        </div>
        <div className="user-box">
          <div className="user-email">{authUser.email}</div>
          <button className="btn ghost small" onClick={handleLogout}>
            {t.logout}
          </button>
        </div>
      </header>

      <div className="tabs-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-item ${activeTabId === tab.id ? 'is-active' : ''}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span className="tab-label">
              {tab.type === 'dashboard' ? t.dashboard : 
               tab.type === 'personnel' ? t.tabPersonnel : 
               tab.type === 'support' ? t.support :
               tab.type === 'tools' ? (lang === 'de' ? 'Werkzeuge' : 'أدوات') : 
               tab.label}
            </span>
            {tab.type === 'personnel-detail' && (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="tab-content">
        {activeTab?.type === 'dashboard' && renderDashboard()}
        {activeTab?.type === 'personnel' && renderPersonnelList()}
        {activeTab?.type === 'personnel-detail' && renderPersonnelDetail(activeTab.userId)}
        {activeTab?.type === 'support' && renderSupport()}
        {activeTab?.type === 'tools' && renderTools()}
      </div>

      {/* Harita Dialog */}
      {mapDialog && mapDialog.isOpen && (
        <div className="map-dialog-overlay" onClick={closeMapDialog}>
          <div className="map-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="map-dialog__header">
              <h3 className="map-dialog__title">📍 {mapDialog.title}</h3>
              <button className="map-dialog__close" onClick={closeMapDialog}>✕</button>
            </div>
            <div className="map-dialog__body">
              <iframe
                title="Google Maps"
                width="100%"
                height="400"
                style={{ border: 0, borderRadius: '8px' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps/embed/v1/place?key=YOUR_GOOGLE_MAPS_API_KEY&q=${mapDialog.latitude},${mapDialog.longitude}&zoom=17`}
              />
            </div>
            <div className="map-dialog__footer">
              <div className="map-coords">
                <div style={{ marginBottom: '8px', fontWeight: 600 }}>{mapDialog.address || `${mapDialog.latitude.toFixed(6)}, ${mapDialog.longitude.toFixed(6)}`}</div>
                <div style={{ fontSize: '12px', color: '#6b7c92' }}>
                  {mapDialog.latitude.toFixed(6)}, {mapDialog.longitude.toFixed(6)}
                </div>
              </div>
              <button className="btn primary" onClick={closeMapDialog}>
                {t.closeMap}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Canlı Konum Takibi Harita Dialog */}
      {trackingMapDialog && trackingMapDialog.isOpen && (() => {
        const location = locationTracking.get(trackingMapDialog.deviceId)
        const history = locationHistory.get(trackingMapDialog.deviceId) || []
        
        return (
          <div className="map-dialog-overlay" onClick={() => setTrackingMapDialog(null)}>
            <div className="map-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="map-dialog__header">
                <h3 className="map-dialog__title">📍 {trackingMapDialog.personnelName} - {t.liveTracking}</h3>
                <button className="map-dialog__close" onClick={() => setTrackingMapDialog(null)}>✕</button>
              </div>
              <div className="map-dialog__body">
                <div 
                  id="tracking-dialog-map"
                  style={{ width: '100%', height: '500px', borderRadius: '8px', overflow: 'hidden' }}
                />
              </div>
              <div className="map-dialog__footer">
                <div className="map-coords">
                  {location ? (
                    <>
                      {Number(location.latitude).toFixed(6)}, {Number(location.longitude).toFixed(6)}
                      {location.accuracy && (
                        <span style={{ marginLeft: '8px', fontSize: '12px', color: '#6b7c92' }}>
                          (±{Math.round(location.accuracy)}m)
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>{lang === 'de' ? 'Keine Position verfügbar' : 'لا يوجد موقع'}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {location && (
                    <a
                      href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn primary"
                    >
                      {lang === 'de' ? 'In Google Maps öffnen' : 'فتح في خرائط Google'}
                    </a>
                  )}
                  <button className="btn ghost" onClick={() => setTrackingMapDialog(null)}>
                    {t.closeMap}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Playback dialog kaldırıldı */}
    </div>
  )
}

export default App

