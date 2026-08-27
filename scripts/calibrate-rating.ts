// 评分校准脚本：跳过评分带限制，实测各难度生成的真实指标分布
//   用法：npx tsx scripts/calibrate-rating.ts [--perDiff=3]
//   输出各题的 level/steps/cages/ineq/eq/givens 及按当前公式的评分，
//   用于校准 computeRating 系数与 ratingBand 区间
import type { Difficulty } from '../src/types/puzzle';
import { generatePuzzle } from '../src/generator/pipeline';
import { mulberry32 } from '../src/generator/grid-gen';
import { computeRating } from '../src/generator/difficulty';

function parseNum(name: string, def: number): number {
  const a = process.argv.slice(2).find((s) => s.startsWith(`--${name}=`));
  return a ? Number(a.split('=')[1]) : def;
}

const perDiff = parseNum('perDiff', 3);
const enforce = process.argv.includes('--enforce'); // 加此开关则启用评分带/minLevel 检查（测真实产出率）
const diffs: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];
const seedBase = 20260827;

console.log(`每难度生成 ${perDiff} 题（${enforce ? '启用评分带检查' : '跳过评分带'}，熔断 maxTries=30 / timeoutMs=90s）\n`);

for (const diff of diffs) {
  console.log(`=== ${diff} ===`);
  for (let i = 0; i < perDiff; i++) {
    const t0 = Date.now();
    const p = generatePuzzle({
      diff,
      rng: mulberry32(seedBase + i * 7919),
      maxTries: 30,
      timeoutMs: 90000,
      skipRatingBand: !enforce,
    });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (!p) {
      console.log(`  #${i + 1} 失败（熔断） ${dt}s`);
      continue;
    }
    // 用"当前公式"复算评分（与 pipeline 内部一致）
    const rating = computeRating(
      { maxLevel: 0, steps: [], solved: true, techniqueMax: '' } as never,
      p.givens.size,
      {} as never,
    );
    void rating; // 评分需逻辑求解结果，这里直接用 pipeline 已算好的 p.rating
    console.log(
      `  #${i + 1} rating=${p.rating} tech=${p.techniqueMax} steps=${p.steps} givens=${p.givens.size} cages=${p.cages.length} cellIneq=${p.cellIneq.length} cageIneq=${p.cageIneq.length} cellEq=${p.cellEq.length} cageEq=${p.cageEq.length} ${dt}s`,
    );
  }
  console.log();
}
