import type { Puzzle } from '@/types/puzzle';
import { CandidateGrid, CandSet } from './candidates';
import { Propagator } from './propagator';
import { buildConstraintsFor } from './constraints';

// 暴力回溯求解器：用于"唯一解"验证
//   - 先用约束传播尽量收敛候选数
//   - 用 MRV（最小剩余值）启发式选未定格
//   - 试每个候选值，递归
//   - 累计解数到 cap 后立即返回
//   - 因为已经预先传播，单题通常毫秒级出解
export function solveBrute(p: Puzzle, cap = 2): number[][] {
  const grid = CandidateGrid.fromPuzzle(p);
  const propagator = new Propagator(buildConstraintsFor(p.cages, p.cellIneq, p.cageIneq, p.cellEq, p.cageEq));
  if (!propagator.run(grid)) return []; // 初始就矛盾
  const solutions: number[][] = [];
  backtrack(grid, propagator, cap, solutions);
  return solutions;
}

function backtrack(grid: CandidateGrid, propagator: Propagator, cap: number, out: number[][]): void {
  if (out.length >= cap) return;
  if (grid.isSolved()) {
    out.push(grid.toSolution());
    return;
  }
  if (grid.hasContradiction()) return;

  // MRV：选候选数最少的未定格
  let bestIdx = -1;
  let bestSize = 10;
  for (let i = 0; i < 81; i++) {
    const sz = grid.cands[i].size;
    if (sz > 1 && sz < bestSize) {
      bestIdx = i;
      bestSize = sz;
      if (sz === 2) break; // 已是最优
    }
  }
  if (bestIdx === -1) {
    if (grid.isSolved()) out.push(grid.toSolution());
    return;
  }

  const candidates = grid.cands[bestIdx].toArray();
  for (const v of candidates) {
    if (out.length >= cap) return;
    const next = grid.clone();
    next.setValue(bestIdx, v);
    // 单步传播：约束会自动剔除同行同列同宫同笼与不等的候选
    if (propagator.run(next)) {
      backtrack(next, propagator, cap, out);
    }
  }
}

// 工具：检查谜题是否恰好有唯一解
export function hasUniqueSolution(p: Puzzle): boolean {
  return solveBrute(p, 2).length === 1;
}

// 工具：验证候选解是否合法（与谜题所有约束一致）
export function isValidSolution(p: Puzzle, sol: number[]): boolean {
  if (sol.length !== 81) return false;
  // 与给定数一致
  for (const [idx, v] of p.givens) {
    if (sol[idx] !== v) return false;
  }
  // 行/列/宫不重复（用 9 位掩码检查）
  for (let i = 0; i < 9; i++) {
    let rowMask = 0;
    let colMask = 0;
    let boxMask = 0;
    for (let j = 0; j < 9; j++) {
      const r = sol[i * 9 + j];
      const c = sol[j * 9 + i];
      const bx = (Math.floor(i / 3) * 3 + Math.floor(j / 3)) * 9 + (i % 3) * 3 + j % 3;
      const b = sol[bx];
      if (r < 1 || r > 9 || (rowMask & (1 << (r - 1)))) return false;
      if (c < 1 || c > 9 || (colMask & (1 << (c - 1)))) return false;
      if (b < 1 || b > 9 || (boxMask & (1 << (b - 1)))) return false;
      rowMask |= 1 << (r - 1);
      colMask |= 1 << (c - 1);
      boxMask |= 1 << (b - 1);
    }
  }
  // 笼约束
  for (const cage of p.cages) {
    const vals = cage.cells.map((idx) => sol[idx]);
    if (new Set(vals).size !== vals.length) return false; // 笼内不重复
    if (cage.sum !== null && vals.reduce((a, b) => a + b, 0) !== cage.sum) return false;
  }
  // 格间大小
  for (const { a, b, rel } of p.cellIneq) {
    if (rel === '>' && !(sol[a] > sol[b])) return false;
    if (rel === '<' && !(sol[a] < sol[b])) return false;
  }
  // 笼间大小（隐藏笼和值在解中已确定）
  const cageSum = new Map<number, number>();
  for (const cage of p.cages) {
    cageSum.set(cage.id, cage.cells.reduce((a, idx) => a + sol[idx], 0));
  }
  for (const { a, b, rel } of p.cageIneq) {
    const sa = cageSum.get(a)!;
    const sb = cageSum.get(b)!;
    if (rel === '>' && !(sa > sb)) return false;
    if (rel === '<' && !(sa < sb)) return false;
  }
  // 格间等值：两格同值
  for (const { a, b } of p.cellEq ?? []) {
    if (sol[a] !== sol[b]) return false;
  }
  // 笼间等值：两笼和值相等
  for (const { a, b } of p.cageEq ?? []) {
    if (cageSum.get(a)! !== cageSum.get(b)!) return false;
  }
  return true;
}

// 备用：直接以一个候选集 grid 单独求解（generator/pipeline 复用）
export function solveGrid(grid: CandidateGrid, constraints: ReturnType<typeof buildConstraintsFor>, cap = 2): number[][] {
  const propagator = new Propagator(constraints);
  if (!propagator.run(grid)) return [];
  const out: number[][] = [];
  backtrack(grid, propagator, cap, out);
  return out;
}

export { CandSet };
