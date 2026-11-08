// App shell only. Books, notes and highlights live in IndexedDB on the device, never in this cache, and /data/ is never cached.
const C = "bible-shell-v8";
const SHELL = ["./", "index.html", "reader.js", "notes.js", "sourcebook.js", "manifest.json", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(SHELL))); });
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.includes("/data/")) return;
  e.respondWith(caches.match(e.request).then(hit => {   // instant from cache, refreshed in the background for next time
    const net = fetch(e.request).then(r => { if (r.ok) { const k = r.clone(); caches.open(C).then(c => c.put(e.request, k)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
