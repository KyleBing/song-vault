# nodejs — LRC 复制归位（命令行版）

交互式命令行：依次输入 LRC 源与搜索目标（可多个），预览后复制 `.lrc`（不删源文件）。

## 要求

- Node.js 18+

## 运行

```powershell
cd nodejs
node move_lrc_to_audio.js
```

## 步骤

1. 一个或多个 **LRC 源文件夹**
2. 一个或多个 **音频搜索目标**（递归子目录）
3. 自动预览
4. 确认后执行复制
