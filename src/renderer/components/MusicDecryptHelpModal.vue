<script setup lang="ts">
import { HelpCircleOutline } from '@vicons/ionicons5'
import { NButton, NIcon, NModal, NScrollbar } from 'naive-ui'
import { ref } from 'vue'

const show = ref(false)

function open(): void {
  show.value = true
}

defineExpose({ open })
</script>

<template>
  <NButton class="help-trigger" text type="primary" size="small" @click="open">
    <template #icon>
      <NIcon :size="16"><HelpCircleOutline /></NIcon>
    </template>
    下载与解密说明
  </NButton>

  <NModal
    v-model:show="show"
    preset="card"
    title="音乐下载与解密说明"
    class="decrypt-help-modal"
    :style="{ width: 'min(520px, 92vw)' }"
    :bordered="false"
    :segmented="{ content: true, footer: false }"
  >
    <NScrollbar style="max-height: min(70vh, 560px)">
      <div class="help-body">
        <p class="help-lead">
          请先在客户端把歌曲<strong>下载到本地</strong>，再在「设置 → 音乐解码浏览目录」添加对应文件夹，于本页目录树中选择文件解密。
        </p>

        <section class="help-platform help-platform--qq">
          <h2>QQ 音乐</h2>

          <h3>支持的文件</h3>
          <ul>
            <li>
              常见扩展名：<code>.mflac</code>、<code>.mgg</code>、<code>.mflac0</code>、<code>.mgg1</code>、<code>.qmcflac</code>、<code>.qmc0</code> 等
            </li>
            <li>能否解密取决于下载时的客户端版本与文件尾标记（如 <code>QTag</code>、<code>STag</code>、旧版 QMC）</li>
          </ul>

          <h3>下载位置（Windows 示例）</h3>
          <ul>
            <li><code>我的音乐\QQ音乐</code></li>
            <li>或安装目录下 <code>VipDownload</code>、<code>QQMusic</code> 等子文件夹</li>
          </ul>

          <h3>解密失败：新版 PC 客户端</h3>
          <p>
            若提示含 <code>cex\0</code> 或 <code>00786563-6973756d</code>，多为<strong>新版 QQ 音乐 PC</strong> 下载的
            <code>.mflac</code>，密钥在客户端内，本工具<strong>无法离线解密</strong>。
          </p>
          <ul>
            <li>
              保持 QQ 音乐登录，用 Frida 类工具解密（如
              <a href="https://github.com/ericjuice/music-decryptor" target="_blank" rel="noopener noreferrer">music-decryptor</a>），得到
              <code>.flac</code> 后再导入本工具
            </li>
            <li>或使用 QQ 音乐 <strong>PC v19.43 及以下</strong> 重新下载</li>
          </ul>

          <h3>安卓等</h3>
          <ul>
            <li>较新版本可能为 <code>STag</code> 尾标且无内嵌密钥，需旧版客户端下载或从客户端数据库导出 ekey</li>
          </ul>
        </section>

        <section class="help-platform help-platform--netease">
          <h2>网易云音乐</h2>

          <h3>支持的文件</h3>
          <ul>
            <li><code>.ncm</code>：客户端下载的加密歌曲（本工具主要支持，一般可直接解密）</li>
            <li><code>.uc</code>：客户端缓存格式（需为完整缓存文件）</li>
          </ul>

          <h3>下载位置（Windows 示例）</h3>
          <ul>
            <li><code>我的音乐\网易云音乐</code></li>
            <li>或安装目录 / 设置里「下载目录」所指向的文件夹</li>
            <li>缓存多在用户目录下的 <code>Local\Netease\CloudMusic</code> 相关路径（<code>.uc</code> 多为缓存，优先用已下载的 <code>.ncm</code>）</li>
          </ul>

          <h3>使用注意</h3>
          <ul>
            <li>须在网易云音乐客户端内完成<strong>下载</strong>，仅在线播放不会产生可解密的 <code>.ncm</code></li>
            <li>解密后可得到 <code>.mp3</code> 或 <code>.flac</code>（由原始音质决定），并尽量保留封面与标签</li>
            <li>若解密失败，请确认文件未损坏、扩展名为 <code>.ncm</code> 且来自官方客户端下载</li>
          </ul>
        </section>

        <p class="help-foot">
          解密基于 unlock-music 离线算法，不保证覆盖各平台后续全部新加密；仅供个人已下载文件的格式转换与学习研究。
        </p>
      </div>
    </NScrollbar>
  </NModal>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.help-trigger {
  font-size: 12px;
  padding: 0 4px;
}

.help-body {
  font-size: 13px;
  line-height: 1.6;
  padding-right: 4px;
}

.help-lead {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: $radius-icon;
  background: var(--app-surface-active);
  font-size: 13px;
}

.help-platform {
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid $border-subtle;

  &:last-of-type {
    border-bottom: none;
    margin-bottom: 12px;
    padding-bottom: 0;
  }

  h2 {
    margin: 0 0 10px;
    font-size: 15px;
    font-weight: 700;
  }

  h3 {
    margin: 12px 0 6px;
    font-size: 13px;
    font-weight: 600;
    opacity: 0.92;
  }

  p {
    margin: 0 0 6px;
  }

  ul {
    margin: 0;
    padding-left: 1.2em;
  }

  li + li {
    margin-top: 4px;
  }
}

.help-platform--qq h2 {
  color: #31c27c;
}

.help-platform--netease h2 {
  color: #c20c0c;
}

code {
  font-size: 12px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--app-surface-active);
}

a {
  color: $color-primary;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.help-foot {
  margin: 0;
  font-size: 12px;
  opacity: 0.65;
  line-height: 1.5;
}
</style>
