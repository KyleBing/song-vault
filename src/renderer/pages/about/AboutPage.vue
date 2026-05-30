<script setup lang="ts">
import { NScrollbar, NTabPane, NTabs, NTag } from 'naive-ui'
import { computed, ref } from 'vue'
import {
  APP_DISPLAY_NAME,
  APP_TAGLINE,
  APP_VERSION
} from '@shared/appInfo'
import { CHANGELOG_RELEASES } from '@shared/changelog'
import AcknowledgmentsPage from './AcknowledgmentsPage.vue'
import DecryptHelpPage from './DecryptHelpPage.vue'

type AboutTab = 'changelog' | 'decrypt' | 'acknowledgments'

const activeTab = ref<AboutTab>('changelog')

const sectionTone: Record<string, 'add' | 'change' | 'fix' | 'default'> = {
  新增: 'add',
  变更: 'change',
  修复: 'fix'
}

function sectionClass(title: string): string {
  return `changelog-section--${sectionTone[title] ?? 'default'}`
}

function isCurrentRelease(version: string): boolean {
  return version === APP_VERSION
}

/** 将 YYYY-MM-DD 格式化为本地可读日期 */
function formatReleaseDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${y}年${m}月${d}日`
}

const latestVersion = computed(() => CHANGELOG_RELEASES[0]?.version ?? APP_VERSION)
</script>

<template>
  <div class="about-page">
    <div class="about-layout">
      <aside class="about-aside">
        <img
          class="about-aside__logo"
          src="/icon.png"
          :alt="APP_DISPLAY_NAME"
          width="96"
          height="96"
        />
        <h1 class="about-aside__name">{{ APP_DISPLAY_NAME }}</h1>
        <p class="about-aside__tagline">{{ APP_TAGLINE }}</p>
        <div class="about-aside__meta">
          <NTag size="small" :bordered="false" type="info" round>
            v{{ APP_VERSION }}
          </NTag>
          <span
            v-if="latestVersion !== APP_VERSION"
            class="about-aside__latest-hint"
          >
            最新发布 v{{ latestVersion }}
          </span>
        </div>
      </aside>

      <section class="about-main" aria-label="关于">
        <NTabs
          v-model:value="activeTab"
          type="line"
          class="about-tabs"
          animated
        >
          <NTabPane name="changelog" tab="更新日志">
            <NScrollbar class="about-main-scroll">
              <div class="about-main-inner">
                <article
                  v-for="release in CHANGELOG_RELEASES"
                  :key="release.version"
                  class="changelog-release"
                  :class="{
                    'changelog-release--current': isCurrentRelease(release.version)
                  }"
                >
                  <header class="changelog-release__head">
                    <h3 class="changelog-release__title">
                      <span class="changelog-release__version">v{{ release.version }}</span>
                      <span class="changelog-release__sep" aria-hidden="true">·</span>
                      <time
                        class="changelog-release__date"
                        :datetime="release.date"
                      >
                        {{ formatReleaseDate(release.date) }}
                      </time>
                    </h3>
                    <NTag
                      v-if="isCurrentRelease(release.version)"
                      size="small"
                      :bordered="false"
                      type="success"
                      round
                    >
                      当前版本
                    </NTag>
                  </header>

                  <div class="changelog-release__body">
                    <div
                      v-for="(section, index) in release.sections"
                      :key="`${release.version}-${index}`"
                      class="changelog-section"
                      :class="sectionClass(section.title)"
                    >
                      <h4 class="changelog-section__title">{{ section.title }}</h4>
                      <ul class="changelog-section__list">
                        <li
                          v-for="(item, itemIndex) in section.items"
                          :key="itemIndex"
                        >
                          {{ item }}
                        </li>
                      </ul>
                    </div>
                  </div>
                </article>
              </div>
            </NScrollbar>
          </NTabPane>

          <NTabPane name="decrypt" tab="解密说明">
            <DecryptHelpPage class="about-decrypt-pane" />
          </NTabPane>

          <NTabPane name="acknowledgments" tab="开源致谢">
            <AcknowledgmentsPage class="about-decrypt-pane" />
          </NTabPane>
        </NTabs>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

$about-aside-width: 300px;

.about-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: $color-bg;
}

.about-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;

  @media (max-width: 720px) {
    flex-direction: column;
  }
}

.about-aside {
  flex-shrink: 0;
  width: $about-aside-width;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px 24px;
  border-right: 1px solid $border-subtle;
  background:
    radial-gradient(ellipse 90% 70% at 20% 15%, $glow-primary, transparent),
    radial-gradient(ellipse 60% 50% at 80% 90%, $glow-accent, transparent),
    $surface-sidebar;
  box-sizing: border-box;

  @media (max-width: 720px) {
    width: 100%;
    height: auto;
    border-right: none;
    border-bottom: 1px solid $border-subtle;
    padding: 28px 20px;
  }
}

.about-aside__logo {
  width: 96px;
  height: 96px;
  border-radius: $radius-icon;
  object-fit: contain;
  flex-shrink: 0;
}

.about-aside__name {
  margin: 20px 0 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}

.about-aside__tagline {
  margin: 10px 0 0;
  max-width: 240px;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.62;
}

.about-aside__meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
}

.about-aside__latest-hint {
  font-size: 11px;
  opacity: 0.5;
}

.about-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: $color-bg;
}

.about-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  :deep(.n-tabs-nav) {
    flex-shrink: 0;
    padding: 0 24px;
    border-bottom: 1px solid $border-subtle;
    background: $surface-panel;
  }

  :deep(.n-tabs-tab) {
    padding: 12px 4px !important;
    font-size: 13px;
    font-weight: 500;
  }

  :deep(.n-tabs-pane-wrapper) {
    flex: 1;
    min-height: 0;
  }

  :deep(.n-tab-pane) {
    height: 100%;
    padding: 0 !important;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
}

.about-decrypt-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.about-main-scroll {
  flex: 1;
  min-height: 0;
}

.about-main-inner {
  max-width: 720px;
  padding: 20px 28px 40px;
  box-sizing: border-box;

  @media (max-width: 720px) {
    max-width: none;
    padding: 16px 16px 32px;
  }
}

.changelog-release {
  margin-bottom: 16px;
  border-radius: $radius-panel;
  border: 1px solid $border-subtle;
  background: $surface-panel;
  overflow: hidden;

  &:last-child {
    margin-bottom: 0;
  }

  &--current {
    border-color: rgba(110, 168, 254, 0.35);
    box-shadow: 0 0 0 1px rgba(110, 168, 254, 0.12);
  }
}

.changelog-release__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 18px;
  border-bottom: 1px solid $border-subtle;
  background: $surface-sidebar;
}

.changelog-release__title {
  margin: 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 10px;
  font-size: inherit;
  font-weight: inherit;
}

.changelog-release__version {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.changelog-release__sep {
  opacity: 0.35;
  font-weight: 400;
}

.changelog-release__date {
  font-size: 14px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  opacity: 0.55;
}

.changelog-release__body {
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.changelog-section {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 4px 14px;
  align-items: start;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}

.changelog-section__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.55;
  text-align: right;

  @media (max-width: 480px) {
    text-align: left;
  }
}

.changelog-section--add .changelog-section__title {
  color: $color-success;
}

.changelog-section--change .changelog-section__title {
  color: $color-primary-light;
}

.changelog-section--fix .changelog-section__title {
  opacity: 0.72;
}

.changelog-section__list {
  margin: 0;
  padding-left: 1.15em;
  font-size: 13px;
  line-height: 1.55;
  opacity: 0.9;

  li + li {
    margin-top: 6px;
  }
}
</style>
