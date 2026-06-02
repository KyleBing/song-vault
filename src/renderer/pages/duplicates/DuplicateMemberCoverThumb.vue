<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { MusicalNotesOutline } from '@vicons/ionicons5'
import { computed, ref, watch } from 'vue'
import type { AudioFileMetaInfo } from '@shared/audioFileMeta'
import { isMusicFilePathForMetaHover } from '@shared/isAudioFilePath'
import { useAudioMetaCache } from '@renderer/composables/useAudioMetaCache'

const props = defineProps<{
    filePath: string
}>()

const emit = defineEmits<{
    compare: []
}>()

const { getMeta } = useAudioMetaCache()
const meta = ref<AudioFileMetaInfo | null>(null)

const showCover = computed(() => Boolean(meta.value?.coverDataUrl))

watch(
    () => props.filePath,
    async (path) => {
        meta.value = null
        if (!path || !isMusicFilePathForMetaHover(path)) return
        meta.value = await getMeta(path)
    },
    { immediate: true }
)

function onCoverClick(): void {
    emit('compare')
}
</script>

<template>
    <img
        v-if="showCover && meta?.coverDataUrl"
        class="dup-member-cover"
        :src="meta.coverDataUrl"
        alt="专辑封面"
        title="点击查看组内封面对比"
        @click.stop="onCoverClick"
    />
    <button
        v-else
        type="button"
        class="dup-member-cover dup-member-cover--fallback"
        aria-label="查看组内封面对比"
        title="点击查看组内封面对比"
        @click.stop="onCoverClick"
    >
        <NIcon :size="16">
            <MusicalNotesOutline />
        </NIcon>
    </button>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.dup-member-cover {
    width: 36px;
    height: 36px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
    background: rgba(128, 128, 128, 0.12);
    cursor: pointer;
}

.dup-member-cover--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    background: var(--app-cover-placeholder-bg);
    border: 1px solid $border-subtle;
    color: var(--app-cover-placeholder-icon);

    :deep(.n-icon) {
        opacity: 0.9;
    }
}
</style>
