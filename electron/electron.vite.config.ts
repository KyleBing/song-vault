import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

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
        '@shared': resolve('src/shared')
      }
    },
    plugins: [vue()],
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
