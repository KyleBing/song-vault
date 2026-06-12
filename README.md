<p align="center">
  <img src="build/icon.png" alt="乐库管理" width="96" height="96" />
</p>

<h1 align="center">乐库管理</h1>

<p align="center">
  桌面应用：管理自己的本地乐库。

> - 本地音频库浏览与管理
> - 歌词归位
> - 双乐库同步
> - 重复清理与文件名 / 标签校准。
</p>

<p align="center">
<img width="1632" height="872" alt="song vault" src="https://github.com/user-attachments/assets/b003fa4c-a87b-4aa7-8bea-2d43db4db223" />
<img width="1632" height="872" alt="fix tags" src="https://github.com/user-attachments/assets/503ef617-ef08-4bae-bb19-cfdadfdef543" />
<img width="1632" height="872" alt="lrc relocate" src="https://github.com/user-attachments/assets/0732cdda-b39c-4030-ad2d-7a05771ca5d2" />
<img width="1632" height="872" alt="tags v1 delete" src="https://github.com/user-attachments/assets/5ad3d570-3e0d-45ce-a69c-e0c1adae0e85" />
<img width="1632" height="872" alt="modify tags" src="https://github.com/user-attachments/assets/f8585a5d-1e36-4edd-865d-82d9dd88adbd" />
<img width="1632" height="872" alt="compare" src="https://github.com/user-attachments/assets/86b6f770-0ce3-4bd7-ba9d-6447dfe856f1" />
<img width="1632" height="872" alt="sync" src="https://github.com/user-attachments/assets/9a749790-7e95-4eca-8468-1eb44929288a" />
<img width="1669" height="872" alt="decode" src="https://github.com/user-attachments/assets/e5108f48-63e6-40df-ac7c-59d239320b66" />
<img width="1632" height="872" alt="about" src="https://github.com/user-attachments/assets/0ab5adda-ff17-4cba-bce3-25e76d984814" />

</p>


## 由来
整了个 paw6000 + ie600，就想弄点无损音源听听。最初只是想把相同文件名的 LRC 放到对应音频的目录下，功能做完后，又遇到了很多小问题，比如 meta 标签一些信息的错误、筹码、繁体等，通过  [**MusicBrainz Piscard**](https://picard.musicbrainz.org/) 统一匹配修复后，很多标签信息变成繁体的了，就很烦，就又添加了关于繁体字扫描和转换的功能。还有相同音频在多个文件夹中出现的重复问题，多个功能汇总在一起就成了这个程序。

主要目的就是为了更方便的管理自己的本地乐库，不再有乱七八糟的音频标签等，让乐库变得清爽一些。

## 功能概览

| 模块 | 说明 |
|------|------|
| 乐库管理 | 浏览本地音频目录树，查看元数据与封面，支持搜索、播放、Shift 多选、移动与删除 |
| 乐库同步 | 对比左右两个乐库目录的差异（相同、仅一侧、大小不同、已移动），支持跨库复制与同库内移动对齐路径 |
| 重复清理 | 识别同名编号副本（如 `A.flac` 与 `A(1).flac`），指定保留项后批量删除其余副本 |
| 文件名与标签 | 核对「艺人 - 曲名」类文件名与内嵌标签是否一致，按问题类型筛选并批量修正 |
| LRC 歌词归位 | 从 LRC 源扫描歌词，复制到乐库音频同级目录；支持预览匹配、批量复制与多余文件清理 |
| 设置 | 乐库目录、LRC 源、同步目录、路径过滤规则、列表列配置等 |

各工作台均支持长时间任务的进度展示与取消；单选音频时可在侧栏查看 / 编辑元数据；列表中可预览同级歌词。

---

## 使用说明

### 乐库管理

1. 在 **设置 → 路径** 中添加 **乐库目录**（可配置多个根目录）
2. 打开 **乐库管理**，在目录树中选择文件夹浏览音频列表
3. 工具栏可切换「仅当前目录 / 含全部子文件夹」列表范围
4. 支持文件名搜索、Shift 连选、移动、删除；右击可「打开文件所在位置」
5. 单选一条音频时，侧栏展示元数据面板，可编辑标签与封面

### LRC 歌词归位

1. 在 **设置 → 路径** 中配置 **LRC 源文件夹** 与 **音频搜索目标**（通常与乐库目录相同）
2. 点击 **预览匹配** 扫描目标目录中的音频与 LRC 源的对应关系
3. 在结果列表中按状态查看：**全部**、**已匹配**、**待复制**、**待选源**、**缺歌词**、**多余**
4. 「待选源」需在列表中为每首选择具体源歌词
5. 确认后点击 **执行复制**（源文件夹中的 `.lrc` 保留，不移动）
6. 「多余」页可勾选并删除无对应音频的歌词，或 macOS 编号重复的冗余音频副本

**匹配规则**

- 复制到音频旁，不删除、不移动源文件
- 按文件名（不含后缀）匹配，忽略大小写
- 扫描音频时跳过所有 LRC 源目录
- **已匹配**：目标文件夹同级目录下，同时存在主文件名相同的 `.lrc` 与音频
- 同名音频分布在多个不同文件夹时视为重名冲突，跳过

### 乐库同步

1. 在 **设置 → 同步** 中指定左右乐库根目录（可设置显示别名）
2. 打开 **乐库同步**，点击 **扫描对比**
3. 在差异树中查看统计与明细；**已移动** 表示两侧均有同名同大小音频但相对路径不同
4. 操作方式：
   - 仅一侧有文件：箭头指向的一侧从另一侧 **复制** 缺失文件
   - 已移动：在箭头指向的乐库内 **移动**（rename）文件以对齐另一侧路径，同名 `.lrc` 会一并移动
5. 支持 Shift 连选与批量同步；可删除选中项（不可恢复）

### 重复清理

1. 扫描源来自 **设置 → 路径** 中的乐库目录，在下拉框中选择
2. 点击扫描，识别同名、编号副本且路径不同的重复音频
3. 勾选重复组，用单选指定要保留的那一份
4. 点击 **删除副本** 清理其余副本；同名歌词会一并删除

### 文件名与标签

1. 扫描源来自 **设置 → 路径** 中已配置的乐库 / 同步目录
2. 点击 **开始扫描**；大库扫描分「读取标签」与「内存对比」两阶段
3. 可检测的问题类型包括：标签艺人 / 曲名不一致、扩展标签不一致、文件名 / 标签分隔符不规范、首尾下划线、扩展标签重复、繁体字、MP3 文件尾 ID3v1 标签等
4. 左侧按问题类型筛选；勾选后可批量 **执行**、**繁转简** 或 **删除**；有选中时仅处理已选中且符合条件的记录
5. 单选一条时可在侧栏元数据面板逐条编辑

## 更新日志

版本变更见 [CHANGELOG.md](CHANGELOG.md)；应用内 **关于** 页与 `src/shared/changelog.ts` 同步维护。

## 许可证

MIT




--- 


## 技术栈

Electron · Vue 3 · TypeScript · Naive UI · Pinia · electron-vite · electron-builder

## 环境要求

- Node.js 18+
- Yarn 1.x（见 `package.json` 中 `packageManager` 字段）

## 开发

```bash
yarn install
yarn dev
```

类型检查：

```bash
yarn typecheck
```

## 构建与预览

```bash
yarn build
yarn preview
```

## 打包客户端

先执行 `yarn install`，再在本机平台打包（产物位于 `release/`）：

```bash
# macOS → .dmg
yarn pack:mac

# Windows → 安装包（建议在 Windows 上执行）
yarn pack:win
```

`pack:mac` / `pack:win` 通过项目 `.npmrc` 中的 npmmirror 镜像下载 Electron 与 electron-builder 二进制，Windows / macOS 均可直接运行。若需从 GitHub 官方源下载，可使用 `pack:*:original`（会临时忽略镜像配置）。

