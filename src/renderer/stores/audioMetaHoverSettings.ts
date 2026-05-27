import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  createDefaultAudioMetaHoverSettings,
  normalizeAudioMetaHoverSettings,
  type AudioMetaHoverSettings
} from '@shared/audioMetaHoverSettings'
import { loadAppConfigOnce } from '@renderer/lib/appConfigClient'

export const useAudioMetaHoverSettingsStore = defineStore(
  'audioMetaHoverSettings',
  () => {
    const settings = ref<AudioMetaHoverSettings>(
      createDefaultAudioMetaHoverSettings()
    )

    function apply(next: AudioMetaHoverSettings): void {
      settings.value = normalizeAudioMetaHoverSettings(next)
    }

    async function hydrateFromDisk(): Promise<void> {
      const config = await loadAppConfigOnce()
      apply(config.audioMetaHover)
    }

    return { settings, apply, hydrateFromDisk }
  }
)
