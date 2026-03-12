const CACHE_NAME = 'hybrilink-v1';
const DYNAMIC_CACHE = 'hybrilink-dynamic-v1';
const API_CACHE = 'hybrilink-api-v1';

// Fichiers à mettre en cache immédiatement
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-167x167.png',
  '/icons/icon-180x180.png',
  '/icons/icon-192x192.png',
  '/icons/icon-256x256.png',
  '/icons/icon-512x512.png',
  '/R.png'
];

// Bibliothèques CDN à mettre en cache
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js'
];

// Installation du Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker: Installation en cours...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Mise en cache des fichiers statiques');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        return caches.open(DYNAMIC_CACHE);
      })
      .then(cache => {
        console.log('Service Worker: Mise en cache des CDN');
        return cache.addAll(CDN_ASSETS);
      })
      .then(() => {
        console.log('Service Worker: Installation terminée');
        return self.skipWaiting();
      })
  );
});

// Activation du Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker: Activation...');
  
  // Nettoyer les anciens caches
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== DYNAMIC_CACHE && cache !== API_CACHE) {
            console.log('Service Worker: Suppression ancien cache', cache);
            return caches.delete(cache);
          }
        })
      );
    })
    .then(() => {
      console.log('Service Worker: Prêt à contrôler les clients');
      return self.clients.claim();
    })
  );
});

// Stratégie de cache : Network First avec fallback sur cache
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Ignorer les requêtes vers Firebase et Cloudinary (toujours en ligne)
  if (url.hostname.includes('firebase') || 
      url.hostname.includes('cloudinary') || 
      url.hostname.includes('googleapis')) {
    return;
  }
  
  // Stratégie pour les API (Firestore) - Network only
  if (url.pathname.includes('firestore') || url.pathname.includes('auth')) {
    event.respondWith(
      fetch(event.request)
        .catch(error => {
          console.log('API hors ligne, retour en cache local');
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Stratégie pour les fichiers statiques - Cache first
  if (event.request.url.includes('.css') || 
      event.request.url.includes('.js') || 
      event.request.url.includes('.png') || 
      event.request.url.includes('.jpg') ||
      event.request.url.includes('.ico')) {
    
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          return fetch(event.request)
            .then(networkResponse => {
              // Mettre en cache dynamiquement
              const responseClone = networkResponse.clone();
              caches.open(DYNAMIC_CACHE).then(cache => {
                cache.put(event.request, responseClone);
              });
              return networkResponse;
            })
            .catch(error => {
              console.log('Ressource non trouvée en cache et hors ligne');
              return caches.match('/offline.html');
            });
        })
    );
    return;
  }
  
  // Stratégie pour les pages HTML - Network first, fallback cache
  if (event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          const responseClone = networkResponse.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(error => {
          console.log('Page hors ligne, chargement depuis le cache');
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              return caches.match('/offline.html');
            });
        })
    );
    return;
  }
  
  // Stratégie par défaut - Network first
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Mettre en cache les réponses réussies
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(API_CACHE).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(error => {
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response('Ressource non disponible hors ligne', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});

// Gestion des notifications push
self.addEventListener('push', event => {
  console.log('Service Worker: Push reçu', event);
  
  let notificationData = {
    title: 'hybrilink',
    body: 'Nouvelle notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png'
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      vibrate: [200, 100, 200],
      data: notificationData.data || {}
    })
  );
});

// Gestion du clic sur les notifications
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notification cliquée', event);
  
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        if (clientList.length > 0) {
          return clientList[0].focus();
        }
        return clients.openWindow('/');
      })
  );
});

// Gestion de la synchronisation en arrière-plan
self.addEventListener('sync', event => {
  console.log('Service Worker: Synchronisation en arrière-plan', event.tag);
  
  if (event.tag === 'sync-payments') {
    event.waitUntil(syncPayments());
  } else if (event.tag === 'sync-enrollments') {
    event.waitUntil(syncEnrollments());
  } else if (event.tag === 'sync-salaries') {
    event.waitUntil(syncSalaries());
  }
});

// Fonctions de synchronisation
async function syncPayments() {
  console.log('Synchronisation des paiements...');
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_PAYMENTS',
        timestamp: Date.now()
      });
    });
  } catch (error) {
    console.error('Erreur synchronisation paiements:', error);
  }
}

async function syncEnrollments() {
  console.log('Synchronisation des inscriptions...');
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_ENROLLMENTS',
        timestamp: Date.now()
      });
    });
  } catch (error) {
    console.error('Erreur synchronisation inscriptions:', error);
  }
}

async function syncSalaries() {
  console.log('Synchronisation des salaires...');
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_SALARIES',
        timestamp: Date.now()
      });
    });
  } catch (error) {
    console.error('Erreur synchronisation salaires:', error);
  }
}

// Écouter les messages du client
self.addEventListener('message', event => {
  console.log('Service Worker: Message reçu', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME);
    caches.delete(DYNAMIC_CACHE);
    caches.delete(API_CACHE);
  }
});