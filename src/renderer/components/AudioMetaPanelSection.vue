<script setup lang="ts">
import AudioMetaPanel from '@renderer/components/AudioMetaPanel.vue'
import SelectionPathFooter from '@renderer/components/SelectionPathFooter.vue'

defineProps<{
    /** 当前展示元数据的文件路径；仅单选时传入 */
    filePath: string | null
}>()

defineEmits<{
    saved: []
}>()
</script>

<template>
    <div v-if="filePath" class="audio-meta-panel-section">
        <SelectionPathFooter :path="filePath" />
        <AudioMetaPanel :file-path="filePath" @saved="$emit('saved')" />
    </div>
</template>

<style lang="scss" scoped>
.audio-meta-panel-section {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
}
</style>
