<script setup lang="ts">
import { computed } from 'vue'
import { formatFileSize } from '@shared/formatAudioDisplay'

const props = defineProps<{
  filePath: string | null
  sizeBytes?: number | null
}>()

const sizeLabel = computed(() => {
  const bytes = props.sizeBytes
  if (bytes === undefined || bytes === null || bytes <= 0) return '—'
  return formatFileSize(bytes)
})
</script>

<template>
  <div v-if="filePath" class="decode-file-info-panel">
    <dl class="decode-file-info-panel__dl">
      <dt>大小</dt>
      <dd>{{ sizeLabel }}</dd>
      <dt>路径</dt>
      <dd class="decode-file-info-panel__path">{{ filePath }}</dd>
    </dl>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.decode-file-info-panel {
  height: 72px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 6px 10px;
  border-top: 1px solid $border-subtle;
  background: transparent;
  overflow: hidden;
  box-sizing: border-box;
}

.decode-file-info-panel__dl {
  margin: 0;
  display: grid;
  grid-template-columns: 40px 1fr;
  column-gap: 8px;
  row-gap: 4px;
  font-size: 12px;
  line-height: 1.3;
  min-height: 0;
  overflow: auto;
}

.decode-file-info-panel__dl dt {
  margin: 0;
  opacity: 0.55;
  flex-shrink: 0;
}

.decode-file-info-panel__dl dd {
  margin: 0;
  word-break: break-word;
}

.decode-file-info-panel__path {
  font-family: $font-mono;
  font-size: 12px;
}
</style>
