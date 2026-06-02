<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { MusicalNotesOutline } from '@vicons/ionicons5'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { AudioFileMetaInfo } from '@shared/audioFileMeta'
import { duplicateMemberKey } from '@shared/libraryDuplicateTypes'
import { isMusicFilePathForMetaHover } from '@shared/isAudioFilePath'
import { joinUnderRoot } from '@shared/pathLite'
import { useDuplicateCoverCompare } from '@renderer/composables/useDuplicateCoverCompare'
import { useAudioMetaCache } from '@renderer/composables/useAudioMetaCache'
import { formatCoverDataUrlMeta } from '@renderer/utils/coverDataUrlMeta'
import { duplicateMemberMetricsLabel } from './duplicateMemberMetrics'

const props = defineProps<{
    keepKeys: Record<string, string>
}>()

const emit = defineEmits<{
    'update:keepKey': [groupId: string, key: string]
}>()

const { payload, close } = useDuplicateCoverCompare()
const { getMeta } = useAudioMetaCache()

const coverByPath = ref<Record<string, string | undefined>>({})
const coverPixelSizeByPath = ref<
    Record<string, { width: number; height: number } | undefined>
>({})
let loadGeneration = 0

const visible = computed(() => payload.value !== null)

const title = computed(() => payload.value?.group.fileName ?? '')

const members = computed(() => payload.value?.group.members ?? [])

const keepKey = computed(() => {
    const current = payload.value
    if (!current) return ''
    return (
        props.keepKeys[current.group.id] ?? current.group.suggestedKeepKey
    )
})

async function loadCovers(): Promise<void> {
    const current = payload.value
    if (!current) {
        coverByPath.value = {}
        coverPixelSizeByPath.value = {}
        return
    }

    const gen = ++loadGeneration
    const next: Record<string, string | undefined> = {}

    await Promise.all(
        current.group.members.map(async (member) => {
            const fullPath = joinUnderRoot(current.scanRoot, member.relativePath)
            if (!isMusicFilePathForMetaHover(fullPath)) {
                next[member.relativePath] = undefined
                return
            }
            const meta: AudioFileMetaInfo = await getMeta(fullPath)
            next[member.relativePath] = meta.coverDataUrl
        })
    )

    if (gen !== loadGeneration) return
    coverByPath.value = next
    coverPixelSizeByPath.value = {}
}

function coverMetaLabel(relativePath: string): string {
    return formatCoverDataUrlMeta(
        coverByPath.value[relativePath],
        coverPixelSizeByPath.value[relativePath]
    )
}

function onCoverLoad(relativePath: string, event: Event): void {
    const img = event.target
    if (!(img instanceof HTMLImageElement)) return
    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return
    coverPixelSizeByPath.value = {
        ...coverPixelSizeByPath.value,
        [relativePath]: {
            width: img.naturalWidth,
            height: img.naturalHeight
        }
    }
}

function selectKeep(key: string): void {
    const current = payload.value
    if (!current) return
    emit('update:keepKey', current.group.id, key)
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && visible.value) {
        event.preventDefault()
        close()
    }
}

watch(payload, () => {
    void loadCovers()
})

onMounted(() => {
    window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
    <Teleport to="body">
        <div v-if="visible" class="dup-cover-compare-root">
            <div
                class="dup-cover-compare-backdrop"
                aria-hidden="true"
                @click="close"
            />
            <section
                class="dup-cover-compare-panel"
                role="dialog"
                aria-modal="true"
                :aria-label="`${title} 封面对比`"
                @click.stop
            >
                <header class="dup-cover-compare-head">
                    <div class="dup-cover-compare-head__text">
                        <h2 class="dup-cover-compare-title">{{ title }}</h2>
                        <p class="dup-cover-compare-subtitle">
                            {{ members.length }} 份重复 · 点击卡片选择要保留的一份
                        </p>
                    </div>
                    <button
                        type="button"
                        class="dup-cover-compare-close"
                        aria-label="关闭"
                        @click="close"
                    >
                        ×
                    </button>
                </header>

                <div class="dup-cover-compare-scroll" role="listbox" aria-label="选择要保留的副本">
                    <button
                        v-for="member in members"
                        :key="duplicateMemberKey(member.relativePath)"
                        type="button"
                        class="dup-cover-compare-card-btn"
                        :class="{
                            'dup-cover-compare-card-btn--keep':
                                duplicateMemberKey(member.relativePath) === keepKey
                        }"
                        role="option"
                        :aria-selected="
                            duplicateMemberKey(member.relativePath) === keepKey
                        "
                        @click="
                            selectKeep(duplicateMemberKey(member.relativePath))
                        "
                    >
                        <article class="dup-cover-compare-card">
                            <div class="dup-cover-compare-card__cover-wrap">
                                <img
                                    v-if="coverByPath[member.relativePath]"
                                    class="dup-cover-compare-card__cover"
                                    :src="coverByPath[member.relativePath]"
                                    alt="专辑封面"
                                    @load="onCoverLoad(member.relativePath, $event)"
                                />
                                <div
                                    v-else
                                    class="dup-cover-compare-card__cover dup-cover-compare-card__cover--fallback"
                                    role="img"
                                    aria-label="无专辑封面"
                                >
                                    <NIcon :size="52">
                                        <MusicalNotesOutline />
                                    </NIcon>
                                </div>
                                <p class="dup-cover-compare-card__cover-meta">
                                    {{ coverMetaLabel(member.relativePath) }}
                                </p>
                            </div>

                            <p
                                class="dup-cover-compare-card__path"
                                :title="member.relativePath"
                            >
                                {{ member.relativePath }}
                            </p>
                            <p class="dup-cover-compare-card__metrics">
                                {{ duplicateMemberMetricsLabel(member) }}
                            </p>
                        </article>
                    </button>
                </div>
            </section>
        </div>
    </Teleport>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.dup-cover-compare-root {
    position: fixed;
    inset: 0;
    z-index: 20000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    pointer-events: auto;
}

.dup-cover-compare-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    cursor: pointer;
}

.dup-cover-compare-panel {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: fit-content;
    max-width: min(1180px, calc(100vw - 48px));
    max-height: min(92vh, 820px);
    margin: auto;
    border-radius: 10px;
    border: 1px solid $border-subtle;
    background: var(--app-surface-panel, $surface-panel);
    box-shadow: 0 18px 48px rgb(0 0 0 / 22%);
    overflow: hidden;
    min-width: 0;
}

.dup-cover-compare-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px 12px;
    border-bottom: 1px solid $border-subtle;
}

.dup-cover-compare-head__text {
    min-width: 0;
}

.dup-cover-compare-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dup-cover-compare-subtitle {
    margin: 4px 0 0;
    font-size: 11px;
    opacity: 0.65;
    line-height: 1.3;
}

.dup-cover-compare-close {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    opacity: 0.7;

    &:hover {
        opacity: 1;
        background: rgba(128, 128, 128, 0.12);
    }
}

.dup-cover-compare-scroll {
    display: flex;
    flex-wrap: nowrap;
    justify-content: center;
    align-items: flex-start;
    gap: 18px;
    padding: 18px 20px 20px;
    overflow-x: hidden;
    overflow-y: auto;
    min-width: 0;
}

.dup-cover-compare-card-btn {
    flex: 0 1 248px;
    min-width: 0;
    max-width: 248px;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    text-align: inherit;
    font: inherit;
    cursor: pointer;

    &--keep .dup-cover-compare-card {
        border-color: rgba(34, 197, 94, 0.45);
        background: rgba(34, 197, 94, 0.08);
    }

    &:hover:not(.dup-cover-compare-card-btn--keep) .dup-cover-compare-card {
        border-color: rgba(110, 168, 254, 0.35);
    }

    &--keep:hover .dup-cover-compare-card {
        border-color: rgba(34, 197, 94, 0.55);
    }
}

.dup-cover-compare-card {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid $border-subtle;
    background: var(--app-surface-raised);
    box-sizing: border-box;
}

.dup-cover-compare-card__cover-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 100%;
}

.dup-cover-compare-card__cover {
    width: 100%;
    max-width: 220px;
    aspect-ratio: 1;
    height: auto;
    object-fit: cover;
    border-radius: 8px;
    background: rgba(128, 128, 128, 0.12);
}

.dup-cover-compare-card__cover-meta {
    margin: 0;
    width: 100%;
    font-size: 10px;
    line-height: 1.35;
    text-align: center;
    opacity: 0.72;
    font-variant-numeric: tabular-nums;
}

.dup-cover-compare-card__cover--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--app-cover-placeholder-bg);
    border: 1px solid $border-subtle;
    color: var(--app-cover-placeholder-icon);
}

.dup-cover-compare-card__path {
    margin: 0;
    font-family: $font-mono;
    font-size: 11px;
    line-height: 1.35;
    word-break: break-all;
    opacity: 0.9;
}

.dup-cover-compare-card__metrics {
    margin: 0;
    font-size: 11px;
    line-height: 1.35;
    opacity: 0.72;
    font-variant-numeric: tabular-nums;
}
</style>
