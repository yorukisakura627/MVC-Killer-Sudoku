import type { Difficulty } from '@/types/puzzle';
import type { SolveResult } from '@/solver/logical';

// 难度参数：每档定义约束密度、隐藏笼比例、技巧上限与评分区间
export interface DiffParams {
  targetGivens: number; // 移除给定数到此数量停止（最小为目标）
  minGivens: number; // 给定数下限保护（不可低于）
  cageHiddenRate: number; // 隐藏笼比例（sum=null）
  cellIneqRange: [number, number]; // 格间大小约束数量区间
  cageIneqRange: [number, number]; // 笼间大小约束数量区间
  maxAllowedLevel: number; // 允许的最高技巧等级
  ratingBand: [number, number]; // 难度评分区间
}

export const DIFF_PARAMS: Record<Difficulty, DiffParams> = {
  easy: {
    targetGivens: 35,
    minGivens: 30,
    cageHiddenRate: 0,
    cellIneqRange: [0, 5],
    cageIneqRange: [0, 0],
    maxAllowedLevel: 2,
    ratingBand: [0, 250],
  },
  normal: {
    targetGivens: 18,
    minGivens: 15,
    cageHiddenRate: 0.1,
    cellIneqRange: [5, 12],
    cageIneqRange: [1, 2],
    maxAllowedLevel: 4,
    ratingBand: [250, 500],
  },
  hard: {
    targetGivens: 5,
    minGivens: 5,
    cageHiddenRate: 0.3,
    cellIneqRange: [12, 18],
    cageIneqRange: [2, 4],
    maxAllowedLevel: 6,
    ratingBand: [500, 9999],
  },
};

// 技巧等级表：每个 level 对应一个数值权重
//   rating = maxLevel*100 + stepCount*2 + cageCount*3 + ineqCount*2
export function computeRating(
  log: SolveResult,
  cageCount: number,
  ineqCount: number,
): number {
  return (
    log.maxLevel * 100 +
    log.steps.length * 2 +
    cageCount * 3 +
    ineqCount * 2
  );
}

// 评分是否落入难度档区间
export function ratingInBand(rating: number, diff: Difficulty): boolean {
  const [lo, hi] = DIFF_PARAMS[diff].ratingBand;
  return rating >= lo && rating <= hi;
}

// 技巧等级是否在该难度允许范围
export function levelAllowed(level: number, diff: Difficulty): boolean {
  return level <= DIFF_PARAMS[diff].maxAllowedLevel;
}
