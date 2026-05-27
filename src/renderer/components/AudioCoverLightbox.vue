<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatFileSize } from '@shared/formatAudioDisplay'
import { useAudioCoverLightbox } from '@renderer/composables/useAudioCoverLightbox'

const { coverSrc, close } = useAudioCoverLightbox()

const naturalSize = ref<{ width: number; height: number } | null>(null)

watch(coverSrc, () => {
  naturalSize.value = null
})

const coverByteSize = computed(() => {
  const src = coverSrc.value
  return src ? dataUrlByteSize(src) : undefined
})

const metaLine = computed(() => {
  const parts: string[] = []
  const size = naturalSize.value
  if (size && size.width > 0 && size.height > 0) {
    parts.push(`${size.width} × ${size.height}`)
  }
  const bytes = coverByteSize.value
  if (bytes !== undefined && bytes > 0) {
    parts.push(formatFileSize(bytes))
  }
  return parts.length ? parts.join(' · ') : ''
})

function onImageLoad(event: Event): void {
  const img = event.target
  if (!(img instanceof HTMLImageElement)) return
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    naturalSize.value = {
      width: img.naturalWidth,
      height: img.naturalHeight
    }
  }
}

function dataUrlByteSize(dataUrl: string): number | undefined {
  const base64Match = /^data:[^;,]+(?:;[^;,]+)*;base64,(.*)$/i.exec(dataUrl)
  if (base64Match) {
    const b64 = base64Match[1]
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
    return Math.floor((b64.length * 3) / 4) - padding
  }
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return undefined
  try {
    return new TextEncoder().encode(
      decodeURIComponent(dataUrl.slice(comma + 1))
    ).length
  } catch {
    return undefined
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="coverSrc" class="audio-cover-lightbox-root">
      <div
        class="audio-cover-lightbox-backdrop"
        aria-hidden="true"
        @click="close"
      />
      <div class="audio-cover-lightbox-stack">
        <img
          class="audio-cover-lightbox"
          :src="coverSrc"
          alt="封面"
          @load="onImageLoad"
          @click.stop="close"
        />
        <p v-if="metaLine" class="audio-cover-lightbox-meta">{{ metaLine }}</p>
      </div>
    </div>
  </Teleport>
</template>
