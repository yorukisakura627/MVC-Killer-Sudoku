import type { CellIdx } from './grid';

// 大小约束统一用 > 或 < 表示
// 语义：a rel b 表示"a 的值比 b 大"或"a 的值比 b 小"
export type Rel = '>' | '<';

// 格间大小约束：相邻两格 a 与 b 之间标 > 或 <
// 与笼的 sum 是否隐藏无关，独立施加在相邻两格上
export interface CellInequality {
  a: CellIdx;
  b: CellIdx;
  rel: Rel;
}

// 笼间大小约束：相邻两笼 a 与 b 之间标 > 或 <
// 仅当两笼 sum === null（隐藏和值笼）时才有信息量，否则恒成立
//   —— 隐藏笼的和值需通过推理得到可能域 [lo, hi]，> / < 再收敛域
export interface CageInequality {
  a: number; // Cage.id
  b: number; // Cage.id
  rel: Rel;
}

// 格间等值约束：两格必须填相同数字
//   注意：两格不能同行/列/宫（否则与"行列宫不重复"规则矛盾导致无解），
//   视觉上用跨格连线连接，等号画在连线中点
export interface CellEquality {
  a: CellIdx;
  b: CellIdx;
}

// 笼间等值约束：两笼和值相等
//   仅当两笼 sum === null（隐藏和值笼）时才有信息量，否则直接读出和值即可
export interface CageEquality {
  a: number; // Cage.id
  b: number; // Cage.id
}

// 翻转方向：a > b 等价于 b < a，便于求解器统一处理
export function flipRel(rel: Rel): Rel {
  return rel === '>' ? '<' : '>';
}
