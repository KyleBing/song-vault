import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const unlockMusicRoot = resolve(__dirname, 'src/unlock-music')
const appVersion = (
  JSON.parse(
    readFileSync(resolve(__dirname, 'package.json'), 'utf8')
  ) as { version: string }
).version

const appVersionDefine = {
  __APP_VERSION__: JSON.stringify(appVersion)
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: appVersionDefine,
    resolve: {
      alias: {
        '@unlock': unlockMusicRoot,
        '@unlock/decrypt/entity': resolve(unlockMusicRoot, 'decrypt/entity.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    define: appVersionDefine
  },
  renderer: {
    define: appVersionDefine,
    publicDir: resolve(__dirname, 'build'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared'),
        '@unlock': unlockMusicRoot
      }
    },
    plugins: [vue()],
    optimizeDeps: {
      include: [
        'buffer',
        'crypto-js',
        'music-metadata-browser',
        'browser-id3-writer',
        'metaflac-js',
        'iconv-lite',
        '@xhacker/qmcwasm/QmcWasmBundle',
        '@jixun/qmc2-crypto/QMC2-wasm-bundle'
      ]
    },
    assetsInclude: ['**/*.wasm'],
    css: {
      preprocessorOptions: {
        scss: {
          includePaths: [resolve(__dirname, 'src/renderer/styles')]
        }
      }
    },
    server: {
      port: 5217,
      strictPort: true
    }
  }
})
