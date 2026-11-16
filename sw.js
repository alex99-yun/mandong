// 페이지는 온라인이면 서버의 최신본을 먼저 받고, 안 되면 저장본을 보여준다.
// 아이콘과 글꼴 같은 나머지 파일은 저장본을 바로 쓰고 뒤에서 갱신한다.
const CACHE = "mandong-v3";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
const sameOrigin = url => new URL(url).origin === self.location.origin;
// 같은 사이트 파일은 브라우저 HTTP 캐시를 건너뛰고 서버에 확인해서 받는다.
// 페이지 이동 요청은 옵션을 덧붙일 수 없어서 주소로 새로 요청한다.
const fromNetwork = req => sameOrigin(req.url) ? fetch(req.url, {cache: "no-cache"}) : fetch(req);
const timeout = ms => new Promise(r => setTimeout(() => r(null), ms));

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(CORE.map(u => new Request(u, {cache: "reload"}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const nav = e.request.mode === "navigate";
  e.respondWith(caches.open(CACHE).then(async cache => {
    // 페이지는 주소 뒤 ?값 을 떼고 한 칸에만 저장한다.
    const key = nav ? e.request.url.split(/[?#]/)[0] : e.request;
    const cached = await cache.match(key, {ignoreSearch: true});
    const fresh = fromNetwork(e.request).then(res => {
      if (res && (res.ok || res.type === "opaque")) cache.put(key, res.clone());
      return res && (res.ok || res.type === "opaque") ? res : null;
    }).catch(() => null);
    if (nav) {
      const res = await Promise.race([fresh, timeout(cached ? 3000 : 15000)]);
      if (res) return res;
      e.waitUntil(fresh);
      return cached || (await cache.match("./index.html")) || Response.error();
    }
    if (cached) { e.waitUntil(fresh); return cached; }
    return (await fresh) || Response.error();
  }));
});
