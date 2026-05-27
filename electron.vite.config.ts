import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const unlockMusicRoot = resolve(__dirname, 'src/unlock-music')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
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
