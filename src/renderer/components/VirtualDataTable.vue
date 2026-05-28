<script setup lang="ts">
import { NDataTable } from 'naive-ui'
import {
  DATA_TABLE_HEADER_HEIGHT,
  DATA_TABLE_ROW_HEIGHT,
  dataTableHeightForRow
} from '@renderer/constants/dataTableVirtualScroll'
</script>

<template>
  <NDataTable
    virtual-scroll
    :min-row-height="DATA_TABLE_ROW_HEIGHT"
    :header-height="DATA_TABLE_HEADER_HEIGHT"
    :height-for-row="dataTableHeightForRow"
    v-bind="$attrs"
  />
</template>
