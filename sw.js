const CACHE_NAME = 'hybrilink-v2';
const DYNAMIC_CACHE = 'hybrilink-dynamic-v2';
const API_CACHE = 'hybrilink-api-v2';

// Fichiers à mettre en cache immédiatement (MUST HAVE)
const STATIC_ASSETS = [
  '/',
  'index.html',
  '/offline.html',
  '/manifest.json',
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
  console.log('[SW] Installation...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Mise en cache des fichiers statiques');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        return caches.open(DYNAMIC_CACHE);
      })
      .then(cache => {
        console.log('[SW] Mise en cache des CDN');
        return cache.addAll(CDN_ASSETS);
      })
      .then(() => {
        console.log('[SW] Installation terminée');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Erreur installation:', err);
      })
  );
});

// Activation du Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] Activation...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== DYNAMIC_CACHE && cache !== API_CACHE) {
            console.log('[SW] Suppression ancien cache', cache);
            return caches.delete(cache);
          }
        })
      );
    })
    .then(() => {
      console.log('[SW] Prêt à contrôler les clients');
      return self.clients.claim();
    })
  );
});

// INTERCEPTEUR DE REQUÊTES PRINCIPAL
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // STRATÉGIE SPÉCIALE POUR index.html - TOUJOURS SERVIR DEPUIS LE CACHE EN PRIORITÉ
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            console.log('[SW] Page servie depuis le cache:', url.pathname);
            return cachedResponse;
          }
          
          // Si pas en cache, essayer le réseau
          return fetch(event.request)
            .then(networkResponse => {
              // Mettre en cache la page pour la prochaine fois
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
              });
              return networkResponse;
            })
            .catch(() => {
              // En dernier recours, afficher la page offline
              return caches.match('/offline.html');
            });
        })
    );
    return;
  }
  
  // Pour les fichiers statiques (CSS, JS, images)
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
              const responseClone = networkResponse.clone();
              caches.open(DYNAMIC_CACHE).then(cache => {
                cache.put(event.request, responseClone);
              });
              return networkResponse;
            });
        })
    );
    return;
  }
  
  // Pour les requêtes API et Firebase - essayer le réseau d'abord
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
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Gestion des notifications push
self.addEventListener('push', event => {
  console.log('[SW] Push reçu');
  
  let notificationData = {
    title: 'hybrilink',
    body: 'Nouvelle notification',
    icon: '/R.png',
    badge: '/R.png'
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
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', event => {
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

// Synchronisation en arrière-plan
self.addEventListener('sync', event => {
  console.log('[SW] Synchronisation:', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_DATA',
            timestamp: Date.now()
          });
        });
      })
    );
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME);
    caches.delete(DYNAMIC_CACHE);
    caches.delete(API_CACHE);
  }
});
