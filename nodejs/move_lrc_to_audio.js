#!/usr/bin/env node
/**
 * Copy .lrc files to directories of matching audio files (interactive).
 * LRC sources are left unchanged. Matching is by basename (case-insensitive).
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "flac",
  "m4a",
  "aac",
  "ogg",
  "opus",
  "wav",
  "wma",
  "ape",
  "alac",
  "aiff",
  "aif",
  "dsf",
  "dff",
  "wv",
  "mpc",
  "mp4",
  "mkv",
]);

function normName(name) {
  return name.toLowerCase();
}

function trimInput(s) {
  return s.trim().replace(/^["']|["']$/g, "");
}

function isInside(child, parent) {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  if (c === p) return true;
  const rel = path.relative(p, c);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function isInsideAny(child, parents) {
  return parents.some((p) => isInside(child, p));
}

function isYes(s) {
  const v = trimInput(s).toLowerCase();
  return v === "y" || v === "yes" || v === "是";
}

function isNo(s) {
  const v = trimInput(s).toLowerCase();
  return v === "n" || v === "no" || v === "否";
}

function createPrompter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question) =>
    new Promise((resolve) => rl.question(question, resolve));

  const close = () => rl.close();

  return { ask, close };
}

function validateDirectory(inputPath, label) {
  const trimmed = trimInput(inputPath);
  if (!trimmed) {
    return { ok: false, message: `${label}不能为空，请重新输入。` };
  }
  const resolved = path.resolve(trimmed);
  if (!fs.existsSync(resolved)) {
    return { ok: false, message: `路径不存在: ${resolved}` };
  }
  if (!fs.statSync(resolved).isDirectory()) {
    return { ok: false, message: `不是文件夹: ${resolved}` };
  }
  return { ok: true, path: resolved };
}

async function askDirectory(prompter, stepLabel, hint) {
  while (true) {
    const answer = await prompter.ask(
      `\n【步骤 ${stepLabel}】${hint}\n> `
    );
    const result = validateDirectory(answer, stepLabel);
    if (result.ok) {
      console.log(`  已选择: ${result.path}`);
      return result.path;
    }
    console.log(`  ${result.message}`);
  }
}

function collectAudioIndex(searchRoots, lrcDirs, extensions) {
  const index = new Map();
  const lrcResolved = lrcDirs.map((d) => path.resolve(d));

  function walk(dir) {
    const current = path.resolve(dir);
    if (isInsideAny(current, lrcResolved)) return;

    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      console.error(`Warning: cannot read ${current}: ${err.message}`);
      return;
    }

    for (const ent of entries) {
      const full = path.join(current, ent.name);
      const fullResolved = path.resolve(full);
      if (ent.isDirectory()) {
        if (lrcResolved.some((p) => fullResolved === p || isInside(fullResolved, p))) {
          continue;
        }
        walk(full);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).slice(1).toLowerCase();
        if (!extensions.has(ext)) continue;
        const key = normName(path.parse(ent.name).name);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(full);
      }
    }
  }

  for (const searchRoot of searchRoots) {
    walk(path.resolve(searchRoot));
  }

  return index;
}

function findLrcFiles(lrcDirs) {
  const files = [];
  for (const lrcDir of lrcDirs) {
    if (!fs.existsSync(lrcDir) || !fs.statSync(lrcDir).isDirectory()) {
      throw new Error(`LRC 目录不存在: ${lrcDir}`);
    }
    for (const name of fs.readdirSync(lrcDir)) {
      if (/\.lrc$/i.test(name)) {
        files.push(path.join(lrcDir, name));
      }
    }
  }
  return files.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

function uniquePaths(paths) {
  const seen = new Set();
  const out = [];
  for (const p of paths) {
    const r = path.resolve(p);
    if (!seen.has(r)) {
      seen.add(r);
      out.push(p);
    }
  }
  return out;
}

function runJob({ lrcDirs, searchRoots, execute }) {
  const extensions = AUDIO_EXTENSIONS;

  console.log("\n----------------------------------------");
  console.log(
    `LRC 源:   ${lrcDirs.map((p) => `\n           ${p}`).join("")}`
  );
  console.log(
    `搜索范围: ${searchRoots.map((p) => `\n           ${p}`).join("")}`
  );
  console.log(`模式:     ${execute ? "执行复制" : "预览（不复制文件）"}`);
  console.log("----------------------------------------\n");

  console.log("正在扫描音频文件...");
  const audioIndex = collectAudioIndex(searchRoots, lrcDirs, extensions);
  let audioCount = 0;
  for (const list of audioIndex.values()) audioCount += list.length;
  console.log(
    `已索引 ${audioCount} 个音频文件，${audioIndex.size} 个不同歌名。\n`
  );

  const lrcFiles = uniquePaths(findLrcFiles(lrcDirs));
  if (lrcFiles.length === 0) {
    console.log("所有 LRC 源目录中均未找到 .lrc 文件。");
    return { copied: 0, errors: 0, empty: true };
  }

  let copied = 0;
  let skippedNoMatch = 0;
  let skippedAmbiguous = 0;
  let skippedAlready = 0;
  let errors = 0;

  for (const lrcPath of lrcFiles) {
    const key = normName(path.parse(path.basename(lrcPath)).name);
    const matches = audioIndex.get(key);

    if (!matches || matches.length === 0) {
      console.log(`[无匹配]    ${path.basename(lrcPath)}  (${lrcPath})`);
      skippedNoMatch++;
      continue;
    }

    let targetAudio;
    if (matches.length > 1) {
      const parents = new Set(matches.map((m) => path.resolve(path.dirname(m))));
      if (parents.size > 1) {
        console.log(
          `[重名冲突]  ${path.basename(lrcPath)} -> 共 ${matches.length} 个音频:`
        );
        for (const m of matches.slice(0, 5)) console.log(`              ${m}`);
        if (matches.length > 5) {
          console.log(`              ... 另有 ${matches.length - 5} 个`);
        }
        skippedAmbiguous++;
        continue;
      }
      targetAudio = matches[0];
    } else {
      targetAudio = matches[0];
    }

    const destDir = path.dirname(targetAudio);
    const destPath = path.join(destDir, path.basename(lrcPath));

    if (path.resolve(lrcPath) === path.resolve(destPath)) {
      console.log(`[已在位置]  ${path.basename(lrcPath)}`);
      skippedAlready++;
      continue;
    }

    if (fs.existsSync(destPath)) {
      console.log(`[已存在]    ${destPath}（跳过 ${path.basename(lrcPath)}）`);
      errors++;
      continue;
    }

    console.log(`[将复制]    ${path.basename(lrcPath)}`);
    console.log(`            从 ${path.dirname(lrcPath)}`);
    console.log(`            -> ${destDir}`);

    if (execute) {
      try {
        fs.copyFileSync(lrcPath, destPath);
        copied++;
      } catch (err) {
        console.error(`            错误: ${err.message}`);
        errors++;
      }
    } else {
      copied++;
    }
  }

  console.log("\n--- 统计 ---");
  console.log(`${execute ? "已复制" : "将复制"}:        ${copied}`);
  console.log(`无匹配:         ${skippedNoMatch}`);
  console.log(`重名冲突:       ${skippedAmbiguous}`);
  console.log(`已在正确位置:   ${skippedAlready}`);
  if (errors) console.log(`跳过/错误:      ${errors}`);

  return { copied, errors, empty: false };
}

async function askYesNo(prompter, question) {
  while (true) {
    const answer = await prompter.ask(`${question} (y/n): `);
    if (isYes(answer)) return true;
    if (isNo(answer)) return false;
    console.log("  请输入 y（是）或 n（否）。");
  }
}

async function collectFolders(prompter, options) {
  const { stepPrefix, firstHint, moreQuestion, nextStepPrefix, nextHint } =
    options;
  const folders = [];

  folders.push(
    await askDirectory(prompter, stepPrefix, firstHint)
  );

  while (true) {
    const more = await askYesNo(prompter, moreQuestion);
    if (!more) break;
    const next = await askDirectory(
      prompter,
      `${nextStepPrefix}-${folders.length}`,
      nextHint
    );
    if (folders.includes(next)) {
      console.log("  该路径已添加，请输入其他路径。");
      continue;
    }
    folders.push(next);
  }

  return folders;
}

async function main() {
  console.log("========================================");
  console.log("  LRC 歌词文件复制归位工具");
  console.log("========================================");
  console.log(
    "按提示依次输入路径。LRC 源文件仅复制到音频旁，不会删除或移动源文件。"
  );
  console.log("支持相对路径与绝对路径，可直接粘贴文件夹路径。");

  const prompter = createPrompter();

  try {
    const lrcDirs = await collectFolders(prompter, {
      stepPrefix: "1",
      firstHint:
        "请输入 LRC 源文件夹路径（存放待匹配的 .lrc 文件，可添加多个）",
      moreQuestion: "\n是否再添加一个 LRC 源文件夹",
      nextStepPrefix: "1",
      nextHint: "请输入下一个 LRC 源文件夹路径",
    });

    const searchRoots = await collectFolders(prompter, {
      stepPrefix: "2",
      firstHint:
        "请输入音频搜索目标文件夹路径（将递归搜索子文件夹，可添加多个）",
      moreQuestion: "\n是否再添加一个搜索目标文件夹",
      nextStepPrefix: "2",
      nextHint: "请输入下一个目标文件夹路径",
    });

    console.log("\n【步骤 3】预览匹配结果");
    const preview = runJob({ lrcDirs, searchRoots, execute: false });

    if (preview.empty) {
      return;
    }

    if (preview.copied === 0) {
      console.log("\n没有可复制的文件，程序结束。");
      return;
    }

    console.log("\n【步骤 4】确认是否执行复制");
    const confirm = await askYesNo(
      prompter,
      "是否根据以上预览结果复制文件（源文件夹中的 .lrc 将保留）"
    );

    if (!confirm) {
      console.log("\n已取消，未复制任何文件。");
      return;
    }

    console.log("\n【步骤 5】正在复制文件...");
    runJob({ lrcDirs, searchRoots, execute: true });
    console.log("\n完成。源文件夹中的 .lrc 文件均未改动。");
  } finally {
    prompter.close();
  }
}

main().catch((err) => {
  console.error(`\n错误: ${err.message}`);
  process.exit(1);
});
