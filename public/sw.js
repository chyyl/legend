/**
 * Legend PWA Service Worker
 *
 * - 缓存名带版本号，发新版本时只需递增 CACHE_NAME，activate 会清掉旧版本
 * - GitHub Pages 可能部署在子路径（如 https://user.github.io/legend/），
 *   因此统一用 URL 的完整 pathname 作为缓存键，不做根路径假设
 */

const CACHE_NAME = 'legend-v0.1.0'

// 依据 Service Worker 自身位置推导基础路径，兼容 GitHub Pages 子路径部署
const BASE_PATH = (() => {
  const p = self.location.pathname // 形如 /sw.js 或 /legend/sw.js
  return p.endsWith('/sw.js') ? p.slice(0, -'/sw.js'.length) + '/' : '/'
})()

/** 把根相对路径（'/'、'/index.html'）转换为完整 pathname */
function toPath(path) {
  return BASE_PATH + path.replace(/^\/+/, '')
}

// 安装阶段预缓存的核心资源（相对站点根路径）
const PRECACHE_URLS = ['/', '/index.html', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS.map(toPath)))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key.startsWith('legend-'))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

/** 导航请求：network-first，网络失败时回退到缓存的 '/'（必要时再退到 /index.html） */
function handleNavigation(event, request) {
  const networkFetch = fetch(request).then((response) => {
    if (response && response.ok) {
      const copy = response.clone()
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.put(request, copy))
        .catch(() => {})
    }
    return response
  })
  // 后台刷新缓存期间保持 SW 生命周期
  event.waitUntil(networkFetch.catch(() => {}))

  event.respondWith(
    networkFetch.catch(() =>
      caches
        .open(CACHE_NAME)
        .then((cache) =>
          cache
            .match(request, { ignoreSearch: true })
            .then((hit) => hit || cache.match(toPath('/'), { ignoreSearch: true }))
            .then((hit) => hit || cache.match(toPath('/index.html')))
        )
        .then((hit) => hit || Response.error())
    )
  )
}

/** 同源静态资源：cache-first，命中后后台更新缓存（stale-while-revalidate） */
function handleStatic(event, request) {
  const networkFetch = fetch(request).then((response) => {
    if (response && response.ok && response.type === 'basic') {
      const copy = response.clone()
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.put(request, copy))
        .catch(() => {})
    }
    return response
  })
  // 无论是否命中缓存，都让网络响应在后台回填缓存
  event.waitUntil(networkFetch.catch(() => {}))

  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.match(request))
      .then((cached) => {
        if (cached) return cached // cache-first：立即返回，后台已由 networkFetch 更新
        return networkFetch.catch(() => Response.error())
      })
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // 过滤非 GET 请求
  if (request.method !== 'GET') return

  // 过滤非 http(s) 请求（data:、chrome-extension: 等）
  let url
  try {
    url = new URL(event.request.url)
  } catch (e) {
    return
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  // 页面导航：network-first
  if (request.mode === 'navigate') {
    handleNavigation(event, request)
    return
  }

  // 仅处理同源静态资源，跨域资源交给浏览器默认行为
  if (url.origin !== self.location.origin) return

  handleStatic(event, request)
})
