<script setup lang="ts">
import { Tooltip } from 'floating-vue'
import { computed, ref } from 'vue'
import { isMusicFilePathForMetaHover } from '@shared/isAudioFilePath'
import { useAudioMetaCache } from '@renderer/composables/useAudioMetaCache'
import AudioMetaPopperContent from './AudioMetaPopperContent.vue'
import type { AudioFileMetaInfo } from '@shared/audioFileMeta'

const props = withDefaults(
  defineProps<{
    filePath: string
    /** 在浮层顶部显示完整路径 */
    showPath?: boolean
    /** 禁用悬停（仍渲染默认插槽） */
    disabled?: boolean
  }>(),
  {
    showPath: true,
    disabled: false
  }
)

const enabled = computed(
  () => !props.disabled && isMusicFilePathForMetaHover(props.filePath)
)

const { getMeta } = useAudioMetaCache()
const meta = ref<AudioFileMetaInfo | null>(null)
const loading = ref(false)

async function onShow(): Promise<void> {
  if (!enabled.value) return
  loading.value = true
  try {
    meta.value = await getMeta(props.filePath)
  } finally {
    loading.value = false
  }
}

function onHide(): void {
  loading.value = false
}
</script>

<template>
  <Tooltip
    v-if="enabled"
    placement="bottom-start"
    :distance="2"
    :skidding="0"
    :delay="{ show: 280, hide: 220 }"
    :triggers="['hover']"
    :popper-triggers="['hover']"
    theme="audio-meta"
    popper-class="audio-meta-floating"
    handle-resize
    instant-move
    @show="onShow"
    @hide="onHide"
  >
    <span class="audio-meta-hover-trigger">
      <slot />
    </span>
    <template #popper>
      <AudioMetaPopperContent
        :meta="meta"
        :loading="loading"
        :file-path="showPath ? filePath : undefined"
      />
    </template>
  </Tooltip>
  <slot v-else />
</template>

<style lang="scss" scoped>
.audio-meta-hover-trigger {
  display: inline;
  max-width: 100%;
}
</style>
