// 离线题库生成脚本
//   用法：npx tsx scripts/gen-puzzles.ts --diff=hard --n=10 [--seed=12345]
//   输出：public/puzzles/{diff}.json 格式 { puzzles: PuzzleJson[] }
//   并发 4 题同时跑，CLI 输出进度
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';
import type { Difficulty, PuzzleJson } from '../src/types/puzzle';
import { puzzleToJson } from '../src/types/puzzle';
import { generatePuzzle } from '../src/generator/pipeline';
import { mulberry32 } from '../src/generator/grid-gen';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

interface CliArgs {
  diff: Difficulty;
  n: number;
  seedBase: number;
  maxTries: number;
  timeoutMs: number;
  append: boolean; // 是否追加到现有题库（true=保留旧题并拼接新题；false=覆盖）
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let diff = 'easy';
  let n = 10;
  let seedBase = Date.now();
  // 熔断默认值调高（需求7）：困难/专家命中率低，30s/20次 阈值过小易大面积熔断
  let maxTries = 40;
  let timeoutMs = 60000;
  let append = false;
  // 用 split('=') 取值，避免硬编码前缀长度出错（如 '--n=' 切片索引曾误写为 3 导致 NaN）
  for (const a of argv) {
    if (a === '--append') { append = true; continue; }
    const eq = a.indexOf('=');
    if (eq < 0) continue;
    const key = a.slice(0, eq);
    const val = a.slice(eq + 1);
    switch (key) {
      case '--diff': diff = val; break;
      case '--n': n = Number(val); break;
      case '--seed': seedBase = Number(val); break;
      case '--maxTries': maxTries = Number(val); break;
      case '--timeoutMs': timeoutMs = Number(val); break;
    }
  }
  if (!['easy', 'normal', 'hard', 'expert'].includes(diff)) {
    throw new Error(`未知难度: ${diff}（应为 easy/normal/hard/expert）`);
  }
  if (n <= 0) throw new Error('--n 必须 > 0');
  return { diff: diff as Difficulty, n, seedBase, maxTries, timeoutMs, append };
}

async function main() {
  const opts = parseArgs();
  console.log(`开始生成 ${opts.diff} 难度 ${opts.n} 题`);
  console.log(`  种子基=${opts.seedBase}  并发=4  maxTries=${opts.maxTries}  timeoutMs=${opts.timeoutMs}`);

  const startTime = Date.now();
  const limit = pLimit(4); // 并发上限 4
  const results: PuzzleJson[] = [];
  let done = 0;

  const tasks = Array.from({ length: opts.n }, (_, i) =>
    limit(async () => {
      // 不同种子避免重复；每个种子间隔 1000 保证不撞
      const seed = opts.seedBase + i * 1000;
      const rng = mulberry32(seed);
      const puzzle = generatePuzzle({
        diff: opts.diff,
        rng,
        maxTries: opts.maxTries,
        timeoutMs: opts.timeoutMs,
      });
      done++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (puzzle) {
        const json = puzzleToJson(puzzle);
        results.push(json);
        console.log(
          `[${done}/${opts.n}] #${i + 1} 成功  rating=${json.rating}  tech=${json.techniqueMax}  steps=${json.steps}  givens=${Object.keys(json.givens).length}  耗时 ${elapsed}s`,
        );
      } else {
        console.log(`[${done}/${opts.n}] #${i + 1} 失败（超时熔断）  耗时 ${elapsed}s`);
      }
    }),
  );

  await Promise.all(tasks);

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n完成：成功 ${results.length}/${opts.n}，总耗时 ${totalElapsed}s`);

  // 写入题库文件
  const outDir = path.resolve(PROJECT_ROOT, 'public/puzzles');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${opts.diff}.json`);
  // --append：读取旧题库并与新结果合并（按 id 去重），不覆盖历史题
  let finalPuzzles: PuzzleJson[] = results;
  if (opts.append && fs.existsSync(outPath)) {
    try {
      const existingRaw = fs.readFileSync(outPath, 'utf-8');
      const existing = JSON.parse(existingRaw);
      const oldPuzzles: PuzzleJson[] = Array.isArray(existing?.puzzles) ? existing.puzzles : [];
      const seen = new Set<string>();
      for (const p of oldPuzzles) seen.add(p.id);
      const dedupNew = results.filter((p) => !seen.has(p.id));
      finalPuzzles = [...oldPuzzles, ...dedupNew];
      console.log(`--append 模式：旧题 ${oldPuzzles.length} + 新题 ${dedupNew.length}（去重跳过 ${results.length - dedupNew.length}）`);
    } catch (e) {
      console.warn('读取旧题库失败，改用覆盖写入：', e);
      finalPuzzles = results;
    }
  }
  fs.writeFileSync(outPath, JSON.stringify({ puzzles: finalPuzzles }, null, 2), 'utf-8');
  console.log(`已写入 ${outPath}（共 ${finalPuzzles.length} 题）`);
}

main().catch((e) => {
  console.error('生成失败:', e);
  process.exit(1);
});
