<script setup lang="ts">
import { computed } from 'vue'
import type { AudioFileMetaInfo } from '@shared/audioFileMeta'

const props = defineProps<{
  meta: AudioFileMetaInfo | null
  loading?: boolean
  filePath?: string
}>()

const commonRows = computed(() => {
  const skip = props.meta?.coverDataUrl
    ? new Set(['title', 'artist', 'album'])
    : undefined
  return objectRows(props.meta?.common, skip)
})
const formatRows = computed(() => objectRows(props.meta?.format))
const nativeRows = computed(() => props.meta?.native ?? [])

const hasBody = computed(
  () =>
    commonRows.value.length > 0 ||
    formatRows.value.length > 0 ||
    nativeRows.value.length > 0
)

function objectRows(
  obj: Record<string, string> | undefined,
  skipKeys?: Set<string>
): { key: string; value: string }[] {
  if (!obj) return []
  return Object.entries(obj)
    .filter(([key]) => !skipKeys?.has(key))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([key, value]) => ({ key, value }))
}
</script>

<template>
  <div class="audio-meta-popper">
    <p v-if="filePath" class="audio-meta-popper__path" :title="filePath">
      {{ filePath }}
    </p>

    <div v-if="loading" class="audio-meta-popper__state">读取标签…</div>
    <template v-else-if="meta">
      <div v-if="meta.coverDataUrl" class="audio-meta-popper__hero">
        <img
          class="audio-meta-popper__cover"
          :src="meta.coverDataUrl"
          alt="封面"
        />
        <div class="audio-meta-popper__hero-text">
          <p v-if="meta.common.title" class="audio-meta-popper__title">
            {{ meta.common.title }}
          </p>
          <p v-if="meta.common.artist" class="audio-meta-popper__artist">
            {{ meta.common.artist }}
          </p>
          <p v-if="meta.common.album" class="audio-meta-popper__album">
            {{ meta.common.album }}
          </p>
        </div>
      </div>

      <p v-if="meta.message && !meta.ok" class="audio-meta-popper__hint">
        {{ meta.message }}
      </p>

      <div v-if="hasBody" class="audio-meta-popper__scroll">
        <section v-if="commonRows.length" class="audio-meta-popper__section">
          <h4 class="audio-meta-popper__heading">标签</h4>
          <dl class="audio-meta-popper__dl">
            <template v-for="row in commonRows" :key="'c-' + row.key">
              <dt>{{ row.key }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>
        </section>

        <section v-if="formatRows.length" class="audio-meta-popper__section">
          <h4 class="audio-meta-popper__heading">格式</h4>
          <dl class="audio-meta-popper__dl">
            <template v-for="row in formatRows" :key="'f-' + row.key">
              <dt>{{ row.key }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>
        </section>

        <section v-if="nativeRows.length" class="audio-meta-popper__section">
          <h4 class="audio-meta-popper__heading">原生</h4>
          <dl class="audio-meta-popper__dl">
            <template v-for="row in nativeRows" :key="'n-' + row.id">
              <dt>{{ row.id }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>
        </section>
      </div>

      <p
        v-else-if="meta.ok && !meta.coverDataUrl"
        class="audio-meta-popper__hint"
      >
        无标签信息
      </p>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.audio-meta-popper {
  max-width: min(380px, 92vw);
  font-size: 10px;
  line-height: 1.35;
  color: var(--app-text);
}

.audio-meta-popper__path {
  margin: 0 0 6px;
  font-size: 9px;
  opacity: 0.55;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.audio-meta-popper__state,
.audio-meta-popper__hint {
  margin: 0;
  opacity: 0.7;
}

.audio-meta-popper__hero {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  align-items: flex-start;
}

.audio-meta-popper__cover {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
  background: rgba(128, 128, 128, 0.15);
}

.audio-meta-popper__hero-text {
  min-width: 0;
  flex: 1;
}

.audio-meta-popper__title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
}

.audio-meta-popper__artist,
.audio-meta-popper__album {
  margin: 2px 0 0;
  opacity: 0.75;
}

.audio-meta-popper__scroll {
  max-height: 240px;
  overflow: auto;
  padding-right: 2px;
}

.audio-meta-popper__section + .audio-meta-popper__section {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--app-border-subtle);
}

.audio-meta-popper__heading {
  margin: 0 0 4px;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.5;
}

.audio-meta-popper__dl {
  margin: 0;
  display: grid;
  grid-template-columns: minmax(72px, 34%) 1fr;
  column-gap: 6px;
  row-gap: 2px;
}

.audio-meta-popper__dl dt {
  margin: 0;
  opacity: 0.55;
  word-break: break-word;
}

.audio-meta-popper__dl dd {
  margin: 0;
  word-break: break-word;
}
</style>
