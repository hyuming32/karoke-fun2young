const RELEASE="1.0.4-143cee949bd5", ASSETS=["apple-touch-icon.png","index-B3o38ecQ.css","index-BJ07cycl.js","web-3HfJNh5T.js","web-DRQQrB3U.js","icon.svg","index.html","karaoke-worklet.js","manifest.webmanifest"];
const prefix='karaoke-shell:'+self.registration.scope+':';
const cacheName=prefix+RELEASE;
const urls=new Set(ASSETS.map(path=>new URL(path,self.registration.scope).href));
const index=new URL('index.html',self.registration.scope).href;
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(
    [...urls].map(url=>new Request(url,{cache:'reload'}))
  )));
});
self.addEventListener('message',event=>{
  if(event.data==='activate-update')event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',event=>{
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(event.request.mode==='navigate'&&[self.registration.scope,index].includes(url.origin+url.pathname)){
    event.respondWith(caches.open(cacheName).then(cache=>cache.match(index)));
  }else if(urls.has(url.href)){
    event.respondWith(caches.open(cacheName).then(cache=>cache.match(event.request)));
  }else if(url.href.startsWith(self.registration.scope)&&event.request.destination==='script'){
    // An older open window may still request one of its versioned modules.
    event.respondWith(caches.match(event.request).then(hit=>hit??Response.error()));
  }
});
