import { computed, readonly, ref } from 'vue'

const coverSrc = ref<string | null>(null)
const coverCaption = ref<string | null>(null)

export function useAudioCoverLightbox() {
  const isOpen = computed(() => coverSrc.value !== null)

  function open(src: string, options?: { caption?: string }): void {
    coverSrc.value = src
    const caption = options?.caption?.trim()
    coverCaption.value = caption || null
  }

  function close(): void {
    coverSrc.value = null
    coverCaption.value = null
  }

  return {
    coverSrc: readonly(coverSrc),
    coverCaption: readonly(coverCaption),
    isOpen,
    open,
    close
  }
}
