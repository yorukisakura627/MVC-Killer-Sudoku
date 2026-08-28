import type { Difficulty } from '@/types/puzzle';
import type { SolveResult } from '@/solver/logical';

// 难度参数：每档定义约束密度、隐藏笼比例、技巧上限与评分区间
export interface DiffParams {
  givensRange: [number, number]; // 给定数随机范围：生成时在区间内取目标值挖空
  cageHiddenRate: number; // 隐藏笼比例（sum=null）
  cellIneqRange: [number, number]; // 格间大小约束数量区间
  cageIneqRange: [number, number]; // 笼间大小约束数量区间
  cellEqRange: [number, number]; // 格间等值约束数量区间（需求5）
  cageEqRange: [number, number]; // 笼间等值约束数量区间（需求5）
  minLevel: number; // 允许的最低技巧等级（低于此等级的题被拒，保证档位区分度）
  maxAllowedLevel: number; // 允许的最高技巧等级
  ratingBand: [number, number]; // 难度评分区间
}

// 四档难度：给定数从固定值改为范围（用户需求）：easy 33~38 / normal 23~28 /
//   hard 15~20 / expert 6~10；评分带不变：easy 0~200 / normal 200~400 /
//   hard 400~600 / expert 600+
//   等值约束（需求5）：easy 无，normal 起少量引入，难度越高越多
//   minLevel 门槛：防止低档技巧（或纯传播）解出的题混入高档
//     —— 实测 normal 25 给定时多数可被纯传播解出（L0），不设门槛会大量低于 200 带
export const DIFF_PARAMS: Record<Difficulty, DiffParams> = {
  easy: {
    givensRange: [33, 38],
    cageHiddenRate: 0.1, // 需至少部分隐藏笼才能撒笼间约束
    cellIneqRange: [0, 5],
    cageIneqRange: [1, 2],
    cellEqRange: [0, 0],
    cageEqRange: [0, 0],
    minLevel: 0,
    maxAllowedLevel: 2,
    ratingBand: [0, 200],
  },
  normal: {
    givensRange: [23, 28],
    cageHiddenRate: 0.35, // 提高隐藏比例：迫使解题需要 naked-single 等技巧（否则传播即解，评分塌到 easy 区）
    cellIneqRange: [5, 10],
    cageIneqRange: [1, 3],
    cellEqRange: [0, 1],
    cageEqRange: [0, 1],
    minLevel: 1, // 至少需要 naked-single：拒绝纯传播题
    maxAllowedLevel: 3,
    ratingBand: [200, 400],
  },
  hard: {
    givensRange: [15, 20],
    cageHiddenRate: 0.4,
    cellIneqRange: [10, 15],
    cageIneqRange: [2, 4],
    cellEqRange: [0, 2],
    cageEqRange: [0, 1],
    minLevel: 3, // 至少需要数对/45 法则级技巧
    maxAllowedLevel: 3, // X-Wing(L5) 评分必超 600 带，提前拒绝省重试
    ratingBand: [400, 600],
  },
  expert: {
    givensRange: [6, 10],
    cageHiddenRate: 0.5,
    cellIneqRange: [12, 18],
    cageIneqRange: [3, 5],
    cellEqRange: [1, 3],
    cageEqRange: [0, 2],
    minLevel: 3, // 至少数对级技巧；8 给定 + 高隐藏密度自然推高评分过 600
    maxAllowedLevel: 5,
    ratingBand: [600, 9999],
  },
};

// 难度评分公式 v2（按四档实测分布拟合，用户需求 1：评分需支撑四档分段）
//   score = maxLevel×80            技巧等级：档位区分的主力（L1~L5）
//         + steps×0.8              逻辑求解步数
//         + cageCount×3            笼数量
//         + (格间+笼间大小)×4      大小约束信息量
//         + (格间+笼间等值)×6      等值约束信息量（更稀有的新机制）
//         + (81-givens)×1.5        给定数稀缺度
//         + max(0, 20-givens)×10   极稀给定加成：仅 hard(15)/expert(6~10) 触发，
//                                  拉开 expert 与 hard 的差距使其稳过 600 带
//   实测典型落点：easy L0≈145 / normal L1≈290 / hard L3≈550 / expert L3≈660
export interface RatingMeta {
  cageCount: number;
  cellIneqCount: number;
  cageIneqCount: number;
  cellEqCount?: number;
  cageEqCount?: number;
}

export function computeRating(log: SolveResult, givens: number, meta: RatingMeta): number {
  const ineq = meta.cellIneqCount + meta.cageIneqCount;
  const eq = (meta.cellEqCount ?? 0) + (meta.cageEqCount ?? 0);
  const scarce = 81 - givens;
  const rareBonus = Math.max(0, 20 - givens) * 10; // 极稀给定加成（<20 给定才触发）
  return Math.round(
    log.maxLevel * 80 +
      log.steps.length * 0.8 +
      meta.cageCount * 3 +
      ineq * 4 +
      eq * 6 +
      scarce * 1.5 +
      rareBonus,
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
