// Service Worker for Background Location Tracking
// TODO: Replace with your Firebase project details
const CACHE_NAME = 'your-app-location-v1'
const FIREBASE_PROJECT = 'your-project-id'
const FIREBASE_API_KEY = 'YOUR_FIREBASE_API_KEY'

let watchId = null
let trackingActive = false
let trackingInterval = null
let trackingData = { deviceId: null, reportId: null, date: null }

self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installing...')
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activating...')
  event.waitUntil(self.clients.claim())
})

// Firestore'a konum yazma fonksiyonu
async function saveLocationToFirestore(location, deviceId, reportId, date) {
  if (!deviceId || !reportId || !date) {
    console.warn('[SW] Missing tracking data, cannot save location')
    return
  }

  try {
    // Firestore REST API kullanarak konum kaydet
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/locationTracking`
    const timestamp = new Date().toISOString()
    
    const docData = {
      fields: {
        deviceId: { stringValue: deviceId },
        reportId: { stringValue: reportId },
        date: { stringValue: date },
        latitude: { doubleValue: location.latitude },
        longitude: { doubleValue: location.longitude },
        accuracy: { doubleValue: location.accuracy || 0 },
        capturedAt: { stringValue: timestamp },
        timestamp: {
          timestampValue: timestamp,
        },
      },
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(docData),
    })

    if (response.ok) {
      console.log('[SW] ✅ Location saved to Firestore:', location.latitude, location.longitude)
    } else {
      console.error('[SW] ❌ Failed to save location:', await response.text())
    }
  } catch (error) {
    console.error('[SW] ❌ Error saving location:', error)
  }
}

// Background location tracking
self.addEventListener('message', (event) => {
  const { type, data } = event.data

  if (type === 'START_TRACKING') {
    if (trackingActive) {
      console.log('[SW] Tracking already active')
      return
    }
    
    console.log('[SW] Starting background location tracking', data)
    trackingActive = true
    trackingData = {
      deviceId: data.deviceId,
      reportId: data.reportId,
      date: data.date,
    }
    
    // watchPosition ile sürekli takip
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          }
          
          // Doğrudan Firestore'a kaydet (arka planda çalışır)
          await saveLocationToFirestore(
            location,
            trackingData.deviceId,
            trackingData.reportId,
            trackingData.date
          )
          
          // Ana uygulamaya da gönder (açıksa)
          self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
              client.postMessage({
                type: 'LOCATION_UPDATE',
                data: {
                  ...location,
                  timestamp: new Date().toISOString(),
                },
              })
            })
          })
        },
        (error) => {
          console.error('[SW] Location error:', error)
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      )
    }
    
    // Yedek olarak periyodik konum al (her 30 saniyede bir)
    trackingInterval = setInterval(async () => {
      if (navigator.geolocation && trackingActive) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            }
            await saveLocationToFirestore(
              location,
              trackingData.deviceId,
              trackingData.reportId,
              trackingData.date
            )
          },
          (error) => {
            console.error('[SW] Periodic location error:', error)
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          }
        )
      }
    }, 30000) // 30 saniye
    
  } else if (type === 'STOP_TRACKING') {
    console.log('[SW] Stopping background location tracking')
    trackingActive = false
    trackingData = { deviceId: null, reportId: null, date: null }
    
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    
    if (trackingInterval !== null) {
      clearInterval(trackingInterval)
      trackingInterval = null
    }
  }
})

