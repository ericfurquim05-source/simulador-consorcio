const VERSION='simulador-consorcio-v2.1.0';
const STATIC_CACHE=`${VERSION}-static`;
const ASSETS=[
  './',
  './index.html',
  './css/estilos.css',
  './js/calculos.js',
  './js/graficos.js',
  './js/configuracoes.js',
  './js/pdf.js',
  './js/app.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>
      Promise.all(keys.filter(key=>key!==STATIC_CACHE).map(key=>caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;

  if(event.request.mode==='navigate'){
    event.respondWith(
      fetch(event.request)
        .then(response=>{
          const copy=response.clone();
          caches.open(STATIC_CACHE).then(cache=>cache.put('./index.html',copy));
          return response;
        })
        .catch(()=>caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>
      cached || fetch(event.request).then(response=>{
        const copy=response.clone();
        caches.open(STATIC_CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      })
    )
  );
});
