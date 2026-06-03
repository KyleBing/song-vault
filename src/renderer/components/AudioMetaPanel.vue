<script setup lang="ts">
import { CreateOutline, MusicalNotesOutline } from '@vicons/ionicons5'
import { NButton, NIcon, NTabPane, NTabs, NTooltip } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import AudioMetaEditModal from '@renderer/components/AudioMetaEditModal.vue'
import { useAudioCoverLightbox } from '@renderer/composables/useAudioCoverLightbox'
import { useAudioMetaCache } from '@renderer/composables/useAudioMetaCache'
import { isMusicFilePathForMetaHover } from '@shared/isAudioFilePath'
import { isEditableAudioMetaPath } from '@shared/audioMetaEdit'
import type { AudioFileMetaInfo } from '@shared/audioFileMeta'
import {
  buildExtendedMetaSections,
  buildRegularMetaRows,
  buildMusicBrainzMetaRows,
  buildVorbisMetaRows,
  splitDisplayValues
} from '@renderer/utils/audioMetaPanelRows'

const props = defineProps<{
  /** 当前展示元数据的文件路径；多选时传第一个 */
  filePath: string | null
}>()

const activeTab = ref<'regular' | 'vorbis' | 'musicbrainz' | 'extended'>(
  'regular'
)
const meta = ref<AudioFileMetaInfo | null>(null)
const editModalVisible = ref(false)

const { getMeta, invalidateMeta } = useAudioMetaCache()

const canLoadMeta = computed(
  () => !!props.filePath && isMusicFilePathForMetaHover(props.filePath)
)

const canEditMeta = computed(
  () => !!props.filePath && isEditableAudioMetaPath(props.filePath) && meta.value?.ok
)

const regularRows = computed(() => buildRegularMetaRows(meta.value))

const vorbisRows = computed(() => buildVorbisMetaRows(meta.value))

const musicBrainzRows = computed(() => buildMusicBrainzMetaRows(meta.value))

const showVorbisTab = computed(() => vorbisRows.value.length > 0)

const showMusicBrainzTab = computed(() => musicBrainzRows.value.length > 0)

const extendedRows = computed(() => {
  const sections = buildExtendedMetaSections(meta.value)
  return [...sections.common, ...sections.format, ...sections.native]
})

const hasExtended = computed(() => extendedRows.value.length > 0)

const showCover = computed(() => Boolean(meta.value?.coverDataUrl))

const { open: openCoverLightbox } = useAudioCoverLightbox()

function onCoverClick(): void {
  if (!showCover.value) return
  const src = meta.value?.coverDataUrl
  if (src) openCoverLightbox(src)
}

function openEditModal(): void {
  if (!canEditMeta.value) return
  editModalVisible.value = true
}

async function reloadMeta(): Promise<void> {
  const path = props.filePath
  if (!path || !isMusicFilePathForMetaHover(path)) return
  invalidateMeta(path)
  meta.value = await getMeta(path)
}

async function onMetaSaved(): Promise<void> {
  await reloadMeta()
}

watch(
  () => props.filePath,
  async (path) => {
    activeTab.value = 'regular'
    meta.value = null
    if (!path || !isMusicFilePathForMetaHover(path)) return
    meta.value = await getMeta(path)
  },
  { immediate: true }
)

watch([showVorbisTab, showMusicBrainzTab], () => {
  if (activeTab.value === 'vorbis' && !showVorbisTab.value) {
    activeTab.value = 'regular'
  }
  if (activeTab.value === 'musicbrainz' && !showMusicBrainzTab.value) {
    activeTab.value = 'regular'
  }
})
</script>

<template>
  <div class="audio-meta-panel">
    <p v-if="!filePath" class="audio-meta-panel__empty-hint">
      选中歌曲以查看元数据
    </p>

    <p v-else-if="!canLoadMeta" class="audio-meta-panel__empty-hint">
      该文件类型不支持读取标签
    </p>

    <div v-else class="audio-meta-panel__body">
      <NTabs
        v-model:value="activeTab"
        type="line"
        size="small"
        class="audio-meta-panel__tabs"
      >
        <template #suffix>
          <NTooltip v-if="canEditMeta">
            <template #trigger>
              <NButton
                quaternary
                size="tiny"
                class="audio-meta-panel__edit-btn"
                @click="openEditModal"
              >
                <template #icon>
                  <NIcon :size="16"><CreateOutline /></NIcon>
                </template>
              </NButton>
            </template>
            编辑元数据
          </NTooltip>
        </template>

        <NTabPane name="regular" tab="常规">
          <div v-if="meta" class="audio-meta-panel__regular">
            <img
              v-if="showCover && meta.coverDataUrl"
              class="audio-meta-panel__cover"
              :src="meta.coverDataUrl"
              alt="专辑封面"
              title="点击查看原图"
              @click.stop="onCoverClick"
            />
            <div
              v-else
              class="audio-meta-panel__cover audio-meta-panel__cover-fallback"
              role="img"
              aria-label="无专辑封面"
            >
              <NIcon :size="36">
                <MusicalNotesOutline />
              </NIcon>
            </div>
            <dl class="audio-meta-panel__dl">
              <template v-for="row in regularRows" :key="row.key">
                <dt :title="row.key">{{ row.label }}</dt>
                <dd>
                  <ul
                    v-if="splitDisplayValues(row.value).length > 1"
                    class="audio-meta-panel__value-list"
                  >
                    <li
                      v-for="(item, i) in splitDisplayValues(row.value)"
                      :key="i"
                    >
                      {{ item }}
                    </li>
                  </ul>
                  <template v-else>{{ row.value }}</template>
                </dd>
              </template>
            </dl>
            <p
              v-if="!regularRows.length && meta.ok"
              class="audio-meta-panel__hint"
            >
              无常规标签信息
            </p>
            <p v-if="meta.message && !meta.ok" class="audio-meta-panel__hint">
              {{ meta.message }}
            </p>
          </div>
        </NTabPane>

        <NTabPane name="extended" tab="扩展">
          <div v-if="meta" class="audio-meta-panel__scroll-body">
            <dl v-if="hasExtended" class="audio-meta-panel__dl">
              <template v-for="row in extendedRows" :key="row.key">
                <dt :title="row.key">{{ row.label }}</dt>
                <dd>
                  <ul
                    v-if="splitDisplayValues(row.value).length > 1"
                    class="audio-meta-panel__value-list"
                  >
                    <li
                      v-for="(item, i) in splitDisplayValues(row.value)"
                      :key="i"
                    >
                      {{ item }}
                    </li>
                  </ul>
                  <template v-else>{{ row.value }}</template>
                </dd>
              </template>
            </dl>
            <p v-else class="audio-meta-panel__hint">无其它元数据</p>
          </div>
        </NTabPane>

        <NTabPane v-if="showVorbisTab" name="vorbis" tab="Vorbis">
          <div v-if="meta" class="audio-meta-panel__scroll-body">
            <dl class="audio-meta-panel__dl">
              <template v-for="row in vorbisRows" :key="row.key">
                <dt :title="row.key">{{ row.label }}</dt>
                <dd>
                  <ul
                    v-if="splitDisplayValues(row.value).length > 1"
                    class="audio-meta-panel__value-list"
                  >
                    <li
                      v-for="(item, i) in splitDisplayValues(row.value)"
                      :key="i"
                    >
                      {{ item }}
                    </li>
                  </ul>
                  <template v-else>{{ row.value }}</template>
                </dd>
              </template>
            </dl>
          </div>
        </NTabPane>

        <NTabPane v-if="showMusicBrainzTab" name="musicbrainz" tab="MusicBrainz">
          <div v-if="meta" class="audio-meta-panel__scroll-body">
            <dl class="audio-meta-panel__dl">
              <template v-for="row in musicBrainzRows" :key="row.key">
                <dt :title="row.key">{{ row.label }}</dt>
                <dd>
                  <ul
                    v-if="splitDisplayValues(row.value).length > 1"
                    class="audio-meta-panel__value-list"
                  >
                    <li
                      v-for="(item, i) in splitDisplayValues(row.value)"
                      :key="i"
                    >
                      {{ item }}
                    </li>
                  </ul>
                  <template v-else>{{ row.value }}</template>
                </dd>
              </template>
            </dl>
          </div>
        </NTabPane>
      </NTabs>
    </div>

    <AudioMetaEditModal
      v-model:show="editModalVisible"
      :file-path="filePath"
      :meta="meta"
      @saved="onMetaSaved"
    />
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.audio-meta-panel {
  height: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-top: 1px solid $border-subtle;
  background: $surface-sidebar;
  overflow: hidden;
}

.audio-meta-panel__empty-hint {
  flex: 1;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  text-align: center;
  font-size: 10px;
  line-height: 1.35;
  opacity: 0.42;
}

.audio-meta-panel__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.audio-meta-panel__tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 8px 6px;

  :deep(.n-tabs-nav) {
    flex-shrink: 0;
  }

  :deep(.n-tabs-nav-scroll-content) {
    align-items: center;
  }

  /* line 类型默认 tabGap 为 36px，用 n-tabs-tab-pad 撑开；此处去掉 pad 并改用较小间距 */
  :deep(.n-tabs) {
    --n-tab-gap: 0;
  }

  :deep(.n-tabs-tab-pad) {
    width: 10px;
  }

  :deep(.n-tabs-tab-wrapper + .n-tabs-tab-wrapper) {
    margin-left: 8px;
  }

  :deep(.n-tabs-tab) {
    font-size: 13px;
  }

  :deep(.n-tab-pane) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}

.audio-meta-panel__regular {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-top: 6px;
  min-height: 0;
  overflow: auto;

  .audio-meta-panel__dl {
    flex: 1;
    min-width: 0;
    align-self: flex-start;
  }
}

.audio-meta-panel__cover {
  width: 88px;
  height: 88px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid $border-subtle;
  flex-shrink: 0;
  background: rgba(128, 128, 128, 0.12);
  cursor: pointer;
}

.audio-meta-panel__cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  object-fit: unset;
  background: var(--app-cover-placeholder-bg);
  border: 1px solid $border-subtle;
  color: var(--app-cover-placeholder-icon);

  :deep(.n-icon) {
    opacity: 0.9;
  }
}

.audio-meta-panel__scroll-body {
  padding-top: 6px;
  min-height: 0;
  max-height: 100%;
  overflow: auto;
}

.audio-meta-panel__dl {
  margin: 0;
  display: grid;
  grid-template-columns: minmax(72px, 34%) 1fr;
  column-gap: 8px;
  row-gap: 3px;
  font-size: 11px;
  line-height: 1.35;
}

.audio-meta-panel__dl dt {
  margin: 0;
  opacity: 0.55;
  word-break: break-word;
}

.audio-meta-panel__dl dd {
  margin: 0;
  word-break: break-word;
}

.audio-meta-panel__value-list {
  margin: 0;
  padding: 0;
  list-style: none;

  li + li {
    margin-top: 2px;
  }
}

.audio-meta-panel__hint {
  margin: 0;
  font-size: 11px;
  opacity: 0.55;
}

.audio-meta-panel__edit-btn {
  margin-right: -4px;
}
</style>
