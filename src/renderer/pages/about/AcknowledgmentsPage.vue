<script setup lang="ts">
import { NScrollbar } from 'naive-ui'
import unlockMusicLicense from '@unlock/LICENSE?raw'
</script>

<template>
  <NScrollbar class="ack-scroll">
    <div class="ack-body">
      <p class="ack-lead">
        本应用部分功能基于开源项目实现。以下为相关项目的版权与许可说明；修改与再分发时请遵循各自授权协议。
      </p>

      <section class="ack-project">
        <h2>Unlock Music</h2>
        <p>
          「音乐解码」功能的离线解密算法改编自
          <a
            href="https://git.unlock-music.dev/um/web"
            target="_blank"
            rel="noopener noreferrer"
          >Unlock Music</a>
          项目（Web 版），用于在本地转换已下载的加密音乐文件，仅供个人学习与研究。
        </p>

        <dl class="ack-meta">
          <div class="ack-meta__row">
            <dt>作者</dt>
            <dd>
              <a
                href="https://github.com/ix64"
                target="_blank"
                rel="noopener noreferrer"
              >MengYX</a>
              （<a
                href="https://github.com/ix64"
                target="_blank"
                rel="noopener noreferrer"
              >@ix64</a>）
            </dd>
          </div>
          <div class="ack-meta__row">
            <dt>许可</dt>
            <dd>MIT License</dd>
          </div>
          <div class="ack-meta__row">
            <dt>版权</dt>
            <dd>Copyright (c) 2019-2023 MengYX</dd>
          </div>
          <div class="ack-meta__row">
            <dt>官网</dt>
            <dd>
              <a
                href="https://unlock-music.dev"
                target="_blank"
                rel="noopener noreferrer"
              >unlock-music.dev</a>
            </dd>
          </div>
          <div class="ack-meta__row">
            <dt>源码</dt>
            <dd>
              <a
                href="https://git.unlock-music.dev/um/web"
                target="_blank"
                rel="noopener noreferrer"
              >Web 版</a>
              ·
              <a
                href="https://git.unlock-music.dev/um/cli"
                target="_blank"
                rel="noopener noreferrer"
              >CLI 版</a>
            </dd>
          </div>
          <div class="ack-meta__row">
            <dt>交流</dt>
            <dd>
              Telegram
              <a
                href="https://t.me/unlock_music_chat"
                target="_blank"
                rel="noopener noreferrer"
              >@unlock_music_chat</a>
            </dd>
          </div>
        </dl>

        <pre class="ack-license">{{ unlockMusicLicense.trim() }}</pre>
      </section>

      <section class="ack-project ack-project--related">
        <h2>相关依赖</h2>
        <ul>
          <li>
            <a
              href="https://github.com/jixunmoe/qmc2"
              target="_blank"
              rel="noopener noreferrer"
            >@jixun/qmc2-crypto</a>
            — QMC2 解密（Jixun Wu，MIT）
          </li>
          <li>
            <a
              href="https://www.npmjs.com/package/@xhacker/qmcwasm"
              target="_blank"
              rel="noopener noreferrer"
            >@xhacker/qmcwasm</a>
            — QMC WebAssembly 解密
          </li>
        </ul>
      </section>
    </div>
  </NScrollbar>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.ack-scroll {
  flex: 1;
  min-height: 0;
}

.ack-body {
  max-width: 720px;
  padding: 8px 28px 40px;
  font-size: 13px;
  line-height: 1.6;
  box-sizing: border-box;
}

.ack-lead {
  margin: 0 0 20px;
  padding: 12px 14px;
  border-radius: $radius-icon;
  background: var(--app-surface-active);
  font-size: 13px;
}

.ack-project {
  margin-bottom: 22px;
  padding-bottom: 18px;
  border-bottom: 1px solid $border-subtle;

  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }

  h2 {
    margin: 0 0 10px;
    font-size: 16px;
    font-weight: 700;
  }

  p {
    margin: 0 0 12px;
  }

  ul {
    margin: 0;
    padding-left: 1.2em;
  }

  li + li {
    margin-top: 6px;
  }
}

.ack-project--related h2 {
  font-size: 14px;
  opacity: 0.9;
}

.ack-meta {
  margin: 0 0 14px;
  display: grid;
  gap: 6px;
}

.ack-meta__row {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 8px;
  align-items: baseline;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}

.ack-meta__row dt {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.72;
}

.ack-meta__row dd {
  margin: 0;
}

.ack-license {
  margin: 0;
  padding: 12px 14px;
  border-radius: $radius-icon;
  border: 1px solid $border-subtle;
  background: $surface-panel;
  font-size: 11px;
  line-height: 1.55;
  opacity: 0.78;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

a {
  color: $color-primary;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}
</style>
