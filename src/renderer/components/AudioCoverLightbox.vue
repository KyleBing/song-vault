<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAudioCoverLightbox } from '@renderer/composables/useAudioCoverLightbox'
import { formatCoverDataUrlMeta } from '@renderer/utils/coverDataUrlMeta'

const { coverSrc, close } = useAudioCoverLightbox()

const naturalSize = ref<{ width: number; height: number } | null>(null)

watch(coverSrc, () => {
  naturalSize.value = null
})

const metaLine = computed(() =>
  formatCoverDataUrlMeta(coverSrc.value ?? undefined, naturalSize.value)
)

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
        <p v-if="metaLine !== '—'" class="audio-cover-lightbox-meta">{{ metaLine }}</p>
      </div>
    </div>
  </Teleport>
</template>
