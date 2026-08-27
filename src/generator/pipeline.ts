import type { Puzzle } from '@/types/puzzle';
import type { Difficulty } from '@/types/puzzle';
import { randomFullGrid, mulberry32 } from './grid-gen';
import { layCages, markHiddenCages, cloneCages } from './cage-builder';
import { sowCellIneq, sowCageIneq, sowCellEquality, sowCageEquality } from './inequality-sower';
import { removeCluesToTarget, clonePuzzle } from './clue-remover';
import { DIFF_PARAMS, computeRating, ratingInBand, levelAllowed } from './difficulty';
import { hasUniqueSolution } from '@/solver/backtrack';
import { solveLogical, techniquesFor } from '@/solver/logical';

export interface GenOptions {
  diff: Difficulty;
  rng?: () => number;
  maxTries?: number;
  timeoutMs?: number;
  /** 校准用：跳过评分带检查（默认 false），用于实测各难度的真实指标分布 */
  skipRatingBand?: boolean;
}

// 主生成流程
//   1. 随机完整解
//   2. 铺笼子（部分 sum=null 作为隐藏笼）
//   3. 撒大小约束
//   4. 全格作为给定数 → 验证唯一解（应通过）
//   5. 分阶段移除给定数到目标数（每步验证唯一解）
//   6. 验证逻辑可解
//   7. 检查技巧等级 + 评分区间
//   失败重试，超时熔断
export function generatePuzzle(opts: GenOptions): Puzzle | null {
  const { diff, rng = Math.random, maxTries = 20, timeoutMs = 30000, skipRatingBand = false } = opts;
  const params = DIFF_PARAMS[diff];
  const start = Date.now();

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    if (Date.now() - start > timeoutMs) break;

    const sol = randomFullGrid(rng);
    const cages = layCages(sol, rng);

    // 标记隐藏笼：传入 sol 以启用"可行对优先"策略（需求4 配套），
    //   优先成对隐藏和值相近的相邻笼，保证 cage-ineq / cage-eq 有作用对象
    const minHidden = params.cageIneqRange[1] > 0 ? params.cageIneqRange[1] + 1 : 0;
    markHiddenCages(cages, params.cageHiddenRate, minHidden, rng, sol);

    // 冗余约束消除（需求3）：单格笼和值 = 该格的值，等价于一个给定数。
    //   若该格同时被给定，两个约束完全重复，既浪费信息又让玩家困惑；
    //   处理：所有单格笼一律置 sum=null（退化为纯区域约束），不再提供免费给定。
    //   逻辑可解性由后续 solveLogical 验证，若该和值是解题必需则本题自然重试。
    for (const cage of cages) {
      if (cage.cells.length === 1) cage.sum = null;
    }

    // 撒大小约束（先格间后笼间：笼间端点需避开格间共享边）
    const cellCount = randInt(params.cellIneqRange, rng);
    const cageCount = randInt(params.cageIneqRange, rng);
    const cellIneq = sowCellIneq(sol, cellCount, rng);
    const cageIneq = sowCageIneq(cages, sol, cageCount, rng, cellIneq);

    // 撒等值约束（需求5）：格间（非 peer 同值格对）+ 笼间（隐藏笼同和值对）
    //   全局防重叠（需求3）：依次传入已撒约束做位置避让——
    //   等号/三角符号互不重叠、不压和值标签，位置计算与渲染端一致
    const cellEqCount = randInt(params.cellEqRange, rng);
    const cageEqCount = randInt(params.cageEqRange, rng);
    const cellEq = sowCellEquality(sol, cellEqCount, rng, cellIneq, cageIneq, cages);
    const cageEq = sowCageEquality(cages, sol, cageEqCount, rng, cellIneq, cageIneq, cellEq);

    // 初始谜题：所有 81 格作为给定
    const allGivens = new Map<number, number>();
    for (let i = 0; i < 81; i++) allGivens.set(i, sol[i]);

    let p: Puzzle = {
      id: `${diff}-${Date.now()}-${attempt}`,
      difficulty: diff,
      solution: sol.slice(),
      cages: cloneCages(cages),
      cellIneq: cellIneq.slice(),
      cageIneq: cageIneq.slice(),
      cellEq: cellEq.slice(),
      cageEq: cageEq.slice(),
      givens: allGivens,
      rating: 0,
      techniqueMax: '',
      steps: 0,
    };

    // 验证初始唯一性（应通过：全给定必然唯一）
    if (!hasUniqueSolution(p)) continue;

    // 分阶段移除给定数
    p = removeCluesToTarget(p, params.targetGivens, rng);

    // 再次验证唯一解（应仍唯一，因移除时已逐个验证）
    if (!hasUniqueSolution(p)) continue;

    // 验证逻辑可解（用对应难度档的技巧列表，避免使用更高难度技巧虚低评分）
    const log = solveLogical(p, techniquesFor(diff));
    if (!log.solved) continue;

    // 检查技巧等级是否在该难度允许范围
    if (!levelAllowed(log.maxLevel, diff)) continue;

    // 最低技巧等级门槛（需求1 配套）：低于门槛说明本题对本档太容易，
    //   如 normal 被纯传播解出（L0）时评分会塌到 easy 区，直接拒绝重试
    if (log.maxLevel < params.minLevel) continue;

    // 评分
    const rating = computeRating(log, p.givens.size, {
      cageCount: p.cages.length,
      cellIneqCount: p.cellIneq.length,
      cageIneqCount: p.cageIneq.length,
      cellEqCount: p.cellEq.length,
      cageEqCount: p.cageEq.length,
    });
    if (!ratingInBand(rating, diff) && !skipRatingBand) continue;

    // 通过所有验证，填充元数据并返回
    const result = clonePuzzle(p);
    result.rating = rating;
    result.techniqueMax = log.techniqueMax;
    result.steps = log.steps.length;
    return result;
  }

  return null; // 熔断
}

function randInt([lo, hi]: [number, number], rng: () => number): number {
  if (hi < lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// 便捷入口：使用可重现种子生成
export function generatePuzzleSeeded(seed: number, diff: Difficulty): Puzzle | null {
  return generatePuzzle({ diff, rng: mulberry32(seed) });
}
