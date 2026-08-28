/**
 * 题库规则审计脚本：检查现有题库中每道题是否违反用户 5 条新规则
 *
 * 规则清单：
 *   1. 有和值笼（sum !== null）不可以全部给定格值
 *   2. 相邻两格都给定格值时，不可以给出这两格的格间大小约束
 *   3. 对角两格都给定格值时，不可以给出这两格的格间等值约束
 *   4. 每一行、每一列、每一宫都至少出现一个空格子
 *   5. 给定数须落在难度范围内（easy 33~38 / normal 23~28 / hard 15~20 / expert 6~10）
 *
 * 输出：各难度违规统计 + 每道违规题的明细，供决定"调整或重生成"
 *
 * 用法：npx tsx scripts/audit-puzzles.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIFF_PARAMS } from '../src/generator/difficulty';
import type { Difficulty, PuzzleJson } from '../src/types/puzzle';

type PuzzleFile = { puzzles: PuzzleJson[] };

// 构建 27 个单元（9 行 + 9 列 + 9 宫）的格索引列表
function buildUnits(): number[][] {
  const units: number[][] = [];
  for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const box: number[] = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) box.push((br * 3 + r) * 9 + bc * 3 + c);
      units.push(box);
    }
  }
  return units;
}

const UNITS = buildUnits();

// 单题审计：返回各类违规的数量与明细
function auditPuzzle(p: PuzzleJson): {
  rule1: string[]; rule2: string[]; rule3: string[]; rule4: string[]; rule5: boolean;
} {
  const givens = new Set<number>(Object.keys(p.givens).map(Number));
  const rule1: string[] = [];
  const rule2: string[] = [];
  const rule3: string[] = [];
  const rule4: string[] = [];

  // 规则 1：有和值笼全给定
  //   CageJson 无 id 字段（运行时 puzzleFromJson 按数组下标补 id），故用下标标识笼
  p.cages.forEach((cage, ci) => {
    if (cage.sum === null) return;
    if (cage.cells.every((i) => givens.has(i))) {
      rule1.push(`cage#${ci}(cells:${cage.cells.join(',')})`);
    }
  });

  // 规则 2：双给定的格间大小约束
  for (const ii of p.cellIneq ?? []) {
    if (givens.has(ii.a) && givens.has(ii.b)) rule2.push(`${ii.a}-${ii.b}(${ii.rel})`);
  }

  // 规则 3：双给定的格间等值约束
  for (const eq of p.cellEq ?? []) {
    if (givens.has(eq.a) && givens.has(eq.b)) rule3.push(`${eq.a}-${eq.b}`);
  }

  // 规则 4：全给定的行/列/宫
  UNITS.forEach((unit, ui) => {
    if (unit.every((i) => givens.has(i))) {
      const kind = ui < 9 ? '行' : ui < 18 ? '列' : '宫';
      rule4.push(`${kind}#${ui % 9}`);
    }
  });

  // 规则 5：给定数在范围内
  const [lo, hi] = DIFF_PARAMS[p.difficulty as Difficulty].givensRange;
  const rule5 = givens.size >= lo && givens.size <= hi;

  return { rule1, rule2, rule3, rule4, rule5 };
}

// 主流程：逐难度读题库 → 逐题审计 → 输出报告
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];
let totalBad = 0;
for (const diff of DIFFS) {
  const file = join(process.cwd(), 'public', 'puzzles', `${diff}.json`);
  const data: PuzzleFile = JSON.parse(readFileSync(file, 'utf8'));
  const lines: string[] = [];
  let badCount = 0;
  for (const p of data.puzzles) {
    const r = auditPuzzle(p);
    const violations: string[] = [];
    if (r.rule1.length) violations.push(`规则1×${r.rule1.length}[${r.rule1.slice(0, 3).join('; ')}]`);
    if (r.rule2.length) violations.push(`规则2×${r.rule2.length}[${r.rule2.slice(0, 3).join('; ')}]`);
    if (r.rule3.length) violations.push(`规则3×${r.rule3.length}[${r.rule3.slice(0, 3).join('; ')}]`);
    if (r.rule4.length) violations.push(`规则4×${r.rule4.length}[${r.rule4.slice(0, 3).join('; ')}]`);
    if (!r.rule5) violations.push(`规则5(givens=${Object.keys(p.givens).length})`);
    if (violations.length) {
      badCount++;
      lines.push(`  ${p.id}: ${violations.join(' | ')}`);
    }
  }
  totalBad += badCount;
  console.log(`\n[${diff}] 共 ${data.puzzles.length} 题，违规 ${badCount} 题`);
  for (const line of lines) console.log(line);
}
console.log(`\n合计违规：${totalBad} 题`);
