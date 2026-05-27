import './polyfills'
import FloatingVue from 'floating-vue'
import 'floating-vue/dist/style.css'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import AudioMetaHover from './components/AudioMetaHover.vue'
import './styles/global.scss'
import { loadAppConfigOnce, readThemeCache } from './lib/appConfigClient'
import { useThemeStore } from './stores/theme'

/** 启动应用：应用缓存主题、加载磁盘配置、挂载 Vue 根组件 */
async function bootstrap(): Promise<void> {
  const cachedAppearance = readThemeCache()
  document.documentElement.dataset.theme = cachedAppearance

  const pinia = createPinia()
  const themeStore = useThemeStore(pinia)
  themeStore.hydrate(cachedAppearance)

  try {
    const config = await loadAppConfigOnce()
    themeStore.hydrate(config.appearance)
  } catch (err) {
    console.error('启动时加载主题失败', err)
  }

  const app = createApp(App)
  app.use(pinia)
  app.use(FloatingVue, {
    themes: {
      'audio-meta': {
        $extend: 'tooltip',
        distance: 2,
        triggers: ['hover'],
        popperTriggers: ['hover']
      }
    }
  })
  app.component('AudioMetaHover', AudioMetaHover)
  app.mount('#app')
}

void bootstrap()
