<script setup lang="ts">
import {
  NIcon,
  NRadio,
  NRadioGroup,
  NTabPane,
  NTabs,
  NText,
  useMessage
} from 'naive-ui'
import {
  ColorPaletteOutline,
  FilterOutline,
  FolderOutline,
  OptionsOutline,
  SyncOutline
} from '@vicons/ionicons5'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import type { AppAppearance, PathFilterRule } from '@shared/appConfig'
import { APP_CONFIG_FILE_NAME } from '@shared/appConfig'
import { useThemeStore } from '@renderer/stores/theme'
import FolderPanel from './FolderPanel.vue'
import type { FileListColumnsSettings } from '@shared/appConfig'
import PathFilterRulesEditor from './PathFilterRulesEditor.vue'
import FileListColumnsEditor from './FileListColumnsEditor.vue'
import SyncFolderField from './SyncFolderField.vue'

const message = useMessage()
const configFilePath = ref('')

const pathFilterRules = defineModel<PathFilterRule[]>('pathFilterRules', {
  required: true
})

const searchRoots = defineModel<string[]>('searchRoots', {
  required: true
})

const lrcDirs = defineModel<string[]>('lrcDirs', {
  required: true
})

const decodeSourceDirs = defineModel<string[]>('decodeSourceDirs', {
  required: true
})

const syncLeftDir = defineModel<string>('syncLeftDir', {
  required: true
})

const syncLeftAlias = defineModel<string>('syncLeftAlias', {
  default: ''
})

const syncRightDir = defineModel<string>('syncRightDir', {
  required: true
})

const syncRightAlias = defineModel<string>('syncRightAlias', {
  default: ''
})

const fileListColumns = defineModel<FileListColumnsSettings>('fileListColumns', {
  required: true
})

const themeStore = useThemeStore()
const { appearance } = storeToRefs(themeStore)

type SettingsTab = 'general' | 'display' | 'paths' | 'sync' | 'filter'

const props = defineProps<{
  initialTab?: SettingsTab
}>()

const activeTab = ref<SettingsTab>(props.initialTab ?? 'general')

watch(
  () => props.initialTab,
  (tab) => {
    if (tab) activeTab.value = tab
  }
)

const appearanceOptions: { value: AppAppearance; label: string; desc: string }[] =
  [
    { value: 'light', label: '浅色', desc: '浅色背景，适合明亮环境' },
    { value: 'dark', label: '深色', desc: '深色背景，适合弱光环境' }
  ]

/** 设置页切换主题时委托给 theme store */
function onAppearanceChange(value: AppAppearance): void {
  themeStore.setAppearance(value)
}

onMounted(async () => {
  try {
    const { filePath } = await window.electronAPI.loadAppConfig()
    configFilePath.value = filePath
  } catch {
    /* 仅影响页脚展示 */
  }
})

/** 在资源管理器中打开配置文件所在目录并选中该文件 */
async function revealConfigFile(): Promise<void> {
  try {
    const { filePath } = await window.electronAPI.revealAppConfigInFolder()
    configFilePath.value = filePath
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-body">
      <NTabs
        v-model:value="activeTab"
        type="line"
        placement="left"
        class="settings-tabs"
        animated
      >
        <NTabPane name="general">
          <template #tab>
            <span class="settings-tab-label">
              <NIcon :size="18"><ColorPaletteOutline /></NIcon>
              常规
            </span>
          </template>

          <div class="settings-pane">
            <div class="settings-pane-body">
              <section class="settings-group">
                <h3 class="settings-group-title">界面主题</h3>
                <div class="settings-group-panel">
                  <NRadioGroup
                    :value="appearance"
                    class="appearance-group"
                    @update:value="onAppearanceChange"
                  >
                    <label
                      v-for="opt in appearanceOptions"
                      :key="opt.value"
                      class="appearance-option"
                      :class="{ 'appearance-option--active': appearance === opt.value }"
                    >
                      <NRadio :value="opt.value" />
                      <div class="appearance-option-text">
                        <span class="appearance-option-label">{{ opt.label }}</span>
                        <NText depth="3" class="appearance-option-desc">{{ opt.desc }}</NText>
                      </div>
                      <span
                        class="appearance-swatch"
                        :class="`appearance-swatch--${opt.value}`"
                        aria-hidden="true"
                      />
                    </label>
                  </NRadioGroup>
                </div>
              </section>
            </div>
          </div>
        </NTabPane>

        <NTabPane name="display">
          <template #tab>
            <span class="settings-tab-label">
              <NIcon :size="18"><OptionsOutline /></NIcon>
              显示
            </span>
          </template>

          <div class="settings-pane">
            <div class="settings-pane-body">
              <section class="settings-group">
                <h3 class="settings-group-title">文件列表列</h3>
                <p class="settings-group-desc settings-group-desc--block">
                  分别配置「音频搜索」与「音乐解码」结果表中显示的列
                </p>
                <div class="settings-columns-row">
                  <div class="settings-group-panel settings-group-panel--columns">
                    <span class="settings-sub-label">音频搜索</span>
                    <FileListColumnsEditor
                      v-model="fileListColumns"
                      kind="source"
                      hide-title
                    />
                  </div>
                  <div class="settings-group-panel settings-group-panel--columns">
                    <span class="settings-sub-label">音乐解码</span>
                    <FileListColumnsEditor
                      v-model="fileListColumns"
                      kind="decode"
                      hide-title
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </NTabPane>

        <NTabPane name="paths">
          <template #tab>
            <span class="settings-tab-label">
              <NIcon :size="18"><FolderOutline /></NIcon>
              路径
            </span>
          </template>

          <div class="settings-pane settings-pane--paths">
            <div class="settings-pane-body settings-pane-body--paths">
              <div class="settings-paths-row">
                <section class="settings-group settings-path-column">
                  <h3 class="settings-group-title">音频搜索目标</h3>
                  <p class="settings-group-desc">
                    递归子目录；扫描时会跳过 LRC 源目录
                  </p>
                  <FolderPanel
                    v-model="searchRoots"
                    class="settings-folder-panel"
                    hide-header
                    empty-text="添加搜索目标"
                  />
                </section>

                <section class="settings-group settings-path-column">
                  <h3 class="settings-group-title">LRC 源文件夹</h3>
                  <p class="settings-group-desc">递归扫描 .lrc 歌词文件</p>
                  <FolderPanel
                    v-model="lrcDirs"
                    class="settings-folder-panel"
                    hide-header
                    empty-text="添加 LRC 源"
                  />
                </section>

                <section class="settings-group settings-path-column">
                  <h3 class="settings-group-title">音乐解码浏览目录</h3>
                  <p class="settings-group-desc">
                    如 QQ 音乐、网易云等客户端的下载目录，用于浏览加密音乐
                  </p>
                  <FolderPanel
                    v-model="decodeSourceDirs"
                    class="settings-folder-panel"
                    hide-header
                    empty-text="添加用于浏览加密音乐的文件夹"
                  />
                </section>
              </div>
            </div>
          </div>
        </NTabPane>

        <NTabPane name="sync">
          <template #tab>
            <span class="settings-tab-label">
              <NIcon :size="18"><SyncOutline /></NIcon>
              同步设置
            </span>
          </template>

          <div class="settings-pane">
            <div class="settings-pane-body">
              <section class="settings-group">
                <h3 class="settings-group-title">曲库同步目录</h3>
                <p class="settings-group-desc settings-group-desc--block">
                  指定需要对比与同步的两个曲库根目录，例如本机文件夹与存储卡中的曲库
                </p>
                <div class="settings-sync-row">
                  <div class="settings-group-panel settings-sync-column">
                    <SyncFolderField
                      v-model="syncLeftDir"
                      v-model:alias="syncLeftAlias"
                      alias-placeholder="例如：本机曲库"
                      path-placeholder="选择左侧曲库目录"
                    />
                  </div>
                  <div class="settings-group-panel settings-sync-column">
                    <SyncFolderField
                      v-model="syncRightDir"
                      v-model:alias="syncRightAlias"
                      alias-placeholder="例如：存储卡曲库"
                      path-placeholder="选择右侧曲库目录"
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </NTabPane>

        <NTabPane name="filter">
          <template #tab>
            <span class="settings-tab-label">
              <NIcon :size="18"><FilterOutline /></NIcon>
              过滤
            </span>
          </template>

          <div class="settings-pane">
            <div class="settings-pane-body">
              <section class="settings-group">
                <h3 class="settings-group-title">名称过滤规则</h3>
                <div class="settings-group-panel">
                  <PathFilterRulesEditor v-model:rules="pathFilterRules" />
                </div>
              </section>
            </div>
          </div>
        </NTabPane>
      </NTabs>

      <footer class="settings-footer">
        <span class="config-file-line">
          配置文件
          <button
            type="button"
            class="config-file-link"
            :title="configFilePath || undefined"
            @click="revealConfigFile"
          >
            {{ APP_CONFIG_FILE_NAME }}
          </button>
          <span class="config-file-sep">·</span>
          点击打开 · 修改后需重启
        </span>
      </footer>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

$settings-inline-pad: 20px;
$settings-nav-width: 132px;
$settings-content-max: 720px;

.settings-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: $color-bg;
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0;
  box-sizing: border-box;
}

.settings-tabs {
  flex: 1;
  min-height: 0;
  width: 100%;

  :deep(.n-tabs) {
    height: 100%;
  }

  :deep(.n-tabs-nav-scroll-content) {
    padding: 12px 0;
  }

  :deep(.n-tabs-nav) {
    width: $settings-nav-width;
    flex-shrink: 0;
    padding: 8px 0 8px 12px;
    box-sizing: border-box;
    border-right: 1px solid $border-subtle;
    background: $surface-panel;
  }

  :deep(.n-tabs-tab) {
    justify-content: flex-start;
    padding: 8px 12px !important;
    font-size: 13px;
  }

  :deep(.n-tabs-tab__label) {
    width: 100%;
  }

  :deep(.n-tabs-pane-wrapper) {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: 0;
    box-sizing: border-box;
    background: $color-bg;
  }

  :deep(.n-tab-pane) {
    height: 100%;
    overflow: hidden;
    padding: 0 !important;
    box-sizing: border-box;
  }
}

.settings-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  line-height: 1.2;
}

.settings-pane {
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 24px 28px 32px;
  box-sizing: border-box;

  &--paths {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
}

.settings-pane-body {
  max-width: $settings-content-max;
  display: flex;
  flex-direction: column;
  gap: 0;

  &--paths {
    flex: 1;
    min-height: 0;
    max-width: none;
    width: 100%;
  }
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.settings-group-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.settings-group-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  opacity: 0.6;

  &--block {
    margin-top: -4px;
    margin-bottom: 4px;
  }
}

.settings-sub-label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.75;
}

.settings-group-panel {
  margin-top: 4px;
  padding: 14px 16px;
  background: $surface-panel;
  border: 1px solid $border-subtle;
  border-radius: $radius-panel;

  &--flush {
    padding: 16px;
  }

  &--columns {
    padding: 12px 14px 14px;
    min-height: 0;
  }
}

.settings-columns-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 4px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
}

.settings-sync-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 4px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
}

.settings-sync-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.settings-paths-row {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
}

.settings-path-column {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.settings-folder-panel {
  flex: 1;
  margin-top: 4px;
  min-height: 160px;
  background: $surface-panel;
  border: 1px solid $border-subtle;
  border-radius: $radius-panel;

  .settings-path-column & {
    min-height: 0;
    max-height: none;
  }
}

.appearance-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.appearance-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: $radius-icon;
  border: 1px solid $border-subtle;
  background: var(--app-surface-raised);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;

  &:hover {
    border-color: var(--app-border-hover);
  }

  &--active {
    border-color: $color-primary;
    background: var(--app-surface-active);
  }
}

.appearance-option-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.appearance-option-label {
  font-size: 14px;
  font-weight: 600;
}

.appearance-option-desc {
  font-size: 12px;
}

.appearance-swatch {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  flex-shrink: 0;
  border: 1px solid $border-subtle;

  &--dark {
    background: linear-gradient(135deg, #1a1d26 50%, #0f1117 50%);
  }

  &--light {
    background: linear-gradient(135deg, #ffffff 50%, #e8eaed 50%);
  }
}

.settings-footer {
  flex-shrink: 0;
  padding: 5px 12px 8px;
  border-top: 1px solid $border-subtle;
  background: transparent;
}

.config-file-line {
  display: block;
  font-size: 10px;
  line-height: 1.2;
  opacity: 0.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.config-file-link {
  margin: 0 2px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: inherit;
  color: $color-primary;
  text-decoration: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
    text-underline-offset: 1px;
    opacity: 0.85;
  }
}

.config-file-sep {
  margin: 0 3px;
  opacity: 0.45;
}
</style>
