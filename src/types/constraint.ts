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

// 翻转方向：a > b 等价于 b < a，便于求解器统一处理
export function flipRel(rel: Rel): Rel {
  return rel === '>' ? '<' : '>';
}
