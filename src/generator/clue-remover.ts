import type { Puzzle } from '@/types/puzzle';
import { hasUniqueSolution } from '@/solver/backtrack';

// 分阶段移除给定数：随机顺序逐格尝试移除，每次移除后验证唯一解
//   - 不唯一则回退（恢复给定）
//   - 达到目标给定数 targetGivens 即停止
//   - minGivens 是保护下限（targetGivens 应 >= minGivens）
//   生成器调用此函数把"全给定谜题"逐步削减到目标难度
export function removeCluesToTarget(
  p: Puzzle,
  targetGivens: number,
  rng: () => number = Math.random,
): Puzzle {
  const cloned = clonePuzzle(p);
  // 随机顺序遍历所有格子
  const order = Array.from({ length: 81 }, (_, i) => i);
  shuffleInPlace(order, rng);

  for (const idx of order) {
    if (cloned.givens.size <= targetGivens) break;
    if (!cloned.givens.has(idx)) continue;
    const val = cloned.givens.get(idx)!;
    cloned.givens.delete(idx);
    if (!hasUniqueSolution(cloned)) {
      cloned.givens.set(idx, val); // 回退
    }
  }
  return cloned;
}

// 工具：深克隆谜题（避免污染原对象）
export function clonePuzzle(p: Puzzle): Puzzle {
  return {
    id: p.id,
    difficulty: p.difficulty,
    solution: p.solution.slice(),
    cages: p.cages.map((c) => ({ id: c.id, cells: c.cells.slice(), sum: c.sum })),
    cellIneq: p.cellIneq.map((c) => ({ ...c })),
    cageIneq: p.cageIneq.map((c) => ({ ...c })),
    // 等值约束随克隆保留：移除给定数的过程中约束集不变
    cellEq: p.cellEq.map((c) => ({ ...c })),
    cageEq: p.cageEq.map((c) => ({ ...c })),
    givens: new Map(p.givens),
    rating: p.rating,
    techniqueMax: p.techniqueMax,
    steps: p.steps,
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
