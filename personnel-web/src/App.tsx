import { useEffect, useMemo, useState, useRef } from 'react'
import {
  collection,
  addDoc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  doc,
  where,
  updateDoc,
} from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import './App.css'
import { firebaseApp } from './firebase'

const storage = getStorage(firebaseApp)

type Lang = 'de' | 'ar'

type TabId = 'home' | 'hours' | 'profile' | 'support'

type UserProfile = {
  name: string
  email: string
  phone: string
  address: string
  photoURL: string
}

type LocationData = {
  latitude: number
  longitude: number
  accuracy?: number
  timestamp: Date
}

type ReportDoc = {
  id: string
  date: string // ISO yyyy-MM-dd
  totalHours: number
  overtimeHours?: number
  status?: 'arbeit' | 'urlaub' | 'frei'
  leaveFrom?: string | null
  leaveTo?: string | null
  leaveReason?: string | null
  note?: string
  createdAt?: Date | null
  deviceId?: string | null
  // Yeni alanlar - başlama/bitiş saatleri ve konum
  startTime?: string | null // HH:mm formatında
  endTime?: string | null // HH:mm formatında
  startSubmittedAt?: Date | null // Başlama saati girildiğinde
  endSubmittedAt?: Date | null // Bitiş saati girildiğinde
  startLocation?: LocationData | null
  endLocation?: LocationData | null
  isOpen?: boolean // Bitiş saati girilmedi mi?
  // Mesai saatleri
  overtimeStartTime?: string | null
  overtimeEndTime?: string | null
  overtimeStartSubmittedAt?: Date | null
  overtimeEndSubmittedAt?: Date | null
  overtimeStartLocation?: LocationData | null
  overtimeEndLocation?: LocationData | null
  isOvertimeOpen?: boolean // Mesai devam ediyor mu?
  hasOvertime?: boolean // Mesai var mı?
}

type Holiday = {
  id: string
  date: string // ISO yyyy-MM-dd
  note: string
}

const TEXT: Record<Lang, any> = {
  de: {
    topbarTitle: 'TOP Clean',
    topbarSubtitle: 'Personal • Mobil',
    heroHeadline: 'Arbeitszeit schnell erfassen.',
    chipTarget: 'Ziel',
    chipOpen: 'Offen',
    today: 'Heute',
    tracked: 'Erfasst',
    trackedHint: 'Letzte Speicherung',
    open: 'Offen',
    openHint: 'Bitte heute abschließen',
    recent: 'Letzte Einträge',
    deviceStatus: 'Gerätestatus',
    deviceVerifiedTitle: 'Dieses Gerät ist verifiziert',
    deviceVerifiedId: 'Geräte-ID',
    deviceNote: 'Nur verknüpfte Geräte dürfen laden.',
    reportTitle: 'Eintrag',
    date: 'Datum',
    dateHint: 'Tag wählen',
    note: 'Notiz',
    notePlaceholder: 'Aufgaben, Besonderheiten ...',
    save: 'Speichern',
    tabHome: 'Übersicht',
    desktopBlockTitle: 'Nur auf Mobilgeräten verfügbar',
    desktopBlockDesc: 'Bitte die App auf einem Smartphone oder Tablet öffnen.',
    accessDeniedTitle: 'Keine Einladung gefunden',
    accessDeniedDesc: 'Dieses Gerät ist nicht freigeschaltet. Bitte Einladung nutzen.',
    checkingAccess: 'Zugriff wird geprüft...',
    hoursLabel: 'Arbeitsstunden (h)',
    overtimeLabel: 'Überstunden (h)',
    status: 'Status',
    statusWork: 'Arbeitstag',
    statusLeave: 'Urlaub beantragen',
    statusOff: 'Frei / Feiertag',
    selectedDay: 'Ausgewählter Tag',
    workSummary: 'Arbeitszeit inkl. Überstunden',
    leaveFrom: 'Von (Datum)',
    leaveTo: 'Bis (Datum)',
    leaveReason: 'Grund',
    profileTitle: 'Profil',
    calendar: 'Kalender',
    todayLabel: 'Heute',
    langDe: 'DE',
    langAr: 'AR',
    tabProfile: 'Profil',
    editProfile: 'Bearbeiten',
    saveProfile: 'Speichern',
    cancelEdit: 'Abbrechen',
    phone: 'Telefon',
    address: 'Adresse',
    uploadPhoto: 'Foto ändern',
    uploading: 'Lädt...',
    saved: 'Gespeichert',
    myProfile: 'Mein Profil',
    surname: 'Nachname',
    holidayBlocked: 'Feiertag - nicht auswählbar',
    tabHours: 'Stunden',
    tabSupport: 'Hilfe',
    supportTitle: 'Support-Anfrage',
    supportTopic: 'Thema',
    supportTopicWrongReport: 'Falsche Zeiterfassung',
    supportTopicWrongLeave: 'Falscher Urlaub',
    supportTopicResetAccount: 'Konto zurücksetzen',
    supportTopicChangeDevice: 'Gerät wechseln',
    supportTopicOther: 'Sonstiges',
    supportDate: 'Betroffenes Datum',
    supportMessage: 'Nachricht',
    supportSend: 'Anfrage senden',
    supportSent: 'Anfrage gesendet!',
    supportHint: 'Der Administrator wird sich um Ihre Anfrage kümmern.',
    mySupportRequests: 'Meine Anfragen',
    noSupportRequests: 'Keine Anfragen',
    supportStatusPending: 'Offen',
    supportStatusResolved: 'Erledigt',
    monthlyTotal: 'Monatliche Zusammenfassung',
    totalWorkHours: 'Arbeitsstunden',
    totalOvertime: 'Überstunden',
    totalCombined: 'Gesamt',
    workDays: 'Arbeitstage',
    leaveDays: 'Urlaubstage',
    offDays: 'Freie Tage',
    thisMonth: 'Diesen Monat',
    noReports: 'Keine Einträge',
    hours: 'Stunden',
    overtime: 'Überstunden',
    // Yeni başlama/bitiş saatleri için çeviriler
    startWork: 'Arbeit beginnen',
    endWork: 'Arbeit beenden',
    startTime: 'Startzeit',
    endTime: 'Endzeit',
    enterStartTime: 'Arbeitsbeginn eingeben',
    enterEndTime: 'Arbeitsende eingeben',
    workInProgress: 'Arbeit läuft',
    openEntries: 'Offene Einträge',
    noOpenEntries: 'Keine offenen Einträge',
    completeEntry: 'Abschließen',
    locationCapturing: 'Standort wird erfasst...',
    locationCaptured: 'Standort erfasst',
    locationError: 'Standort konnte nicht erfasst werden',
    startRegistered: 'Arbeitsbeginn registriert!',
    endRegistered: 'Arbeitsende registriert!',
    todayEntry: 'Heutiger Eintrag',
    workStarted: 'Arbeit gestartet um',
    workNotStarted: 'Arbeit noch nicht gestartet',
    confirmEnd: 'Arbeitsende bestätigen?',
    manualEntry: 'Manuelle Eingabe / Urlaub',
    manualEntryHint: 'Für vergangene Tage oder Urlaubsanträge',
    pastDateEntry: 'Vergangene Tage',
    // Mesai saatleri
    addOvertime: 'Überstunden hinzufügen?',
    addOvertimeQuestion: 'Möchten Sie Überstunden erfassen?',
    yesAddOvertime: 'Ja, Überstunden starten',
    noThanks: 'Nein, danke',
    startOvertime: 'Überstunden starten',
    endOvertime: 'Überstunden beenden',
    saveOvertime: 'Überstunden speichern',
    overtimeInProgress: 'Überstunden laufen',
    overtimeStarted: 'Überstunden gestartet!',
    overtimeEnded: 'Überstunden beendet!',
    overtimeTime: 'Überstundenzeit',
    normalWorkEnded: 'Normale Arbeitszeit beendet',
    workCompleted: 'Arbeitstag abgeschlossen',
    // Konum izni
    locationConsentTitle: 'Standortverfolgung - Einverständniserklärung',
    locationConsentText: 'Ich erkläre mich damit einverstanden, dass mein Standort während der Arbeitszeit kontinuierlich erfasst und gespeichert wird. Diese Daten werden ausschließlich für Arbeitszeitnachweise und Sicherheitszwecke verwendet. Ich kann diese Einwilligung jederzeit widerrufen.',
    locationConsentRequired: 'Bitte akzeptieren Sie die Standortverfolgung, um fortzufahren.',
    locationTrackingActive: 'Standortverfolgung aktiv',
    locationTrackingInactive: 'Standortverfolgung inaktiv',
  },
  ar: {
    topbarTitle: 'توب كلين',
    topbarSubtitle: 'الموظف • موبايل',
    heroHeadline: 'سجّل ساعات عملك بسرعة.',
    chipTarget: 'الهدف',
    chipOpen: 'المتبقي',
    today: 'اليوم',
    tracked: 'المسجّل',
    trackedHint: 'آخر حفظ',
    open: 'متبقي',
    openHint: 'أكمل اليوم',
    recent: 'آخر السجلات',
    deviceStatus: 'حالة الجهاز',
    deviceVerifiedTitle: 'الجهاز موثّق',
    deviceVerifiedId: 'معرّف الجهاز',
    deviceNote: 'فقط الأجهزة المرتبطة يمكنها التحميل.',
    reportTitle: 'تسجيل',
    date: 'التاريخ',
    dateHint: 'اختر اليوم',
    note: 'ملاحظة',
    notePlaceholder: 'تفاصيل أو ملاحظات...',
    save: 'حفظ',
    tabHome: 'الملخص',
    desktopBlockTitle: 'متاح على الجوال فقط',
    desktopBlockDesc: 'افتح التطبيق على الهاتف أو التابلت.',
    accessDeniedTitle: 'لا يوجد دعوة',
    accessDeniedDesc: 'هذا الجهاز غير مخوّل. استخدم رابط الدعوة.',
    checkingAccess: 'يتم التحقق من الوصول...',
    hoursLabel: 'ساعات العمل (س)',
    overtimeLabel: 'ساعات إضافية (س)',
    status: 'الحالة',
    statusWork: 'يوم عمل',
    statusLeave: 'طلب إجازة',
    statusOff: 'راحة / عطلة',
    selectedDay: 'اليوم المختار',
    workSummary: 'العمل متضمناً الساعات الإضافية',
    leaveFrom: 'من (تاريخ)',
    leaveTo: 'إلى (تاريخ)',
    leaveReason: 'السبب',
    profileTitle: 'الملف الشخصي',
    calendar: 'التقويم',
    todayLabel: 'اليوم',
    langDe: 'ألمانية',
    langAr: 'عربية',
    tabProfile: 'الملف الشخصي',
    editProfile: 'تعديل',
    saveProfile: 'حفظ',
    cancelEdit: 'إلغاء',
    phone: 'الهاتف',
    address: 'العنوان',
    uploadPhoto: 'تغيير الصورة',
    uploading: 'جاري التحميل...',
    saved: 'تم الحفظ',
    myProfile: 'ملفي الشخصي',
    surname: 'اللقب',
    holidayBlocked: 'عطلة رسمية - لا يمكن اختياره',
    tabHours: 'ساعاتي',
    tabSupport: 'الدعم',
    supportTitle: 'طلب الدعم',
    supportTopic: 'الموضوع',
    supportTopicWrongReport: 'تسجيل وقت خاطئ',
    supportTopicWrongLeave: 'إجازة خاطئة',
    supportTopicResetAccount: 'إعادة تعيين الحساب',
    supportTopicChangeDevice: 'تغيير الجهاز',
    supportTopicOther: 'أخرى',
    supportDate: 'التاريخ المعني',
    supportMessage: 'الرسالة',
    supportSend: 'إرسال الطلب',
    supportSent: 'تم إرسال الطلب!',
    supportHint: 'سيتولى المسؤول معالجة طلبك.',
    mySupportRequests: 'طلباتي',
    noSupportRequests: 'لا توجد طلبات',
    supportStatusPending: 'قيد الانتظار',
    supportStatusResolved: 'تم الحل',
    monthlyTotal: 'ملخص الشهر',
    totalWorkHours: 'ساعات العمل',
    totalOvertime: 'ساعات إضافية',
    totalCombined: 'الإجمالي',
    workDays: 'أيام العمل',
    leaveDays: 'أيام الإجازة',
    offDays: 'أيام الراحة',
    thisMonth: 'هذا الشهر',
    noReports: 'لا توجد سجلات',
    hours: 'ساعات',
    overtime: 'إضافي',
    // Yeni başlama/bitiş saatleri için çeviriler
    startWork: 'بدء العمل',
    endWork: 'إنهاء العمل',
    startTime: 'وقت البدء',
    endTime: 'وقت الانتهاء',
    enterStartTime: 'إدخال وقت البدء',
    enterEndTime: 'إدخال وقت الانتهاء',
    workInProgress: 'العمل قيد التنفيذ',
    openEntries: 'سجلات مفتوحة',
    noOpenEntries: 'لا توجد سجلات مفتوحة',
    completeEntry: 'إكمال',
    locationCapturing: 'جاري تحديد الموقع...',
    locationCaptured: 'تم تحديد الموقع',
    locationError: 'تعذر تحديد الموقع',
    startRegistered: 'تم تسجيل بدء العمل!',
    endRegistered: 'تم تسجيل نهاية العمل!',
    todayEntry: 'سجل اليوم',
    workStarted: 'بدأ العمل في',
    workNotStarted: 'لم يبدأ العمل بعد',
    confirmEnd: 'تأكيد نهاية العمل؟',
    manualEntry: 'إدخال يدوي / إجازة',
    manualEntryHint: 'للأيام السابقة أو طلبات الإجازة',
    pastDateEntry: 'أيام سابقة',
    // Mesai saatleri
    addOvertime: 'إضافة ساعات إضافية؟',
    addOvertimeQuestion: 'هل تريد تسجيل ساعات إضافية؟',
    yesAddOvertime: 'نعم، بدء الساعات الإضافية',
    noThanks: 'لا، شكراً',
    startOvertime: 'بدء الساعات الإضافية',
    endOvertime: 'إنهاء الساعات الإضافية',
    saveOvertime: 'حفظ الساعات الإضافية',
    overtimeInProgress: 'الساعات الإضافية جارية',
    overtimeStarted: 'بدأت الساعات الإضافية!',
    overtimeEnded: 'انتهت الساعات الإضافية!',
    overtimeTime: 'وقت الساعات الإضافية',
    normalWorkEnded: 'انتهى وقت العمل العادي',
    workCompleted: 'اكتمل يوم العمل',
    // Konum izni
    locationConsentTitle: 'تتبع الموقع - إقرار الموافقة',
    locationConsentText: 'أوافق على أن يتم تسجيل موقعي وتخزينه بشكل مستمر أثناء ساعات العمل. تُستخدم هذه البيانات حصريًا لإثبات ساعات العمل وأغراض السلامة. يمكنني إلغاء هذه الموافقة في أي وقت.',
    locationConsentRequired: 'يرجى قبول تتبع الموقع للمتابعة.',
    locationTrackingActive: 'تتبع الموقع نشط',
    locationTrackingInactive: 'تتبع الموقع غير نشط',
  },
}

const inviteCopy: Record<Lang, any> = {
  de: {
    title: 'Einladung bestätigen',
    subtitle: 'Gerät registrieren und Freigabe anfordern',
    email: 'E-Mail',
    name: 'Name',
    note: 'Notiz (optional)',
    submit: 'Registrierung senden',
    success: 'Anfrage eingegangen. Nach Freigabe wird das Gerät aktiviert.',
    deviceIdLabel: 'Geräte-Code',
    back: 'Zurück',
    missingEmail: 'Gültige E-Mail erforderlich',
    locationConsentTitle: 'Standortverfolgung - Einverständniserklärung',
    locationConsentText: 'Ich erkläre mich damit einverstanden, dass mein Standort während der Arbeitszeit kontinuierlich erfasst und gespeichert wird. Diese Daten werden ausschließlich für Arbeitszeitnachweise und Sicherheitszwecke verwendet. Ich kann diese Einwilligung jederzeit widerrufen.',
  },
  ar: {
    title: 'تأكيد الدعوة',
    subtitle: 'تسجيل الجهاز وطلب الموافقة',
    email: 'البريد الإلكتروني',
    name: 'الاسم',
    note: 'ملاحظة (اختياري)',
    submit: 'إرسال التسجيل',
    success: 'تم استلام الطلب. سيتم تفعيل الجهاز بعد الموافقة.',
    deviceIdLabel: 'رمز الجهاز',
    back: 'رجوع',
    missingEmail: 'البريد الإلكتروني مطلوب',
    locationConsentTitle: 'تتبع الموقع - إقرار الموافقة',
    locationConsentText: 'أوافق على أن يتم تسجيل موقعي وتخزينه بشكل مستمر أثناء ساعات العمل. تُستخدم هذه البيانات حصريًا لإثبات ساعات العمل وأغراض السلامة. يمكنني إلغاء هذه الموافقة في أي وقت.',
  },
}

const computeDeviceId = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'dev-unknown'
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  const parts = [
    nav.userAgent || '',
    nav.language || '',
    nav.platform || '',
    String(nav.maxTouchPoints || 0),
    typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '',
    nav.userAgentData?.mobile ? 'm' : 'd',
  ]
  const raw = parts.join('|')
  let hash = 0
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash << 5) - hash + raw.charCodeAt(i)
    hash |= 0
  }
  return `dev-${Math.abs(hash)}`
}

function InvitePage() {
  const db = useMemo(() => getFirestore(firebaseApp), [])
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [form, setForm] = useState({ email: '', name: '', note: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locationConsent, setLocationConsent] = useState(false)
  const [lang] = useState<Lang>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('tc_lang') as Lang
      return stored === 'ar' ? 'ar' : 'de'
    }
    return 'de'
  })
  const t = inviteCopy[lang]

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const email = params.get('email')
    if (email) {
      setForm((prev) => ({ ...prev, email }))
    }
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('tc_device_id')
    if (stored) {
      setDeviceId(stored)
    } else {
      const generated = computeDeviceId()
      localStorage.setItem('tc_device_id', generated)
      setDeviceId(generated)
    }
  }, [])

  const handleSubmit = async () => {
    if (!form.email.trim()) {
      setError(t.missingEmail)
      return
    }
    if (!locationConsent) {
      setError(lang === 'de' ? 'Bitte akzeptieren Sie die Standortverfolgung' : 'يرجى قبول تتبع الموقع')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await addDoc(collection(db, 'deviceRequests'), {
        email: form.email.trim().toLowerCase(),
        name: form.name.trim(),
        note: form.note.trim(),
        deviceId: deviceId || computeDeviceId(),
        status: 'pending',
        createdAt: serverTimestamp(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        locationConsent: true,
        locationConsentDate: serverTimestamp(),
      })
      setDone(true)
    } catch (e: any) {
      setError(e?.message || 'Speichern fehlgeschlagen')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    // 2 saniye sonra ana sayfaya yönlendir
    setTimeout(() => {
      window.location.href = '/'
    }, 2000)
    
    return (
      <div className="desktop-block">
        <div className="desktop-block__panel">
          <div className="desktop-block__title">{t.success}</div>
          <div className="desktop-block__desc" style={{ marginTop: 12 }}>
            ⏳ {lang === 'de' ? 'Weiterleitung zur Startseite...' : 'إعادة التوجيه إلى الصفحة الرئيسية...'}
          </div>
          {deviceId ? <div className="device-id-inline">{deviceId}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="desktop-block">
      <div className="desktop-block__panel">
        <div className="desktop-block__title">{t.title}</div>
        <div className="desktop-block__desc">{t.subtitle}</div>
        {deviceId ? <div className="device-id-inline">{t.deviceIdLabel}: {deviceId}</div> : null}
        <div className="stack" style={{ width: '100%' }}>
          <label className="form-field form-field--full">
            <span>{t.email}</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="personel@example.com"
            />
          </label>
          <label className="form-field form-field--full">
            <span>{t.name}</span>
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </label>
          <label className="form-field form-field--full">
            <span>{t.note}</span>
            <textarea value={form.note} rows={3} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />
          </label>
          
          {/* Konum İzni */}
          <div className="location-consent-box">
            <div className="location-consent-title">{t.locationConsentTitle}</div>
            <div className="location-consent-text">{t.locationConsentText}</div>
            <label className="location-consent-checkbox">
              <input
                type="checkbox"
                checked={locationConsent}
                onChange={(e) => setLocationConsent(e.target.checked)}
                required
              />
              <span>{lang === 'de' ? 'Ich akzeptiere die Standortverfolgung' : 'أوافق على تتبع الموقع'}</span>
            </label>
          </div>
          
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || !locationConsent}>
            {submitting ? '...' : t.submit}
          </button>
        </div>
      </div>
    </div>
  )
}

// Ondalık saati HH:MM formatına çevir (örn: 2.5 -> "2:30")
const formatDecimalHours = (decimalHours: number) => {
  const hours = Math.floor(decimalHours)
  const minutes = Math.round((decimalHours - hours) * 60)
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}

const weekdayShort = (lang: Lang) => (lang === 'de' ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] : ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح'])

const monthDays = (anchorIso: string, lang: Lang) => {
  const [y, m] = anchorIso.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  
  // Ayın ilk gününün haftanın hangi günü olduğunu bul (0=Pazar, 1=Pazartesi, ...)
  // Pazartesi başlangıçlı takvim için dönüştür
  let firstDayOfWeek = start.getUTCDay() // 0=Pazar, 1=Pazartesi, ...
  // Pazartesi = 0, Salı = 1, ..., Pazar = 6 olacak şekilde dönüştür
  firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1
  
  const days: (string | null)[] = []
  
  // Ayın başındaki boş günleri ekle
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null)
  }
  
  // Ayın günlerini ekle
  for (let d = 1; d <= daysInMonth; d += 1) {
    const iso = new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10)
    days.push(iso)
  }
  
  return {
    days,
    monthLabel: start.toLocaleDateString(lang === 'de' ? 'de-DE' : 'ar', { month: 'long', year: 'numeric' }),
    weekdays: weekdayShort(lang),
  }
}

const formatDateLabel = (iso: string, lang: Lang) => {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'ar', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
}

const formatTodayLabel = (lang: Lang) => {
  const d = new Date()
  return d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'ar', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
}

function MainApp() {
  const todayIso = new Date().toISOString().slice(0, 10)
  const [lang, setLang] = useState<Lang>(() => {
    // localStorage'dan dil tercihini oku
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tc_lang')
      if (saved === 'ar' || saved === 'de') return saved
    }
    return 'de'
  })
  const [langAnimating, setLangAnimating] = useState(false)

  const switchLang = (newLang: Lang) => {
    if (newLang === lang) return
    setLangAnimating(true)
    setTimeout(() => {
      setLang(newLang)
      localStorage.setItem('tc_lang', newLang)
      setTimeout(() => setLangAnimating(false), 300)
    }, 150)
  }
  const t = TEXT[lang]
  const db = useMemo(() => getFirestore(firebaseApp), [])
  const tabDefs: { id: TabId; label: string; icon: string }[] = [
    { id: 'home', label: t.tabHome, icon: '🏠' },
    { id: 'hours', label: t.tabHours, icon: '⏱️' },
    { id: 'support', label: t.tabSupport, icon: '💬' },
    { id: 'profile', label: t.tabProfile, icon: '👤' },
  ]
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [reports, setReports] = useState<ReportDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [deviceAllowed, setDeviceAllowed] = useState(false)
  const [deviceChecked, setDeviceChecked] = useState(false)
  const [deviceRequestId, setDeviceRequestId] = useState<string | null>(null)
  
  // Tatil günleri
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [selectedHolidayNote, setSelectedHolidayNote] = useState<string | null>(null)
  
  // Destek talepleri
  type SupportRequest = {
    id: string
    topic: string
    affectedDate?: string
    relatedDate?: string
    message: string
    status: 'pending' | 'resolved'
    adminResponse?: string
    createdAt?: any
  }
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([])
  const [supportForm, setSupportForm] = useState({ topic: 'wrongReport', affectedDate: '', message: '' })
  const [supportSending, setSupportSending] = useState(false)
  const [supportMsg, setSupportMsg] = useState<string | null>(null)
  
  // Profil state'leri
  const [profile, setProfile] = useState<UserProfile>({ name: '', email: '', phone: '', address: '', photoURL: '' })
  const [profileEditing, setProfileEditing] = useState(false)
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', address: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileUploading, setProfileUploading] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState(false) // Resim yüklenemezse placeholder göster
  const [monthAnchor, setMonthAnchor] = useState(todayIso)
  const [leaveAnchor, setLeaveAnchor] = useState(todayIso)
  const [leaveSelecting, setLeaveSelecting] = useState<'from' | 'to'>('from')
  const [form, setForm] = useState({
    date: '',
    totalHours: 8,
    overtimeHours: 0,
    status: 'arbeit' as ReportDoc['status'],
    note: '',
    leaveFrom: '',
    leaveTo: '',
    leaveReason: '',
  })
  const [isMobile, setIsMobile] = useState(true)
  
  // Başlama/Bitiş saati yeni state'leri
  const [openReports, setOpenReports] = useState<ReportDoc[]>([]) // Bitiş girilmemiş raporlar
  const [todayOpenReport, setTodayOpenReport] = useState<ReportDoc | null>(null) // Bugünün açık raporu
  const [locationCapturing, setLocationCapturing] = useState(false)
  const [_locationStatus, setLocationStatus] = useState<'idle' | 'capturing' | 'success' | 'error'>('idle')
  const locationTrackingIntervalRef = useRef<number | null>(null)
  const [startTimeInput, setStartTimeInput] = useState('')
  const [endTimeInput, setEndTimeInput] = useState('')
  const [workActionMsg, setWorkActionMsg] = useState<string | null>(null)
  
  // Mesai state'leri
  const [showOvertimePanel, setShowOvertimePanel] = useState(false)
  const [overtimeStartTimeInput, setOvertimeStartTimeInput] = useState('')
  const [overtimeEndTimeInput, setOvertimeEndTimeInput] = useState('')

  // Konum yakalama fonksiyonu - geliştirilmiş
  const captureLocation = (): Promise<LocationData | null> => {
    return new Promise((resolve) => {
      // Geolocation API kontrolü
      if (!navigator.geolocation) {
        console.warn('Geolocation API not available')
        setLocationStatus('error')
        setLocationCapturing(false)
        resolve(null)
        return
      }
      
      setLocationCapturing(true)
      setLocationStatus('capturing')
      
      // Konum izni kontrolü ve istek
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('Location captured:', position.coords)
          const locationData: LocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date(),
          }
          setLocationCapturing(false)
          setLocationStatus('success')
          resolve(locationData)
        },
        (error) => {
          console.error('Location error:', error.code, error.message)
          setLocationCapturing(false)
          setLocationStatus('error')
          // Konum alınamazsa da devam et - null döndür
          resolve(null)
        },
        {
          enableHighAccuracy: true,
          timeout: 15000, // 15 saniye timeout
          maximumAge: 60000, // 1 dakika cache
        }
      )
    })
  }

  // İşe başlama kaydet
  const handleStartWork = async () => {
    if (!deviceAllowed || !deviceId) {
      setError(lang === 'de' ? 'Gerät nicht autorisiert' : 'الجهاز غير مصرح')
      return
    }
    
    // Varsayılan olarak şu anki saati al
    const now = new Date()
    const currentTime = startTimeInput || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    
    setSaving(true)
    setError(null)
    setWorkActionMsg(null)
    
    try {
      // Konum yakala
      const location = await captureLocation()
      
      const reportData = {
        date: todayIso,
        totalHours: 0,
        overtimeHours: 0,
        status: 'arbeit',
        note: '',
        deviceId,
        createdAt: serverTimestamp(),
        // Yeni alanlar
        startTime: currentTime,
        endTime: null,
        startSubmittedAt: serverTimestamp(),
        endSubmittedAt: null,
        startLocation: location ? {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          timestamp: new Date().toISOString(),
        } : null,
        endLocation: null,
        isOpen: true,
      }
      
      await addDoc(collection(db, 'reports'), reportData)
      setStartTimeInput('')
      setWorkActionMsg(t.startRegistered)
      setTimeout(() => setWorkActionMsg(null), 3000)
    } catch (e: any) {
      console.error('Start work error:', e)
      setError(lang === 'de' ? 'Speichern fehlgeschlagen' : 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  // İşi bitirme kaydet - düzeltilmiş
  const handleEndWork = async (reportId: string) => {
    console.log('handleEndWork called with reportId:', reportId)
    
    if (!deviceAllowed || !deviceId) {
      setError(lang === 'de' ? 'Gerät nicht autorisiert' : 'الجهاز غير مصرح')
      return
    }
    
    if (!reportId) {
      setError(lang === 'de' ? 'Kein Eintrag ausgewählt' : 'لم يتم اختيار سجل')
      return
    }
    
    // Varsayılan olarak şu anki saati al
    const now = new Date()
    const currentTime = endTimeInput || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    
    setSaving(true)
    setError(null)
    setWorkActionMsg(null)
    
    try {
      // Konum yakala
      const location = await captureLocation()
      console.log('Location for end work:', location)
      
      // Açık raporu bul - önce reports'tan ara (daha güncel)
      const report = reports.find((r) => r.id === reportId)
      console.log('Found report:', report)
      
      if (!report) {
        setError(lang === 'de' ? 'Eintrag nicht gefunden' : 'لم يتم العثور على السجل')
        setSaving(false)
        return
      }
      
      // startTime kontrolü
      const startTime = report.startTime
      if (!startTime) {
        // startTime yoksa varsayılan değer kullan
        console.warn('No startTime found, using default calculation')
      }
      
      // Toplam saat hesapla
      let totalHours = 8 // Varsayılan
      if (startTime) {
        const [startH, startM] = startTime.split(':').map(Number)
        const [endH, endM] = currentTime.split(':').map(Number)
        const startMinutes = startH * 60 + startM
        const endMinutes = endH * 60 + endM
        let totalMinutes = endMinutes - startMinutes
        if (totalMinutes < 0) totalMinutes += 24 * 60 // Gece yarısını geçtiyse
        totalHours = Math.round((totalMinutes / 60) * 100) / 100
      }
      
      const updateData = {
        endTime: currentTime,
        endSubmittedAt: serverTimestamp(),
        endLocation: location ? {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          timestamp: new Date().toISOString(),
        } : null,
        isOpen: false,
        totalHours: totalHours > 8 ? 8 : totalHours,
        overtimeHours: totalHours > 8 ? totalHours - 8 : 0,
      }
      
      console.log('Updating report with:', updateData)
      await updateDoc(doc(db, 'reports', reportId), updateData)
      
      setEndTimeInput('')
      setWorkActionMsg(t.endRegistered)
      setTimeout(() => setWorkActionMsg(null), 3000)
    } catch (e: any) {
      console.error('End work error:', e)
      setError(lang === 'de' ? `Fehler: ${e.message || 'Speichern fehlgeschlagen'}` : `خطأ: ${e.message || 'فشل الحفظ'}`)
    } finally {
      setSaving(false)
    }
  }

  // Mesai kaydet (başlama ve bitirme birlikte)
  const handleSaveOvertime = async (reportId: string) => {
    if (!deviceAllowed || !deviceId || !reportId) {
      setError(lang === 'de' ? 'Gerät nicht autorisiert' : 'الجهاز غير مصرح')
      return
    }
    
    if (!overtimeStartTimeInput || !overtimeEndTimeInput) {
      setError(lang === 'de' ? 'Bitte beide Zeiten eingeben' : 'يرجى إدخال كلا الوقتين')
      return
    }
    
    setSaving(true)
    setError(null)
    setWorkActionMsg(null)
    
    try {
      const startLocation = await captureLocation()
      
      // Mesai saatini hesapla
      const [startH, startM] = overtimeStartTimeInput.split(':').map(Number)
      const [endH, endM] = overtimeEndTimeInput.split(':').map(Number)
      const startMinutes = startH * 60 + startM
      const endMinutes = endH * 60 + endM
      let totalMinutes = endMinutes - startMinutes
      if (totalMinutes < 0) totalMinutes += 24 * 60
      const overtimeHoursCalc = Math.round((totalMinutes / 60) * 100) / 100
      
      // Bitirme konumunu al
      const endLocation = await captureLocation()
      
      await updateDoc(doc(db, 'reports', reportId), {
        hasOvertime: true,
        isOvertimeOpen: false,
        overtimeStartTime: overtimeStartTimeInput,
        overtimeEndTime: overtimeEndTimeInput,
        overtimeStartSubmittedAt: serverTimestamp(),
        overtimeEndSubmittedAt: serverTimestamp(),
        overtimeStartLocation: startLocation ? {
          latitude: startLocation.latitude,
          longitude: startLocation.longitude,
          accuracy: startLocation.accuracy,
          timestamp: new Date().toISOString(),
        } : null,
        overtimeEndLocation: endLocation ? {
          latitude: endLocation.latitude,
          longitude: endLocation.longitude,
          accuracy: endLocation.accuracy,
          timestamp: new Date().toISOString(),
        } : null,
        overtimeHours: overtimeHoursCalc,
      })
      
      setOvertimeStartTimeInput('')
      setOvertimeEndTimeInput('')
      setShowOvertimePanel(false)
      setWorkActionMsg(t.overtimeEnded)
      setTimeout(() => setWorkActionMsg(null), 3000)
    } catch (e: any) {
      console.error('Save overtime error:', e)
      setError(lang === 'de' ? `Fehler: ${e.message || 'Speichern fehlgeschlagen'}` : `خطأ: ${e.message || 'فشل الحفظ'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleFormChange = (field: keyof typeof form, value: any) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value }
      
      // İzin veya Frei seçildiğinde saatleri sıfırla
      if (field === 'status' && (value === 'urlaub' || value === 'frei')) {
        updated.totalHours = 0
        updated.overtimeHours = 0
      }
      
      return updated
    })
  }

  useEffect(() => {
    // Sadece cihaz türüne göre kontrol - ekran boyutu değil
    const detectMobileDevice = () => {
      if (typeof navigator === 'undefined') return true
      const ua = navigator.userAgent || ''
      
      // Modern API ile kontrol
      const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } }
      if (nav.userAgentData?.mobile !== undefined) {
        return nav.userAgentData.mobile
      }
      
      // User Agent ile mobil cihaz tespiti
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS|FxiOS/i
      return mobileRegex.test(ua)
    }
    
    // Sadece bir kez kontrol et - cihaz türü değişmez
    setIsMobile(detectMobileDevice())
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('tc_device_id')
    if (stored) {
      setDeviceId(stored)
    } else {
      const generated = computeDeviceId()
      localStorage.setItem('tc_device_id', generated)
      setDeviceId(generated)
    }
  }, [])

  useEffect(() => {
    if (!deviceId) return
    const ref = doc(db, 'deviceAccess', deviceId)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setDeviceAllowed(false)
        } else {
          const data = snap.data() as any
          setDeviceAllowed(Boolean(data.allowed))
        }
        setDeviceChecked(true)
      },
      () => {
        setDeviceAllowed(false)
        setDeviceChecked(true)
      },
    )
    return () => unsub()
  }, [db, deviceId])

  // Tatil günlerini çek
  useEffect(() => {
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
  }, [db])

  // Destek taleplerini çek
  useEffect(() => {
    if (!deviceId || !deviceAllowed) return
    const q = query(collection(db, 'supportRequests'), where('deviceId', '==', deviceId), limit(20))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: SupportRequest[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        setSupportRequests(rows)
      },
      (err) => console.error('Support requests fetch error:', err),
    )
    return () => unsub()
  }, [db, deviceId, deviceAllowed])

  // Destek talebi gönder
  const handleSupportSubmit = async () => {
    if (!supportForm.message.trim()) {
      setSupportMsg(lang === 'de' ? 'Bitte geben Sie eine Nachricht ein' : 'يرجى إدخال رسالة')
      return
    }
    if (!deviceId) {
      setSupportMsg(lang === 'de' ? 'Geräte-ID nicht gefunden' : 'لم يتم العثور على معرف الجهاز')
      return
    }
    
    setSupportSending(true)
    setSupportMsg(null)
    try {
      await addDoc(collection(db, 'supportRequests'), {
        deviceId,
        userName: profile.name,
        userEmail: profile.email,
        topic: supportForm.topic,
        relatedDate: supportForm.affectedDate || null,
        affectedDate: supportForm.affectedDate || null, // Eski format için de ekle
        message: supportForm.message.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      setSupportForm({ topic: 'wrongReport', affectedDate: '', message: '' })
      setSupportMsg(t.supportSent)
      setTimeout(() => setSupportMsg(null), 3000)
    } catch (e) {
      console.error('Support submit error:', e)
      setSupportMsg(lang === 'de' ? 'Fehler beim Senden der Anfrage' : 'خطأ في إرسال الطلب')
    } finally {
      setSupportSending(false)
    }
  }

  // Profil bilgilerini deviceRequests'ten çek
  useEffect(() => {
    if (!deviceId || !deviceAllowed) return
    // Tüm deviceRequests'i çek ve client-side filtrele (index problemi önlenir)
    const q = query(collection(db, 'deviceRequests'), limit(500))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const matchingDoc = snap.docs.find((d) => (d.data() as any).deviceId === deviceId)
        if (matchingDoc) {
          const data = matchingDoc.data() as any
          setDeviceRequestId(matchingDoc.id)
          const newPhotoURL = data.photoURL || ''
          setProfile((prev) => {
            // Eğer photoURL değiştiyse, hata durumunu sıfırla
            if (prev.photoURL !== newPhotoURL) {
              setPhotoError(false)
            }
            return {
              name: data.name || '',
              email: data.email || '',
              phone: data.phone || '',
              address: data.address || '',
              photoURL: newPhotoURL,
            }
          })
        }
      },
      (err) => {
        console.error('Profile fetch error:', err)
      }
    )
    return () => unsub()
  }, [db, deviceId, deviceAllowed])

  useEffect(() => {
    if (!deviceAllowed || !deviceId) {
      setReports([])
      setLoading(false)
      return undefined
    }
    // GÜVENLIK: Sadece bu cihaza ait raporları çek
    const q = query(
      collection(db, 'reports'),
      where('deviceId', '==', deviceId),
      limit(60)
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: ReportDoc[] = snap.docs.map((d) => {
          const data = d.data() as any
          return {
            id: d.id,
            date: data.date ?? todayIso,
            totalHours: Number(data.totalHours ?? 0),
            overtimeHours: Number(data.overtimeHours ?? 0),
            status: data.status ?? 'arbeit',
            leaveFrom: data.leaveFrom ?? null,
            leaveTo: data.leaveTo ?? null,
            leaveReason: data.leaveReason ?? null,
            note: data.note ?? '',
            deviceId: data.deviceId ?? null,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
            // Yeni alanlar
            startTime: data.startTime ?? null,
            endTime: data.endTime ?? null,
            startSubmittedAt: data.startSubmittedAt?.toDate ? data.startSubmittedAt.toDate() : null,
            endSubmittedAt: data.endSubmittedAt?.toDate ? data.endSubmittedAt.toDate() : null,
            startLocation: data.startLocation ?? null,
            endLocation: data.endLocation ?? null,
            isOpen: data.isOpen ?? false,
          }
        })
        // Client-side sıralama (index sorunu nedeniyle)
        next.sort((a, b) => b.date.localeCompare(a.date))
        setReports(next)
        
        // Açık raporları ayır (bitiş saati girilmemiş olanlar)
        const openOnes = next.filter((r) => r.isOpen === true)
        setOpenReports(openOnes)
        
        // Bugünün açık raporunu bul
        const todayOpen = openOnes.find((r) => r.date === todayIso)
        setTodayOpenReport(todayOpen || null)
        
        
        setLoading(false)
      },
      (err) => {
        console.error('Reports fetch error:', err)
        setError(lang === 'de' ? 'Laden fehlgeschlagen' : 'فشل التحميل')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [db, todayIso, deviceAllowed, deviceId, lang])

  // Sürekli konum takibi - iş başladığında aktif
  useEffect(() => {
    // Önce mevcut interval'i temizle
    if (locationTrackingIntervalRef.current) {
      console.log('🛑 Clearing existing location tracking interval...')
      window.clearInterval(locationTrackingIntervalRef.current)
      locationTrackingIntervalRef.current = null
    }

    if (!deviceAllowed || !deviceId || !todayOpenReport) {
      // İş başlamadıysa veya cihaz yetkili değilse takibi durdur
      console.log('⏸️ Location tracking paused - missing requirements')
      return
    }

    // İş başladı, konum takibini başlat
    console.log('📍 Starting location tracking for device:', deviceId, 'Report:', todayOpenReport.id)
    
    // İlk konumu hemen kaydet
    captureLocation().then((location) => {
      if (location && deviceId && todayOpenReport) {
        addDoc(collection(db, 'locationTracking'), {
          deviceId,
          reportId: todayOpenReport.id,
          date: todayIso,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          timestamp: serverTimestamp(),
          capturedAt: new Date().toISOString(),
        }).then(() => {
          console.log('✅ First location saved:', location.latitude, location.longitude)
        }).catch((e) => {
          console.error('❌ First location save error:', e)
        })
      }
    }).catch((e) => {
      console.error('❌ First location capture error:', e)
    })
    
    // Her 30 saniyede bir konum kaydet (canlı takip)
    const interval = window.setInterval(async () => {
      try {
        console.log('📍 [Interval] Capturing location...')
        const location = await captureLocation()
        if (location && deviceId && todayOpenReport) {
          console.log('📍 [Interval] Location captured:', location.latitude, location.longitude)
          // Konum verilerini Firestore'a kaydet
          await addDoc(collection(db, 'locationTracking'), {
            deviceId,
            reportId: todayOpenReport.id,
            date: todayIso,
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            timestamp: serverTimestamp(),
            capturedAt: new Date().toISOString(),
          })
          console.log('✅ [Interval] Location saved to Firestore')
        } else {
          console.warn('⚠️ [Interval] No location captured or missing data', { location: !!location, deviceId: !!deviceId, report: !!todayOpenReport })
        }
      } catch (e) {
        console.error('❌ [Interval] Location tracking error:', e)
      }
    }, 30 * 1000) // 30 saniye - canlı takip
    
    locationTrackingIntervalRef.current = interval
    console.log('✅ Location tracking interval started:', interval, 'Every 30 seconds')

    return () => {
      console.log('🧹 Cleanup: Stopping location tracking...')
      if (locationTrackingIntervalRef.current) {
        window.clearInterval(locationTrackingIntervalRef.current)
        locationTrackingIntervalRef.current = null
        console.log('✅ Location tracking interval cleared')
      }
    }
  }, [deviceAllowed, deviceId, todayOpenReport?.id, todayIso, db])

  const handleSave = async () => {
    // Güvenlik kontrolü
    if (!deviceAllowed || !deviceId) {
      setError(lang === 'de' ? 'Gerät nicht autorisiert' : 'الجهاز غير مصرح')
      return
    }
    
    // Form doğrulama
    if (!form.date) {
      setError(lang === 'de' ? 'Bitte Datum wählen' : 'يرجى اختيار التاريخ')
      return
    }
    if (form.status === 'arbeit' && (form.totalHours < 0 || form.totalHours > 24)) {
      setError(lang === 'de' ? 'Ungültige Stundenzahl' : 'عدد ساعات غير صالح')
      return
    }
    if (form.status === 'urlaub' && (!form.leaveFrom || !form.leaveTo)) {
      setError(lang === 'de' ? 'Urlaubszeitraum auswählen' : 'يرجى اختيار فترة الإجازة')
      return
    }

    setSaving(true)
    setError(null)
    try {
      // İzin talebi ise leaveRequests koleksiyonuna kaydet
      if (form.status === 'urlaub') {
        const leaveRequestData = {
          deviceId,
          userName: profile.name,
          userEmail: profile.email,
          leaveFrom: form.leaveFrom,
          leaveTo: form.leaveTo,
          leaveReason: (form.leaveReason || '').slice(0, 500),
          status: 'pending', // pending, approved, rejected
          createdAt: serverTimestamp(),
        }
        await addDoc(collection(db, 'leaveRequests'), leaveRequestData)
      } else {
        // Normal rapor veya frei - direkt reports'a kaydet
        const reportData = {
          date: form.date.trim(),
          totalHours: Math.max(0, Math.min(24, Number(form.totalHours) || 0)),
          overtimeHours: Math.max(0, Math.min(12, Number(form.overtimeHours) || 0)),
          status: form.status || 'arbeit',
          note: (form.note || '').slice(0, 500),
          leaveFrom: null,
          leaveTo: null,
          leaveReason: null,
          deviceId,
          createdAt: serverTimestamp(),
        }
        await addDoc(collection(db, 'reports'), reportData)
      }
      
      // Başarılı - formu sıfırla
      setForm((prev) => ({
        ...prev,
        date: '',
        totalHours: 8,
        overtimeHours: 0,
        status: 'arbeit',
        note: '',
        leaveFrom: '',
        leaveTo: '',
        leaveReason: '',
      }))
      
      // İzin talebi gönderildi mesajı
      if (form.status === 'urlaub') {
        setError(lang === 'de' ? '✓ Urlaubsantrag gesendet - wartet auf Genehmigung' : '✓ تم إرسال طلب الإجازة - في انتظار الموافقة')
      }
    } catch (e: any) {
      console.error('Save error:', e)
      setError(lang === 'de' ? 'Speichern fehlgeschlagen' : 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  // Profil düzenleme fonksiyonları
  const startProfileEdit = () => {
    setProfileForm({
      name: profile.name,
      phone: profile.phone,
      address: profile.address,
    })
    setProfileEditing(true)
    setProfileMsg(null)
  }

  const cancelProfileEdit = () => {
    setProfileEditing(false)
    setProfileMsg(null)
  }

  const handleProfilePhotoUpload = async (file: File) => {
    if (!deviceRequestId) {
      setProfileMsg('❌ Keine ID')
      return
    }
    
    if (!file || file.size === 0) {
      setProfileMsg('❌ Keine Datei')
      return
    }
    
    setProfileUploading(true)
    setProfileMsg('📤 1/3 Hochladen...')
    
    try {
      // Dosya uzantısını al - mobil için fallback
      let ext = 'jpg'
      if (file.name && file.name.includes('.')) {
        ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      } else if (file.type) {
        const mimeMap: Record<string, string> = {
          'image/jpeg': 'jpg',
          'image/jpg': 'jpg',
          'image/png': 'png',
          'image/gif': 'gif',
          'image/webp': 'webp',
        }
        ext = mimeMap[file.type] || 'jpg'
      }
      
      const timestamp = Date.now()
      const fileName = `${deviceRequestId}_${timestamp}.${ext}`
      const storageRef = ref(storage, `profile-photos/${fileName}`)
      const contentType = file.type || 'image/jpeg'
      
      // 1. Storage'a yükle
      await uploadBytes(storageRef, file, { contentType })
      setProfileMsg('📥 2/3 URL alınıyor...')
      
      // 2. URL al
      const url = await getDownloadURL(storageRef)
      setProfileMsg('💾 3/3 Kaydediliyor...')
      
      // 3. Firestore'a kaydet
      await updateDoc(doc(db, 'deviceRequests', deviceRequestId), { 
        photoURL: url,
        updatedAt: serverTimestamp(),
      })
      
      // State'i hemen güncelle
      setProfile((prev) => ({ ...prev, photoURL: url }))
      setPhotoError(false)
      
      // Admin'e bildirim gönder
      await addDoc(collection(db, 'notifications'), {
        type: 'photo_update',
        deviceRequestId,
        deviceId,
        userName: profile.name,
        userEmail: profile.email,
        changes: ['photoURL'],
        message: lang === 'de' 
          ? `${profile.name || profile.email} hat das Profilfoto aktualisiert`
          : `${profile.name || profile.email} قام بتحديث صورة الملف الشخصي`,
        read: false,
        createdAt: serverTimestamp(),
      })
      
      setProfileMsg('✅ Gespeichert!')
    } catch (e: any) {
      const errorMsg = e?.code || e?.message || 'Unbekannt'
      setProfileMsg(`❌ Fehler: ${errorMsg}`)
    } finally {
      setProfileUploading(false)
    }
  }

  const handleProfileSave = async () => {
    if (!deviceRequestId) return
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      await updateDoc(doc(db, 'deviceRequests', deviceRequestId), {
        name: profileForm.name.trim(),
        phone: profileForm.phone.trim(),
        address: profileForm.address.trim(),
        updatedAt: serverTimestamp(),
      })
      // Admin'e bildirim gönder
      await addDoc(collection(db, 'notifications'), {
        type: 'profile_update',
        deviceRequestId,
        deviceId,
        userName: profileForm.name.trim(),
        userEmail: profile.email,
        changes: ['name', 'phone', 'address'],
        message: lang === 'de' 
          ? `${profileForm.name.trim()} hat Profilinformationen aktualisiert`
          : `${profileForm.name.trim()} قام بتحديث معلومات الملف الشخصي`,
        read: false,
        createdAt: serverTimestamp(),
      })
      setProfileMsg(t.saved)
      setProfileEditing(false)
    } catch (e) {
      console.error('Save profile error:', e)
    } finally {
      setProfileSaving(false)
    }
  }

  const { days: monthDaysList, monthLabel, weekdays } = monthDays(monthAnchor || todayIso, lang)
  const { days: leaveDaysList, monthLabel: leaveMonthLabel, weekdays: leaveWeekdays } = monthDays(leaveAnchor || todayIso, lang)
  const todayLabel = `${t.todayLabel}, ${formatTodayLabel(lang)}`
  const recentReports = reports.slice(0, 3)
  const loadingText = lang === 'de' ? 'Lädt...' : 'جاري التحميل...'
  const emptyText = lang === 'de' ? 'Noch kein Eintrag' : 'لا يوجد تسجيل'
  const changeMonth = (delta: number) => {
    setMonthAnchor((prev) => {
      const [y, m] = prev.split('-').map(Number)
      const next = new Date(Date.UTC(y, (m - 1) + delta, 1)).toISOString().slice(0, 10)
      return next
    })
  }

  const changeLeaveMonth = (delta: number) => {
    setLeaveAnchor((prev) => {
      const [y, m] = prev.split('-').map(Number)
      const next = new Date(Date.UTC(y, (m - 1) + delta, 1)).toISOString().slice(0, 10)
      return next
    })
  }

  const selectLeaveDate = (iso: string) => {
    if (!form.leaveFrom || leaveSelecting === 'from') {
      setForm((prev) => ({ ...prev, leaveFrom: iso, leaveTo: '' }))
      setLeaveSelecting('to')
      setLeaveAnchor(iso)
      return
    }
    if (!form.leaveTo || leaveSelecting === 'to') {
      if (iso < form.leaveFrom) {
        setForm((prev) => ({ ...prev, leaveFrom: iso, leaveTo: prev.leaveFrom }))
      } else {
        setForm((prev) => ({ ...prev, leaveTo: iso }))
      }
      setLeaveSelecting('from')
      setLeaveAnchor(iso)
    }
  }

  const renderHours = () => {
    // Mevcut ay için hesaplamalar
    const now = new Date()
    
    // DEBUG: Tüm raporları göster (tarih filtresi olmadan)
    const monthlyReports = reports
    
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

    return (
      <div className="stack">
        <section className="panel">
          <div className="section-title">{t.monthlyTotal}</div>
          <div className="hours-month-label">{monthName}</div>
          
          <div className="hours-summary-grid">
            <div className="hours-card hours-card--primary">
              <div className="hours-card__value">{formatDecimalHours(totalWorkHours)}</div>
              <div className="hours-card__label">{t.totalWorkHours}</div>
            </div>
            <div className="hours-card hours-card--warning">
              <div className="hours-card__value">{formatDecimalHours(totalOvertimeHours)}</div>
              <div className="hours-card__label">{t.totalOvertime}</div>
            </div>
            <div className="hours-card hours-card--success">
              <div className="hours-card__value">{formatDecimalHours(totalCombined)}</div>
              <div className="hours-card__label">{t.totalCombined}</div>
            </div>
          </div>

          <div className="hours-days-grid">
            <div className="hours-day-item">
              <span className="hours-day-icon">💼</span>
              <span className="hours-day-count">{workDays}</span>
              <span className="hours-day-label">{t.workDays}</span>
            </div>
            <div className="hours-day-item">
              <span className="hours-day-icon">🏖️</span>
              <span className="hours-day-count">{leaveDays}</span>
              <span className="hours-day-label">{t.leaveDays}</span>
            </div>
            <div className="hours-day-item">
              <span className="hours-day-icon">🌙</span>
              <span className="hours-day-count">{offDays}</span>
              <span className="hours-day-label">{t.offDays}</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-title">{t.thisMonth}</div>
          {loading ? (
            <div className="list-note">{lang === 'de' ? 'Lädt...' : 'جاري التحميل...'}</div>
          ) : monthlyReports.length === 0 ? (
            <div className="list-note">{t.noReports}</div>
          ) : (
            <div className="hours-list">
              {monthlyReports.map((r) => (
                <div key={r.id} className="hours-list-item">
                  <div className="hours-list-date">{formatDateLabel(r.date, lang)}</div>
                  <div className="hours-list-status">
                    {r.status === 'urlaub' ? '🏖️' : r.status === 'frei' ? '🌙' : '💼'}
                  </div>
                  <div className="hours-list-hours">
                    <span className="hours-main">{formatDecimalHours(r.totalHours)}</span>
                    {(r.overtimeHours ?? 0) > 0 && (
                      <span className="hours-overtime">+{formatDecimalHours(r.overtimeHours ?? 0)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    )
  }

  const renderProfile = () => (
    <div className="stack">
      <section className="panel profile-panel">
        <div className="section-title">{t.myProfile}</div>
        
        <div className="profile-card">
          <div className="profile-photo-wrapper">
            {profile.photoURL && !photoError ? (
              <img 
                src={profile.photoURL} 
                alt="" 
                className="profile-photo-large" 
                onError={() => setPhotoError(true)}
              />
            ) : (
              <div className="profile-photo-placeholder-large">👤</div>
            )}
            <label className="photo-upload-label">
              {profileUploading ? t.uploading : t.uploadPhoto}
              <input
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleProfilePhotoUpload(file)
                }}
              />
            </label>
          </div>

          {profileEditing ? (
            <div className="profile-form">
              <label className="form-field form-field--full">
                <span>{t.name}</span>
                <input
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                />
              </label>
              <label className="form-field form-field--full">
                <span>{t.phone}</span>
                <input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </label>
              <label className="form-field form-field--full">
                <span>{t.address}</span>
                <input
                  value={profileForm.address}
                  onChange={(e) => setProfileForm((p) => ({ ...p, address: e.target.value }))}
                />
              </label>
              <div className="profile-actions">
                <button className="btn btn-primary" onClick={handleProfileSave} disabled={profileSaving}>
                  {profileSaving ? '...' : t.saveProfile}
                </button>
                <button className="btn btn-secondary" onClick={cancelProfileEdit}>
                  {t.cancelEdit}
                </button>
              </div>
              {profileMsg && <div className="profile-msg">{profileMsg}</div>}
            </div>
          ) : (
            <div className="profile-info-display">
              <div className="profile-name-large">{profile.name || '-'}</div>
              <div className="profile-detail"><strong>{t.email}:</strong> {profile.email || '-'}</div>
              <div className="profile-detail"><strong>{t.phone}:</strong> {profile.phone || '-'}</div>
              <div className="profile-detail"><strong>{t.address}:</strong> {profile.address || '-'}</div>
              <div className="profile-detail"><strong>{t.deviceVerifiedId}:</strong> {deviceId}</div>
              <button className="btn btn-secondary" onClick={startProfileEdit} style={{ marginTop: 12 }}>
                {t.editProfile}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )

  const renderSupport = () => {
    const getTopicLabel = (topic: string) => {
      switch (topic) {
        case 'wrongReport':
        case 'wrong_report':
          return t.supportTopicWrongReport
        case 'wrongLeave':
        case 'wrong_leave':
          return t.supportTopicWrongLeave
        case 'resetAccount':
        case 'reset_account':
          return t.supportTopicResetAccount
        case 'changeDevice':
        case 'change_device':
          return t.supportTopicChangeDevice
        default:
          return t.supportTopicOther
      }
    }

    const formatSupportDate = (date: any) => {
      if (!date) return '-'
      if (date.toDate) {
        return date.toDate().toLocaleDateString(lang === 'de' ? 'de-DE' : 'ar')
      }
      if (date.seconds) {
        return new Date(date.seconds * 1000).toLocaleDateString(lang === 'de' ? 'de-DE' : 'ar')
      }
      return String(date)
    }

    return (
      <div className="stack">
        {/* Destek İsteği Formu */}
        <section className="panel support-form-panel">
          <div className="section-title">{t.supportTitle}</div>
          <div className="support-hint">{t.supportHint}</div>
          
          <div className="form-stack">
            <label className="form-field form-field--full">
              <span>{t.supportTopic}</span>
              <select
                value={supportForm.topic}
                onChange={(e) => setSupportForm((prev) => ({ ...prev, topic: e.target.value }))}
                className="form-select"
              >
                <option value="wrongReport">{t.supportTopicWrongReport}</option>
                <option value="wrongLeave">{t.supportTopicWrongLeave}</option>
                <option value="resetAccount">{t.supportTopicResetAccount}</option>
                <option value="changeDevice">{t.supportTopicChangeDevice}</option>
                <option value="other">{t.supportTopicOther}</option>
              </select>
            </label>

            <label className="form-field form-field--full">
              <span>{t.supportDate}</span>
              <input
                type="date"
                value={supportForm.affectedDate}
                onChange={(e) => setSupportForm((prev) => ({ ...prev, affectedDate: e.target.value }))}
                className="form-input"
              />
            </label>

            <label className="form-field form-field--full">
              <span>{t.supportMessage}</span>
              <textarea
                value={supportForm.message}
                onChange={(e) => setSupportForm((prev) => ({ ...prev, message: e.target.value }))}
                placeholder={lang === 'de' ? 'Beschreiben Sie Ihr Problem...' : 'وصف مشكلتك...'}
                rows={5}
                className="form-textarea"
              />
            </label>

            {supportMsg && (
              <div className={`support-msg ${supportMsg === t.supportSent ? 'success' : 'error'}`}>
                {supportMsg}
              </div>
            )}

            <button
              className="btn btn-primary btn-full"
              onClick={handleSupportSubmit}
              disabled={supportSending || !supportForm.message.trim()}
            >
              {supportSending ? (lang === 'de' ? 'Wird gesendet...' : 'جاري الإرسال...') : t.supportSend}
            </button>
          </div>
        </section>

        {/* Destek İstekleri Listesi */}
        <section className="panel support-requests-panel">
          <div className="section-title">{t.mySupportRequests}</div>
          
          {supportRequests.length === 0 ? (
            <div className="empty-state">{t.noSupportRequests}</div>
          ) : (
            <div className="support-requests-list">
              {supportRequests.map((req) => (
                <div key={req.id} className={`support-request-item ${req.status === 'resolved' ? 'resolved' : 'pending'}`}>
                  <div className="support-request-header">
                    <div className="support-request-topic">
                      {getTopicLabel(req.topic)}
                    </div>
                    <div className={`support-request-status ${req.status}`}>
                      {req.status === 'pending' ? t.supportStatusPending : t.supportStatusResolved}
                    </div>
                  </div>
                  
                  {(req.affectedDate || req.relatedDate) && (
                    <div className="support-request-date">
                      <span className="support-label">{t.supportDate}:</span>
                      <span className="support-value">{formatDateLabel(req.affectedDate || req.relatedDate || '', lang)}</span>
                    </div>
                  )}
                  
                  <div className="support-request-message">
                    {req.message}
                  </div>
                  
                  {req.createdAt && (
                    <div className="support-request-created">
                      {formatSupportDate(req.createdAt)}
                    </div>
                  )}
                  
                  {req.adminResponse && (
                    <div className="support-admin-response">
                      <div className="support-admin-label">
                        {lang === 'de' ? 'Antwort vom Administrator:' : 'رد من المسؤول:'}
                      </div>
                      <div className="support-admin-text">{req.adminResponse}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    )
  }

  const renderHome = () => (
    <div className="stack">
      <section className="panel hero">
        <div className="hero__brand">TOP Clean • Service</div>
        <div className="hero__headline">{t.heroHeadline}</div>
        <div className="hero__meta">{todayLabel}</div>
      </section>

      {/* Yeni: Bugünkü İş Durumu Paneli */}
      <section className="panel work-status-panel">
        <div className="section-title">{t.todayEntry}</div>
        
        {workActionMsg && (
          <div className="work-action-msg success">{workActionMsg}</div>
        )}
        
        {locationCapturing && (
          <div className="location-status capturing">
            <span className="location-spinner">📍</span>
            {t.locationCapturing}
          </div>
        )}
        
        {(() => {
          // Bugünün raporunu bul
          const todayReport = reports.find((r) => r.date === todayIso)
          
          // Debug için konsola yazdır
          console.log('Work Status Debug:', {
            todayIso,
            todayReport: todayReport ? {
              id: todayReport.id,
              isOpen: todayReport.isOpen,
              hasOvertime: todayReport.hasOvertime,
              isOvertimeOpen: todayReport.isOvertimeOpen,
              overtimeStartTime: todayReport.overtimeStartTime,
              overtimeEndTime: todayReport.overtimeEndTime,
            } : null,
            todayOpenReport: todayOpenReport?.id,
            showOvertimePanel,
          })
          
          // ===== DURUM BELİRLEME =====
          // Mesai devam ediyor mu? (overtimeStartTime var ama overtimeEndTime yok)
          const isOvertimeInProgress = todayReport && 
            todayReport.overtimeStartTime && 
            !todayReport.overtimeEndTime &&
            (todayReport.isOvertimeOpen === true || todayReport.isOvertimeOpen === undefined) // isOvertimeOpen true veya undefined ise devam ediyor
          
          // Normal iş devam ediyor mu?
          const isWorkInProgress = todayOpenReport && todayOpenReport.isOpen === true
          
          // Gün tamamen bitti mi?
          const isDayComplete = todayReport && 
            !todayReport.isOpen && 
            !isOvertimeInProgress &&
            (todayReport.hasOvertime === false || 
             (todayReport.overtimeStartTime && todayReport.overtimeEndTime))
          
          // Normal iş bitti mi? (mesai yok veya mesai tamamlandı)
          const isNormalWorkCompleted = todayReport && 
            !todayReport.isOpen && 
            !todayReport.overtimeStartTime
          
          // ===== RENDER =====
          
          // 1. NORMAL İŞ DEVAM EDİYOR
          if (isWorkInProgress && todayOpenReport) {
            return (
              <div className="work-active">
                <div className="work-active__status">
                  <span className="work-active__icon">🟢</span>
                  <span className="work-active__text">{t.workInProgress}</span>
                </div>
                <div className="work-active__info">
                  <span className="work-active__label">{t.startTime}:</span>
                  <span className="work-active__value">{todayOpenReport.startTime}</span>
                </div>
                {todayOpenReport.startLocation && (
                  <div className="work-active__location">
                    📍 {todayOpenReport.startLocation.latitude.toFixed(4)}, {todayOpenReport.startLocation.longitude.toFixed(4)}
                  </div>
                )}
                <div className="work-end-section">
                  <label className="form-field">
                    <span>{t.endTime}</span>
                    <input
                      type="time"
                      value={endTimeInput}
                      onChange={(e) => setEndTimeInput(e.target.value)}
                      placeholder="--:--"
                    />
                  </label>
                  <button
                    className="btn btn-danger btn-end-work"
                    onClick={() => handleEndWork(todayOpenReport.id)}
                    disabled={saving || locationCapturing}
                  >
                    {saving ? '...' : t.endWork}
                  </button>
                </div>
              </div>
            )
          }
          
          // 2. NORMAL İŞ BİTTİ - MESAİ CHECKBOX
          if (isNormalWorkCompleted && todayReport) {
            return (
              <div className="work-completed">
                <div className="work-completed-status">
                  <span className="work-completed-icon">✅</span>
                  <span className="work-completed-text">{t.normalWorkEnded}</span>
                </div>
                
                {/* Normal çalışma özeti */}
                <div className="work-summary-mini">
                  <span>💼 {todayReport.startTime} → {todayReport.endTime}</span>
                  <span className="work-summary-hours">{formatDecimalHours(todayReport.totalHours)}</span>
                </div>
                
                {/* Mesai checkbox */}
                <div className="overtime-checkbox-section">
                  <label className="overtime-checkbox-label">
                    <input
                      type="checkbox"
                      checked={showOvertimePanel}
                      onChange={(e) => setShowOvertimePanel(e.target.checked)}
                      className="overtime-checkbox"
                    />
                    <span className="overtime-checkbox-text">⏱️ {t.addOvertime}</span>
                  </label>
                  
                  {/* Mesai paneli */}
                  {showOvertimePanel && (
                    <div className="overtime-panel">
                      <label className="form-field">
                        <span>{t.startTime}</span>
                        <input
                          type="time"
                          value={overtimeStartTimeInput}
                          onChange={(e) => setOvertimeStartTimeInput(e.target.value)}
                          placeholder="--:--"
                        />
                      </label>
                      <label className="form-field">
                        <span>{t.endTime}</span>
                        <input
                          type="time"
                          value={overtimeEndTimeInput}
                          onChange={(e) => setOvertimeEndTimeInput(e.target.value)}
                          placeholder="--:--"
                        />
                      </label>
                      <button
                        className="btn btn-warning"
                        onClick={() => handleSaveOvertime(todayReport.id)}
                        disabled={saving || locationCapturing || !overtimeStartTimeInput || !overtimeEndTimeInput}
                      >
                        {saving ? '...' : t.saveOvertime || 'Mesai Kaydet'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          }
          
          // 3. GÜN TAMAMLANDI (mesai dahil)
          if (isDayComplete && todayReport) {
            return (
              <div className="work-completed">
                <div className="work-completed-status">
                  <span className="work-completed-icon">🎉</span>
                  <span className="work-completed-text">{t.workCompleted}</span>
                </div>
                <div className="work-times-summary completed">
                  <div className="time-row">
                    <span className="time-label">{t.statusWork}:</span>
                    <span className="time-value">{todayReport.startTime} → {todayReport.endTime}</span>
                    <span className="time-hours">{formatDecimalHours(todayReport.totalHours)}</span>
                  </div>
                  {todayReport.overtimeStartTime && todayReport.overtimeEndTime && (
                    <div className="time-row overtime-row">
                      <span className="time-label">{t.overtimeTime}:</span>
                      <span className="time-value">{todayReport.overtimeStartTime} → {todayReport.overtimeEndTime}</span>
                      <span className="time-hours overtime-hours">{formatDecimalHours(todayReport.overtimeHours ?? 0)}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          }
          
          // 5. İŞ BAŞLAMADI
          if (!todayReport) {
            return (
              <div className="work-start-section">
                <div className="work-not-started">
                  <span className="work-not-started__icon">⏸️</span>
                  <span className="work-not-started__text">{t.workNotStarted}</span>
                </div>
                <label className="form-field">
                  <span>{t.startTime}</span>
                  <input
                    type="time"
                    value={startTimeInput}
                    onChange={(e) => setStartTimeInput(e.target.value)}
                    placeholder="--:--"
                  />
                </label>
                <button
                  className="btn btn-primary btn-start-work"
                  onClick={handleStartWork}
                  disabled={saving || locationCapturing}
                >
                  {saving ? '...' : t.startWork}
                </button>
              </div>
            )
          }
          
          // 6. BEKLENMEDİK DURUM - Debug bilgisi göster
          return (
            <div className="work-loading">
              <div style={{ textAlign: 'center' }}>
                <div>⚠️ {lang === 'de' ? 'Unerwarteter Zustand' : 'حالة غير متوقعة'}</div>
                <div style={{ fontSize: '11px', marginTop: '8px', color: '#666' }}>
                  isOpen: {String(todayReport?.isOpen)} | 
                  hasOvertime: {String(todayReport?.hasOvertime)} | 
                  overtimeStart: {todayReport?.overtimeStartTime || 'null'} | 
                  overtimeEnd: {todayReport?.overtimeEndTime || 'null'}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '12px' }}
                  onClick={() => window.location.reload()}
                >
                  {lang === 'de' ? 'Seite neu laden' : 'إعادة تحميل'}
                </button>
              </div>
            </div>
          )
        })()}
        
        {error && <div className="form-error">{error}</div>}
      </section>

      {/* Açık Kayıtlar (önceki günlerden bitirilmemiş) */}
      {openReports.filter((r) => r.date !== todayIso).length > 0 && (
        <section className="panel open-entries-panel">
          <div className="section-title">
            {t.openEntries}
            <span className="badge">{openReports.filter((r) => r.date !== todayIso).length}</span>
          </div>
          <div className="open-entries-list">
            {openReports.filter((r) => r.date !== todayIso).map((report) => (
              <div key={report.id} className="open-entry-item">
                <div className="open-entry-info">
                  <div className="open-entry-date">{formatDateLabel(report.date, lang)}</div>
                  <div className="open-entry-time">{t.startTime}: {report.startTime}</div>
                </div>
                <button
                  className="btn btn-sm btn-complete"
                  onClick={() => handleEndWork(report.id)}
                  disabled={saving || locationCapturing}
                >
                  {t.completeEntry}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-title">{t.profileTitle}</div>
        <div className="profile-row">
          {profile.photoURL && !photoError ? (
            <img 
              src={profile.photoURL} 
              alt="" 
              className="profile-avatar-img" 
              onError={() => setPhotoError(true)}
            />
          ) : (
            <div className="profile-avatar" aria-hidden>👤</div>
          )}
          <div>
            <div className="profile-name">{profile.name || (lang === 'de' ? 'Mitarbeiter' : 'موظف')}</div>
            <div className="profile-role">Personal</div>
            {profile.email ? <div className="profile-meta">{profile.email}</div> : null}
          </div>
          <div className="chip chip--solid">{deviceAllowed ? (lang === 'de' ? 'Aktiv' : 'مفعّل') : lang === 'de' ? 'Gesperrt' : 'مغلق'}</div>
        </div>
      </section>

      <section className="panel manual-entry-panel">
        <div className="section-title">{t.manualEntry}</div>
        <div className="manual-entry-hint">{t.manualEntryHint}</div>
        <div className="calendar-header">
          <button type="button" className="cal-nav" onClick={() => changeMonth(-1)} aria-label="Voriger Monat">
            ‹
          </button>
          <div className="calendar-month">{monthLabel}</div>
          <button type="button" className="cal-nav" onClick={() => changeMonth(1)} aria-label="Nächster Monat">
            ›
          </button>
        </div>
        <div className="calendar-sub">
          <div className="calendar-today">{todayLabel}</div>
          <div className="calendar-today">
            {form.date ? `${t.selectedDay}: ${form.date}` : t.dateHint}
          </div>
        </div>
        <div className="calendar-weekdays">
          {weekdays.map((w) => (
            <span key={w} className="calendar-weekday">
              {w}
            </span>
          ))}
        </div>
        <div className="calendar-grid">
          {monthDaysList.map((iso, index) => {
            // Boş hücre (ayın başındaki boşluklar)
            if (iso === null) {
              return <div key={`empty-${index}`} className="calendar-day calendar-day--empty" />
            }
            
            const isSelected = iso === form.date
            const hasEntry = reports.some((r) => r.date === iso)
            const holiday = holidays.find((h) => h.date === iso)
            const isHoliday = !!holiday
            return (
              <button
                key={iso}
                className={`calendar-day ${isSelected ? 'is-selected' : ''} ${hasEntry ? 'has-entry' : ''} ${isHoliday ? 'is-holiday' : ''}`}
                onClick={() => {
                  if (isHoliday) {
                    setSelectedHolidayNote(holiday.note)
                    setTimeout(() => setSelectedHolidayNote(null), 3000)
                  } else {
                    handleFormChange('date', iso)
                    setSelectedHolidayNote(null)
                  }
                }}
                disabled={isHoliday}
                title={isHoliday ? holiday.note : undefined}
              >
                <span className="calendar-day__num">{iso.split('-')[2]}</span>
                {isHoliday && <span className="calendar-day__holiday">🎄</span>}
              </button>
            )
          })}
        </div>
        {selectedHolidayNote && (
          <div className="holiday-toast">
            {selectedHolidayNote}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-title">{t.reportTitle}</div>
        <div className="summary-card">
          <div>
            <div className="summary-title">{t.selectedDay}</div>
            <div className="summary-value">{form.date || t.dateHint}</div>
            <div className="summary-meta">{t.workSummary}</div>
          </div>
        </div>
        {form.date ? (
          <>
            <div className="card-group">
              <div className="card-block">
                <div className="time-grid">
                  <label className="form-field">
                    <span>{t.hoursLabel}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={form.totalHours}
                      onChange={(e) => handleFormChange('totalHours', parseFloat(e.target.value))}
                      disabled={form.status === 'urlaub' || form.status === 'frei'}
                      style={form.status !== 'arbeit' ? { opacity: 0.5, background: '#f0f0f0' } : undefined}
                    />
                  </label>
                  <label className="form-field">
                    <span>{t.overtimeLabel}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={form.overtimeHours}
                      onChange={(e) => handleFormChange('overtimeHours', parseFloat(e.target.value))}
                      disabled={form.status === 'urlaub' || form.status === 'frei'}
                      style={form.status !== 'arbeit' ? { opacity: 0.5, background: '#f0f0f0' } : undefined}
                    />
                  </label>
                </div>
              </div>

              <div className="card-block">
            <div className="time-grid">
              <label className="form-field">
                <span>{t.status}</span>
                <select value={form.status} onChange={(e) => handleFormChange('status', e.target.value as ReportDoc['status'])}>
                  <option value="arbeit">{t.statusWork}</option>
                  <option value="urlaub">{t.statusLeave}</option>
                  <option value="frei">{t.statusOff}</option>
                </select>
              </label>
              <label className="form-field">
                <span>{t.note}</span>
                <textarea
                  value={form.note}
                  onChange={(e) => handleFormChange('note', e.target.value)}
                  rows={3}
                  placeholder={t.notePlaceholder}
                />
              </label>
            </div>

            {form.status === 'urlaub' && (
              <div className="card-block">
                <div className="section-title" style={{ marginBottom: 6 }}>{t.statusLeave}</div>
                <div className="calendar-header">
                  <button type="button" className="cal-nav" onClick={() => changeLeaveMonth(-1)} aria-label="Prev leave month">
                    ‹
                  </button>
                  <div className="calendar-month">{leaveMonthLabel}</div>
                  <button type="button" className="cal-nav" onClick={() => changeLeaveMonth(1)} aria-label="Next leave month">
                    ›
                  </button>
                </div>
                <div className="calendar-weekdays">
                  {leaveWeekdays.map((w) => (
                    <span key={w} className="calendar-weekday">
                      {w}
                    </span>
                  ))}
                </div>
                <div className="calendar-grid">
                  {leaveDaysList.map((iso, index) => {
                    // Boş hücre (ayın başındaki boşluklar)
                    if (iso === null) {
                      return <div key={`leave-empty-${index}`} className="calendar-day calendar-day--empty" />
                    }
                    
                    const isFrom = iso === form.leaveFrom
                    const isTo = iso === form.leaveTo
                    const inRange = form.leaveFrom && form.leaveTo && iso >= form.leaveFrom && iso <= form.leaveTo
                    return (
                      <button
                        key={iso}
                        className={`calendar-day ${isFrom || isTo ? 'is-selected' : ''} ${inRange ? 'has-entry' : ''}`}
                        onClick={() => selectLeaveDate(iso)}
                        type="button"
                      >
                        <span className="calendar-day__num">{iso.split('-')[2]}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="time-grid" style={{ marginTop: 12 }}>
                  <label className="form-field">
                    <span>{t.leaveFrom}</span>
                    <input type="text" value={form.leaveFrom} readOnly />
                  </label>
                  <label className="form-field">
                    <span>{t.leaveTo}</span>
                    <input type="text" value={form.leaveTo} readOnly />
                  </label>
                </div>
                <label className="form-field form-field--full" style={{ marginTop: 10 }}>
                  <span>{t.leaveReason}</span>
                  <textarea
                    value={form.leaveReason}
                    onChange={(e) => handleFormChange('leaveReason', e.target.value)}
                    rows={3}
                    placeholder={t.leaveReason}
                  />
                </label>
              </div>
            )}
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="cta-row">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '...' : t.save}
              </button>
            </div>
          </>
        ) : (
          <div className="list-note" style={{ textAlign: 'center' }}>
            {t.dateHint}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-title">{t.recent}</div>
        <div className="list">
          {loading ? (
            <div className="list-note">{loadingText}</div>
          ) : recentReports.length === 0 ? (
            <div className="list-note">{emptyText}</div>
          ) : (
            recentReports.map((item) => (
              <div key={item.id} className="list-item">
                <div>
                  <div className="list-title">{formatDateLabel(item.date, lang)}</div>
                  <div className="list-note">
                    {item.status === 'urlaub' ? t.statusLeave : item.status === 'frei' ? t.statusOff : t.statusWork}
                    {item.status === 'urlaub' && item.leaveFrom && item.leaveTo ? (
                      <span> • {item.leaveFrom} → {item.leaveTo}</span>
                    ) : null}
                  </div>
                </div>
                <div className="list-meta">
                  <span className="chip chip--ghost">
                    {formatDecimalHours(item.totalHours + (item.overtimeHours ?? 0))}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )

  if (!isMobile) {
    return (
      <div className="desktop-block">
        <div className="desktop-block__panel">
          <div className="desktop-block__title">{t.desktopBlockTitle}</div>
          <div className="desktop-block__desc">{t.desktopBlockDesc}</div>
        </div>
      </div>
    )
  }

  if (!deviceChecked) {
    return (
      <div className="desktop-block">
        <div className="desktop-block__panel">
          <div className="desktop-block__title">{t.checkingAccess}</div>
          {deviceId ? <div className="device-id-inline">{deviceId}</div> : null}
        </div>
      </div>
    )
  }

  if (!deviceAllowed) {
    return (
      <div className="desktop-block">
        <div className="desktop-block__panel waiting-panel">
          <div className="waiting-icon">⏳</div>
          <div className="desktop-block__title">
            {lang === 'de' ? 'Warten auf Genehmigung' : 'في انتظار الموافقة'}
          </div>
          <div className="desktop-block__desc">
            {lang === 'de' 
              ? 'Ihre Registrierung wurde gesendet. Bitte warten Sie auf die Genehmigung des Administrators.'
              : 'تم إرسال تسجيلك. يرجى انتظار موافقة المسؤول.'}
          </div>
          <div className="waiting-loader">
            <div className="loader-dot"></div>
            <div className="loader-dot"></div>
            <div className="loader-dot"></div>
          </div>
          {deviceId ? <div className="device-id-inline">{deviceId}</div> : null}
          <div className="waiting-hint">
            {lang === 'de' 
              ? 'Die Seite wird automatisch aktualisiert, sobald Sie genehmigt wurden.'
              : 'سيتم تحديث الصفحة تلقائيًا بمجرد الموافقة عليك.'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="app-content">
        <header className="topbar">
          <div className="topbar__row">
            <div>
              <div className="topbar__title">{t.topbarTitle}</div>
              <div className="topbar__subtitle">{t.topbarSubtitle}</div>
            </div>
            <div className={`lang-switch ${langAnimating ? 'is-animating' : ''}`}>
              <button 
                className={`lang-btn ${lang === 'de' ? 'is-active' : ''}`} 
                onClick={() => switchLang('de')}
              >
                <img src="/flag-de.svg" alt="DE" className="lang-flag-img" />
                <span className="lang-code">DE</span>
              </button>
              <button 
                className={`lang-btn ${lang === 'ar' ? 'is-active' : ''}`} 
                onClick={() => switchLang('ar')}
              >
                <img src="/flag-ar.jpg" alt="AR" className="lang-flag-img" />
                <span className="lang-code">AR</span>
              </button>
            </div>
          </div>
        </header>

        {activeTab === 'home' && renderHome()}
        {activeTab === 'hours' && renderHours()}
        {activeTab === 'profile' && renderProfile()}
        {activeTab === 'support' && renderSupport()}
      </div>

      <nav className="tabbar">
        {tabDefs.map((tab) => (
          <button
            key={tab.id}
            className={`tabbar__btn ${activeTab === tab.id ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tabbar__icon" aria-hidden>
              {tab.icon}
            </span>
            <span className="tabbar__label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  const isInvitePage = typeof window !== 'undefined' && window.location.pathname.startsWith('/invite')
  if (isInvitePage) return <InvitePage />
  return <MainApp />
}
