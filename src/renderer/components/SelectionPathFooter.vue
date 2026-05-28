<script setup lang="ts">
defineProps<{
    path: string | null
}>()
</script>

<template>
    <p v-if="path" class="selection-path-footer" :title="path">
        {{ path }}
    </p>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.selection-path-footer {
    flex-shrink: 0;
    margin: 0;
    padding: 2px 10px 4px;
    font-size: 10px;
    line-height: 1.2;
    opacity: 0.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-top: 1px solid $border-subtle;
    background: inherit;
}
</style>
