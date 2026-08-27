import type { CellIdx } from './grid';

// Killer 笼：连通的 2~5 格组成，笼内数字不重复
// sum === null 表示"隐藏和值笼"，仅此类笼可参与笼间大小约束
//   玩家需通过 45 法则或邻接已知笼推理出隐藏和值，再由 > / < 关系收敛
export interface Cage {
  id: number;
  cells: CellIdx[]; // 2~5 格，按某种顺序（通常左上角优先）
  sum: number | null;
}

// 笼内是否包含某格
export function cageHas(cage: Cage, idx: CellIdx): boolean {
  return cage.cells.includes(idx);
}

// 笼左上角格：用于渲染时放置"和值标签"和求解器排序
export function cageTopLeft(cage: Cage): CellIdx {
  return Math.min(...cage.cells);
}

// 笼的真实和值（即使隐藏，求解器内部仍能查到——从完整解计算）
export function cageActualSum(cage: Cage, solution: number[]): number {
  return cage.cells.reduce((acc, idx) => acc + solution[idx], 0);
}

// 两笼是否相邻（共享至少一条边）——用于决定笼间大小约束的可施加位置
export function cagesAdjacent(a: Cage, b: Cage): boolean {
  const bset = new Set(b.cells);
  for (const idx of a.cells) {
    const r = Math.floor(idx / 9);
    const c = idx % 9;
    const cand = [
      r > 0 ? idx - 9 : -1,
      r < 8 ? idx + 9 : -1,
      c > 0 ? idx - 1 : -1,
      c < 8 ? idx + 1 : -1,
    ];
    if (cand.some((x) => x >= 0 && bset.has(x))) return true;
  }
  return false;
}
