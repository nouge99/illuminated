const CACHE_NAME = "illuminated-cache-v1";

const FILES_TO_CACHE = [
    "/best.onnx",
    "/ort-wasm-simd-threaded.wasm",
    "/ort-wasm-simd-threaded.jsep.wasm", 
    "/ort-wasm-simd-threaded.jsep.mjs",
    "/ort-wasm.wasm"
]


// When the service worker is first registered, set up the cached files 
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                cache.addAll(FILES_TO_CACHE);
            })
            .then(() => console.log("Service worker: model cached"))
    );
});

// Check cached content to see if the names have changed – if it has, delete the old cache
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        caches.delete(cache);
                        console.log("Service worker: deleted old cache files")
                    }
                })
            );
        })
    );
});

// Intercept fetch requests to see if they're asking for cached items – if they are, serve the item
self.addEventListener('fetch', event => {
    let isCached = false;
    for (const file of FILES_TO_CACHE) {
        if (event.request.url.includes(file)) {
            isCached = true;
            break;
        }
    }
    if (!isCached) {
        console.log("Service worker: fetch request not for a file on the cache list", event.request.url);    
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    console.log("Service worker: served cached file", event.request.url);
                    return response;
                } else {
                    console.log("Service worker: fetching file from network", event.request.url);
                    return fetch(event.request);
                }
            })
    )
});

