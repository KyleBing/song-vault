<script setup lang="ts">
import { NScrollbar } from 'naive-ui'
</script>

<template>
    <NScrollbar class="knowledge-scroll">
        <div class="knowledge-body">
            <p class="knowledge-lead">
                整理常见音频格式、内嵌标签与音质参数，便于理解本工具在「文件名与标签」「元数据编辑」等功能里处理的内容。
            </p>

            <section class="knowledge-section">
                <h2>内嵌标签：ID3v1、ID3v2 与 Vorbis Comment</h2>
                <p>
                    它们都是写在<strong>文件内部</strong>的文本信息（标题、艺人、专辑等），与<strong>文件名</strong>、<strong>封面图片</strong>是不同概念。播放器、资源管理器、本工具的扫描与写入，读写的通常是这些内嵌字段。
                </p>

                <h3>ID3v1</h3>
                <ul>
                    <li>
                        固定在 MP3 文件<strong>末尾 128 字节</strong>（<code>TAG</code> 开头），约 1990 年代沿用至今。
                    </li>
                    <li>
                        仅支持<strong>拉丁字符</strong>（ISO-8859-1），标题 / 艺人 / 专辑各约 30 字符；中文会变成
                        <code>????</code> 或乱码。
                    </li>
                    <li>
                        老设备、部分车载仍可能读取；与 ID3v2 并存时，现代软件以 v2 为准。
                    </li>
                </ul>

                <h3>ID3v2（现行主流）</h3>
                <ul>
                    <li>
                        位于 MP3 文件<strong>开头</strong>（<code>ID3</code> 魔数），帧式结构，可存 Unicode（UTF-16 / UTF-8）。
                    </li>
                    <li>
                        常见版本：<strong>2.3</strong>（兼容性最好）、<strong>2.4</strong>（规范最新，部分旧设备不支持）。
                    </li>
                    <li>
                        帧名如 <code>TIT2</code>（标题）、<code>TPE1</code>（艺人）、<code>TALB</code>（专辑）、<code>APIC</code>（封面）。
                    </li>
                    <li>
                        <strong>最新常用的是 ID3v2.4</strong>；本工具写入 MP3 时使用 v2，并会在修复标签时<strong>去掉过时的 ID3v1</strong>，避免中文显示为问号。
                    </li>
                </ul>

                <h3>Vorbis Comment（含 FLAC 所用）</h3>
                <ul>
                    <li>
                        并非「Vorbis 音频格式」本身，而是 <strong>Ogg / FLAC 等容器里存放元数据的键值对格式</strong>（如
                        <code>TITLE=…</code>、<code>ARTIST=…</code>）。
                    </li>
                    <li>
                        原生支持 UTF-8，字段可多行、可重复；FLAC 文件的标签块即 Vorbis Comment。
                    </li>
                    <li>
                        与 ID3 无继承关系：MP3 用 ID3，FLAC / Ogg Vorbis 用 Vorbis Comment；本工具「扩展标签」Tab 展示的便是各格式原生层字段。
                    </li>
                </ul>

                <div class="knowledge-table-wrap">
                    <table class="knowledge-table">
                        <thead>
                            <tr>
                                <th scope="col">对比</th>
                                <th scope="col">ID3v1</th>
                                <th scope="col">ID3v2</th>
                                <th scope="col">Vorbis Comment</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <th scope="row">典型文件</th>
                                <td>MP3</td>
                                <td>MP3</td>
                                <td>FLAC、Ogg、Opus 等</td>
                            </tr>
                            <tr>
                                <th scope="row">位置</th>
                                <td>文件尾</td>
                                <td>文件头</td>
                                <td>元数据块内</td>
                            </tr>
                            <tr>
                                <th scope="row">中文</th>
                                <td>基本不支持</td>
                                <td>支持</td>
                                <td>支持</td>
                            </tr>
                            <tr>
                                <th scope="row">现状</th>
                                <td>遗留，建议删除</td>
                                <td>MP3 标准</td>
                                <td>开源无损 / Ogg 生态标准</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="knowledge-section">
                <h2>常见音频格式</h2>
                <p>
                    扩展名表示<strong>容器 + 编码</strong>的组合。无损指可还原为与母带相同的 PCM 样本（仍受录制分辨率限制）；有损指丢弃部分人耳不易察觉的信息以缩小体积。
                </p>

                <div class="knowledge-table-wrap">
                    <table class="knowledge-table">
                        <thead>
                            <tr>
                                <th scope="col">格式</th>
                                <th scope="col">全称 / 由来</th>
                                <th scope="col">特点与用途</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <th scope="row">MP3</th>
                                <td>
                                    MPEG-1 Audio Layer III（1990 年代 Fraunhofer 等推动）
                                </td>
                                <td>
                                    有损压缩；兼容性最广（车机、旧设备、流媒体下载）。常见 128–320 kbps。扩展名
                                    <code>.mp3</code>。
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">AAC</th>
                                <td>
                                    Advanced Audio Coding（MPEG-4 音频，MP3 后继）
                                </td>
                                <td>
                                    有损；同码率通常优于 MP3。常见于
                                    <code>.m4a</code>、<code>.aac</code>、视频音轨。Apple 音乐商店、YouTube 等广泛使用。
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">FLAC</th>
                                <td>
                                    Free Lossless Audio Codec（2001 年起开源）
                                </td>
                                <td>
                                    无损压缩，体积约为 WAV 的 50–70%。HiFi 收藏、归档、本工具「无损库」场景常用。标签为
                                    Vorbis Comment。
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">ALAC</th>
                                <td>
                                    Apple Lossless Audio Codec（苹果无损）
                                </td>
                                <td>
                                    无损；多封装在 MP4 容器（<code>.m4a</code>）。Apple 生态、iTunes
                                    购买无损。与 FLAC 类似但编码不同，需对应解码器。
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">OGG / Vorbis</th>
                                <td>
                                    Ogg 容器 + Vorbis 编码（Xiph.Org 开源）
                                </td>
                                <td>
                                    有损；曾用于游戏、部分流媒体。扩展名常作
                                    <code>.ogg</code>。现亦常见 Ogg Opus（<code>.opus</code>，语音 / 低延迟场景）。
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">WAV</th>
                                <td>
                                    Waveform Audio File Format（微软 / IBM PCM 容器）
                                </td>
                                <td>
                                    通常<strong>未压缩 PCM</strong>，体积大；编辑、母带中间档。可嵌入元数据但不如 FLAC 方便。
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">WMA</th>
                                <td>
                                    Windows Media Audio（微软）
                                </td>
                                <td>
                                    有损或无损变体；Windows 时代常见，现较少在新设备上使用。
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">APE</th>
                                <td>
                                    Monkey's Audio（无损，高压缩比）
                                </td>
                                <td>
                                    无损；压缩率高于 FLAC 但编码慢、硬件支持少，多见于老发烧友归档。
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="knowledge-section">
                <h2>码率、采样率、位深</h2>
                <p>
                    在文件属性或本工具元数据面板中常见下列数值。它们描述的是<strong>音频数据本身</strong>，与 ID3 / Vorbis
                    标签无关。
                </p>

                <h3>码率（Bitrate，kbps）</h3>
                <ul>
                    <li>
                        每秒音频数据约多少<strong>千比特</strong>（如 320 kbps、128 kbps）。主要用于<strong>有损</strong>格式（MP3、AAC、OGG）。
                    </li>
                    <li>
                        越高通常细节保留越好、文件越大，但超过一定阈值人耳难以分辨（常见 MP3 256–320 kbps 为「高」档位）。
                    </li>
                    <li>
                        <strong>无损格式（FLAC / ALAC）</strong>码率是变动的（VBR 式），只反映压缩后大小，不代表「音质等级」。
                    </li>
                </ul>

                <h3>采样率（Sample rate，Hz）</h3>
                <ul>
                    <li>
                        每秒对声音采样多少次。<strong>44.1 kHz</strong>（CD 标准）、<strong>48 kHz</strong>（视频 / 流媒体常见）、<strong>96 / 192 kHz</strong>（Hi-Res）。
                    </li>
                    <li>
                        根据奈奎斯特定理，可还原的最高频率约为采样率的一半（44.1 kHz → 约 22 kHz，覆盖人耳可听范围）。
                    </li>
                    <li>
                        盲目提高采样率不会修复已有失真；转码时随意改采样率可能引入重采样痕迹。
                    </li>
                </ul>

                <h3>位深（Bit depth，bit）</h3>
                <ul>
                    <li>
                        每个采样用多少比特表示动态范围。CD 为 <strong>16 bit</strong>；录音 / Hi-Res 常见
                        <strong>24 bit</strong>。
                    </li>
                    <li>
                        位深越高，量化噪声越低、小音量细节理论越好；需无损格式或 WAV/FLAC 才能保留，有损编码会重新量化。
                    </li>
                </ul>

                <h3>声道与时长</h3>
                <ul>
                    <li>
                        <strong>声道</strong>：单声道、立体声（2.0）、 surround（5.1 等）影响文件大小与播放设备要求。
                    </li>
                    <li>
                        <strong>时长</strong>：由采样总数 ÷ 采样率决定；与标签里的「标题 / 艺人」无关。
                    </li>
                </ul>

                <div class="knowledge-callout">
                    <p class="knowledge-callout__title">和本工具的关系</p>
                    <ul>
                        <li>
                            「文件名与标签」对比的是<strong>文件名与内嵌标签文本</strong>，不改变码率或位深。
                        </li>
                        <li>
                            扫描大库时可跳过封面 / 时长解析以加速；完整信息可在单文件元数据面板查看。
                        </li>
                        <li>
                            MP3 修复标签后只保留 ID3v2；FLAC 写入会更新 Vorbis Comment 块，不影响音频 PCM 数据。
                        </li>
                    </ul>
                </div>
            </section>

            <p class="knowledge-foot">
                以上为通用常识摘要，具体播放器、车机对格式与标签的支持因设备而异。若某设备只认 ID3v1，中文歌名仍可能显示异常，建议使用支持 ID3v2 或 FLAC 的播放环境。
            </p>
        </div>
    </NScrollbar>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.knowledge-scroll {
    flex: 1;
    min-height: 0;
}

.knowledge-body {
    max-width: 720px;
    padding: 8px 28px 40px;
    font-size: 13px;
    line-height: 1.6;
    box-sizing: border-box;
}

.knowledge-lead {
    margin: 0 0 20px;
    padding: 12px 14px;
    border-radius: $radius-icon;
    background: var(--app-surface-active);
    font-size: 13px;
}

.knowledge-section {
    margin-bottom: 28px;
    padding-bottom: 22px;
    border-bottom: 1px solid $border-subtle;

    &:last-of-type {
        border-bottom: none;
        margin-bottom: 14px;
        padding-bottom: 0;
    }

    h2 {
        margin: 0 0 10px;
        font-size: 16px;
        font-weight: 700;
    }

    h3 {
        margin: 16px 0 6px;
        font-size: 13px;
        font-weight: 600;
        opacity: 0.92;
    }

    p {
        margin: 0 0 8px;
    }

    ul {
        margin: 0 0 8px;
        padding-left: 1.2em;
    }

    li + li {
        margin-top: 4px;
    }
}

.knowledge-table-wrap {
    margin-top: 12px;
    overflow-x: auto;
}

.knowledge-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    line-height: 1.45;

    th,
    td {
        padding: 8px 10px;
        border: 1px solid $border-subtle;
        text-align: left;
        vertical-align: top;
    }

    thead th {
        background: $surface-sidebar;
        font-weight: 600;
    }

    tbody th[scope='row'] {
        font-weight: 600;
        white-space: nowrap;
        background: rgba(255, 255, 255, 0.02);
    }
}

.knowledge-callout {
    margin-top: 14px;
    padding: 12px 14px;
    border-radius: $radius-icon;
    border: 1px dashed $border-subtle;
    background: var(--app-placeholder-bg);
}

.knowledge-callout__title {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 600;
    opacity: 0.85;
}

.knowledge-callout ul {
    margin: 0;
}

code {
    font-size: 12px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--app-surface-active);
}

.knowledge-foot {
    margin: 0;
    font-size: 12px;
    opacity: 0.65;
    line-height: 1.5;
}
</style>
