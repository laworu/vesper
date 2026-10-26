const CACHE='vesper-v7-1';
const SHELL=['/','/index.html','/style.css','/icon.svg','/manifest.webmanifest','/src/app.js','/src/domain.js','/src/views.js','/src/store.js','/src/cloud.js','/assets/kairo.png'];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);await Promise.all(SHELL.map(url=>cache.add(url).catch(()=>{})));await self.skipWaiting();})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(key=>key.startsWith('vesper-')&&key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  event.respondWith((async()=>{try{const response=await fetch(event.request);if(response.ok){const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());}return response;}catch{const cached=await caches.match(event.request);if(cached)return cached;if(event.request.mode==='navigate')return caches.match('/index.html');return Response.error();}})());
});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{};}catch{}
  let url='/';try{const proposed=new URL(data.url||'/',self.location.origin);if(proposed.origin===self.location.origin)url=proposed.href;}catch{}
  event.waitUntil(self.registration.showNotification(String(data.title||'Кайро напоминает ✦'),{body:String(data.body||'В твоём плане есть важное дело.'),icon:'/icon.svg',tag:String(data.tag||'vesper-reminder'),data:{url}}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const url=event.notification.data?.url||'/';const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});if(windows.length){await windows[0].navigate(url);return windows[0].focus();}return self.clients.openWindow(url);})());});
