<script setup lang="ts">
import {
    NConfigProvider,
    NMessageProvider,
    darkTheme,
    dateZhCN,
    zhCN,
    type GlobalThemeOverrides
} from 'naive-ui'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from '@renderer/stores/theme'
import App from './App.vue'
import styleTokens from './styles/variables.module.scss'

const themeStore = useThemeStore()
const { appearance } = storeToRefs(themeStore)

const naiveTheme = computed(() =>
    appearance.value === 'dark' ? darkTheme : null
)

const themeOverrides: GlobalThemeOverrides = {
    common: {
        primaryColor: '#6ea8fe',
        primaryColorHover: '#8bb9ff',
        primaryColorPressed: '#5a94eb',
        borderRadius: styleTokens.borderRadius,
        fontFamily:
            "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    },
    Card: {
        color: 'transparent'
    },
    Popover: {
        fontSize: '12px'
    },
    Tooltip: {
        peers: {
            Popover: {
                fontSize: '12px'
            }
        }
    }
}
</script>

<template>
    <NConfigProvider
        :locale="zhCN"
        :date-locale="dateZhCN"
        :theme="naiveTheme"
        :theme-overrides="themeOverrides"
    >
        <NMessageProvider>
            <App />
        </NMessageProvider>
    </NConfigProvider>
</template>
