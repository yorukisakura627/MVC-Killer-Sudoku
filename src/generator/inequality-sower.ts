import type { Cage } from '@/types/cage';
import type { CellInequality, CageInequality } from '@/types/constraint';
import { findAdjacentCagePairs } from './cage-builder';

// 撒播格间大小约束：在解中随机选 count 个相邻格对，按解中值的方向标 > 或 <
//   - 不允许重复同一对
//   - 相等值不撒（大小约束需要不同值）
//   - count 是上限，实际可能少于（无足够合法相邻对）
export function sowCellIneq(
  sol: number[],
  count: number,
  rng: () => number = Math.random,
): CellInequality[] {
  // 收集所有相邻格对（不重复）
  const edges: Array<{ a: number; b: number }> = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const a = r * 9 + c;
      if (c < 8) edges.push({ a, b: a + 1 }); // 水平边
      if (r < 8) edges.push({ a, b: a + 9 }); // 垂直边
    }
  }
  shuffleInPlace(edges, rng);

  const result: CellInequality[] = [];
  for (const { a, b } of edges) {
    if (result.length >= count) break;
    const va = sol[a];
    const vb = sol[b];
    if (va === vb) continue;
    result.push({ a, b, rel: va > vb ? '>' : '<' });
  }
  return result;
}

// 撒播笼间大小约束：在 sum=null 的相邻笼对之间随机选 count 对
//   - 按解中两笼和值的方向标 > 或 <
//   - 相等和值不撒
//   - count 是上限
export function sowCageIneq(
  cages: Cage[],
  sol: number[],
  count: number,
  rng: () => number = Math.random,
): CageInequality[] {
  const hiddenCages = cages.filter((c) => c.sum === null);
  const pairs = findAdjacentCagePairs(hiddenCages);
  shuffleInPlace(pairs, rng);

  const result: CageInequality[] = [];
  const used = new Set<string>();
  for (const [a, b] of pairs) {
    if (result.length >= count) break;
    const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
    if (used.has(key)) continue;
    used.add(key);
    const sa = a.cells.reduce((s, idx) => s + sol[idx], 0);
    const sb = b.cells.reduce((s, idx) => s + sol[idx], 0);
    if (sa === sb) continue;
    result.push({ a: a.id, b: b.id, rel: sa > sb ? '>' : '<' });
  }
  return result;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
