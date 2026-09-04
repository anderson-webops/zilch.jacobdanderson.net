import process from 'node:process'
import { appDescription } from './src/constants/index'

const devApiOrigin = process.env.DEV_API_ORIGIN || 'http://127.0.0.1:3006'

export default defineNuxtConfig({
  modules: [
    'nuxt-security',
    '@nuxt/eslint',
  ],

  devtools: {
    enabled: process.env.NODE_ENV !== 'production'
      && process.env.CI !== 'true'
      && process.env.NUXT_A11Y_SCAN !== 'true',
  },

  app: {
    head: {
      title: 'Zilch',
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'canonical', href: 'https://zilch.jacobdanderson.net/' },
        { rel: 'icon', type: 'image/svg+xml', href: '/zilch-mark.svg' },
      ],
      meta: [
        { name: 'description', content: appDescription },
        { property: 'og:title', content: 'Zilch' },
        { property: 'og:description', content: appDescription },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: 'https://zilch.jacobdanderson.net/' },
        { property: 'og:image', content: 'https://zilch.jacobdanderson.net/og.png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: 'Zilch dice on a green felt table with the words Press your luck. Bank before you bust.' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'Zilch' },
        { name: 'twitter:description', content: appDescription },
        { name: 'twitter:image', content: 'https://zilch.jacobdanderson.net/og.png' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', content: '#f6f0e2' },
      ],
    },
  },

  runtimeConfig: {
    public: {
      apiBaseUrl: '/api',
    },
  },

  srcDir: 'src',

  routeRules: {
    '/**': {
      headers: {
        'cross-origin-embedder-policy': 'require-corp',
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-resource-policy': 'same-origin',
        'cache-control': 'no-cache',
        'origin-agent-cluster': '?1',
        'permissions-policy': 'accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), web-share=(), xr-spatial-tracking=()',
      },
    },
    '/_nuxt/**': {
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
      },
    },
    '/healthz': {
      headers: {
        'cache-control': 'no-store',
      },
    },
    '/release.json': {
      headers: {
        'cache-control': 'no-store',
      },
    },
  },

  sourcemap: {
    client: false,
    server: false,
  },

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    payloadExtraction: true,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2026-07-24',

  nitro: {
    compressPublicAssets: true,
    prerender: {
      crawlLinks: false,
      routes: ['/', '/tips'],
      ignore: ['/hi'],
    },
  },

  vite: {
    server: {
      proxy: {
        '/api': {
          changeOrigin: false,
          target: devApiOrigin,
        },
      },
    },
  },

  eslint: {
    config: {
      standalone: false,
      nuxt: {
        sortConfigKeys: true,
      },
    },
  },

  security: {
    strict: true,
    allowedMethodsRestricter: {
      methods: ['GET', 'HEAD', 'OPTIONS'],
      throwError: true,
    },
    corsHandler: false,
    csrf: false,
    headers: {
      contentSecurityPolicy: {
        'base-uri': ['\'none\''],
        'connect-src': ['\'self\''],
        'default-src': ['\'none\''],
        'font-src': ['\'self\'', 'data:'],
        'form-action': ['\'self\''],
        'frame-ancestors': ['\'none\''],
        'frame-src': ['\'none\''],
        'img-src': ['\'self\'', 'data:'],
        'manifest-src': ['\'self\''],
        'media-src': ['\'self\''],
        'object-src': ['\'none\''],
        'script-src': ['\'self\'', '\'strict-dynamic\'', '\'nonce-{{nonce}}\''],
        'script-src-attr': ['\'none\''],
        'style-src': ['\'self\'', '\'nonce-{{nonce}}\''],
        'upgrade-insecure-requests': true,
        'worker-src': ['\'self\''],
      },
      crossOriginEmbedderPolicy: 'require-corp',
      crossOriginOpenerPolicy: 'same-origin',
      crossOriginResourcePolicy: 'same-origin',
      permissionsPolicy: {
        'accelerometer': [],
        'autoplay': [],
        'camera': [],
        'display-capture': [],
        'encrypted-media': [],
        'fullscreen': [],
        'geolocation': [],
        'gyroscope': [],
        'magnetometer': [],
        'microphone': [],
        'midi': [],
        'payment': [],
        'picture-in-picture': [],
        'publickey-credentials-get': [],
        'screen-wake-lock': [],
        'usb': [],
        'web-share': [],
        'xr-spatial-tracking': [],
      },
      referrerPolicy: 'strict-origin-when-cross-origin',
      strictTransportSecurity: {
        includeSubdomains: false,
        maxAge: 31_536_000,
        preload: false,
      },
      xContentTypeOptions: 'nosniff',
      xFrameOptions: 'DENY',
    },
    hidePoweredBy: true,
    nonce: true,
    rateLimiter: false,
    removeLoggers: false,
    requestSizeLimiter: false,
    sri: true,
    xssValidator: {
      throwError: true,
    },
  },
})
