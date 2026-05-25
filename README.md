# move_lrc_to_audio

根据 `.lrc` 文件名（不含后缀）在指定目录中查找同名音频，并将 `.lrc` **复制**到音频所在文件夹（**不删除、不移动**源文件）。

## 版本

| 目录 | 说明 |
|------|------|
| [**`electron/`**](electron/) | **Electron 桌面版**（推荐，Vue 3 + TypeScript，现代 UI） |
| [`nodejs/`](nodejs/) | Node.js 命令行交互版 |

---

## Electron 桌面版（推荐）

见 [`electron/README.md`](electron/README.md)。

```powershell
cd electron
yarn install
yarn dev
```

---

## Node.js 命令行版

见 [`nodejs/README.md`](nodejs/README.md)。

```powershell
cd nodejs
node move_lrc_to_audio.js
```

## 规则（各版本相同）

- **复制**到音频旁，LRC 源目录中的文件保留
- 匹配：`歌曲.lrc` ↔ `歌曲.flac` / `歌曲.mp3`（忽略大小写）
- 扫描音频时跳过所有 LRC 源目录
- LRC 源目录递归扫描子文件夹
- 以目标文件夹内**音频**为主展示；**已匹配**指同级已有同名 `.lrc` 与音频
- 可删除目标内**多余歌词**（同级无同名音频的 `.lrc`）
- 同名音频在多个不同文件夹 → 重名冲突，跳过
