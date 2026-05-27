<script setup lang="ts">
import { computed } from 'vue'
import { useAudioCoverLightbox } from '@renderer/composables/useAudioCoverLightbox'
import type { AudioFileMetaInfo } from '@shared/audioFileMeta'
import type { AudioMetaHoverDisplayMode } from '@shared/audioMetaHoverSettings'
import {
  AUDIO_META_NORMAL_DISPLAY_KEYS,
  labelForCommonKey,
  labelForFormatKey,
  labelForNativeTag
} from '@shared/audioMetaLabels'
import {
  formatFileSize,
  formatMetaFieldDisplay
} from '@shared/formatAudioDisplay'

const props = defineProps<{
  meta: AudioFileMetaInfo | null
  loading?: boolean
  filePath?: string
  displayMode: AudioMetaHoverDisplayMode
}>()

const isMinimal = computed(() => props.displayMode === 'minimal')
const isNormal = computed(() => props.displayMode === 'normal')
const isFull = computed(() => props.displayMode === 'full')

const showPath = computed(() => Boolean(props.filePath))

const heroSkipKeys = computed(() =>
  props.meta?.coverDataUrl ? new Set(['title', 'artist', 'album']) : undefined
)


const commonRows = computed(() => {
  if (isMinimal.value || isNormal.value) return []
  const rows = objectRows(props.meta?.common, heroSkipKeys.value)
  return rows.map((row) => ({
    key: row.key,
    label: labelForCommonKey(row.key),
    value: row.value
  }))
})

const formatRows = computed(() => {
  if (isMinimal.value) return []
  const format = props.meta?.format
  if (!format) return []

  if (isNormal.value) {
    return buildNormalDisplayRows(props.meta, format)
  }

  return objectRows(format).map((row) => ({
    key: row.key,
    label: labelForFormatKey(row.key),
    value: formatMetaFieldDisplay(row.key, row.value)
  }))
})

const nativeRows = computed(() =>
  isFull.value
    ? (props.meta?.native ?? []).map((row) => ({
        id: row.id,
        label: labelForNativeTag(row.id),
        value: row.value
      }))
    : []
)

const hasBody = computed(
  () =>
    commonRows.value.length > 0 ||
    formatRows.value.length > 0 ||
    nativeRows.value.length > 0
)

const showHero = computed(
  () =>
    props.meta &&
    (props.meta.coverDataUrl ||
      props.meta.common.title ||
      props.meta.common.artist ||
      props.meta.common.album)
)

const { open: openCoverLightbox } = useAudioCoverLightbox()

function onCoverClick(): void {
  const src = props.meta?.coverDataUrl
  if (src) openCoverLightbox(src)
}

function buildNormalDisplayRows(
  meta: AudioFileMetaInfo | null | undefined,
  format: Record<string, string>
): { key: string; label: string; value: string }[] {
  const rows: { key: string; label: string; value: string }[] = []
  for (const key of AUDIO_META_NORMAL_DISPLAY_KEYS) {
    if (key === 'fileSize') {
      const bytes = meta?.fileSizeBytes
      if (bytes === undefined || bytes <= 0) continue
      rows.push({
        key,
        label: labelForFormatKey(key),
        value: formatFileSize(bytes)
      })
      continue
    }
    const raw = format[key]
    if (!raw) continue
    rows.push({
      key,
      label: labelForFormatKey(key),
      value: formatMetaFieldDisplay(key, raw)
    })
  }
  return rows
}

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
  <div
    class="audio-meta-popper"
    :class="{
      'audio-meta-popper--minimal': isMinimal
    }"
  >
    <p v-if="showPath" class="audio-meta-popper__path" :title="filePath">
      {{ filePath }}
    </p>

    <div v-if="loading" class="audio-meta-popper__state">读取标签…</div>
    <template v-else-if="meta">
      <div
        v-if="showHero"
        class="audio-meta-popper__hero"
        :class="{ 'audio-meta-popper__hero--minimal': isMinimal }"
      >
        <img
          v-if="meta.coverDataUrl"
          class="audio-meta-popper__cover"
          :class="{ 'audio-meta-popper__cover--minimal': isMinimal }"
          :src="meta.coverDataUrl"
          alt="封面"
          title="点击查看原图"
          @click.stop="onCoverClick"
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
          <h4 v-if="isFull" class="audio-meta-popper__heading">标签</h4>
          <dl class="audio-meta-popper__dl">
            <template v-for="row in commonRows" :key="'c-' + row.key">
              <dt :title="row.key">{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>
        </section>

        <section v-if="formatRows.length" class="audio-meta-popper__section">
          <h4 v-if="isFull" class="audio-meta-popper__heading">格式</h4>
          <dl class="audio-meta-popper__dl">
            <template v-for="row in formatRows" :key="'f-' + row.key">
              <dt :title="row.key">{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>
        </section>

        <section v-if="nativeRows.length" class="audio-meta-popper__section">
          <h4 class="audio-meta-popper__heading">原生</h4>
          <dl class="audio-meta-popper__dl">
            <template v-for="row in nativeRows" :key="'n-' + row.id">
              <dt :title="row.id">{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>
        </section>
      </div>

      <p
        v-else-if="meta.ok && !showHero && isFull"
        class="audio-meta-popper__hint"
      >
        无标签信息
      </p>
      <p
        v-else-if="meta.ok && !showHero && isMinimal"
        class="audio-meta-popper__hint"
      >
        无标签信息
      </p>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.audio-meta-popper {
  max-width: 100%;
  min-width: 0;
  font-size: 10px;
  line-height: 1.35;
  color: var(--app-text);
  box-sizing: border-box;

  &--minimal {
    max-width: min(260px, 88vw);
  }
}

.audio-meta-popper__path {
  margin: 0 0 6px;
  max-width: 300px;
  font-size: 9px;
  line-height: 1.45;
  opacity: 0.55;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-all;
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

  &--minimal {
    margin-bottom: 0;
  }
}

.audio-meta-popper__cover {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
  background: rgba(128, 128, 128, 0.15);
  cursor: pointer;

  &--minimal {
    width: 64px;
    height: 64px;
  }
}

.audio-meta-popper__hero-text {
  min-width: 0;
  flex: 1;
}

.audio-meta-popper--minimal .audio-meta-popper__hero-text:only-child {
  width: 100%;
}

.audio-meta-popper__title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
}

.audio-meta-popper--minimal .audio-meta-popper__title {
  font-size: 12px;
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
