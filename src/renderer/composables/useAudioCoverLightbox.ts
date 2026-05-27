import { computed, readonly, ref } from 'vue'

const coverSrc = ref<string | null>(null)

export function useAudioCoverLightbox() {
  const isOpen = computed(() => coverSrc.value !== null)

  function open(src: string): void {
    coverSrc.value = src
  }

  function close(): void {
    coverSrc.value = null
  }

  return {
    coverSrc: readonly(coverSrc),
    isOpen,
    open,
    close
  }
}
