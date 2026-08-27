import type { Cage } from '@/types/cage';
import type { CellInequality, CageInequality, CellEquality, CageEquality } from '@/types/constraint';
import { findAdjacentCagePairs, elasticLimit } from './cage-builder';

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

// 笼间大小约束的弹性上限 elasticLimit 已移至 cage-builder.ts 统一维护（避免循环依赖）

// 撒播笼间大小约束：在 sum=null 的相邻笼对之间随机选 count 对
//   - 按解中两笼和值的方向标 > 或 <
//   - 相等和值不撒；和值差超过弹性上限的候选对跳过（需求4）
//   - count 是上限，实际可能少于（无足够合法相邻对）
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
    // 弹性校验：和值差超出 1+N 的笼对信息量过早确定，不撒（需求4）
    const diff = Math.abs(sa - sb);
    const minSum = Math.min(sa, sb);
    if (diff > elasticLimit(minSum)) continue;
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

// 两格是否同行/列/宫（peer）：等值约束的格对必须非 peer，否则与不重复规则矛盾
function isPeer(a: number, b: number): boolean {
  const ra = Math.floor(a / 9), ca = a % 9;
  const rb = Math.floor(b / 9), cb = b % 9;
  return ra === rb || ca === cb || (Math.floor(ra / 3) === Math.floor(rb / 3) && Math.floor(ca / 3) === Math.floor(cb / 3));
}

// 撒播格间等值约束（需求5）：随机选 count 个非 peer 格对，两格必须填相同数字
//   - 关键：约束必须与解一致，因此只从"解中值相同"的格对中选
//   - 格对必须非 peer（同行/列/宫会与不重复规则矛盾导致无解）
//   - 每格最多参与 1 个等值约束（避免约束链过密、视觉混乱）
//   - 优先近距离格对（曼哈顿距离小），连线短、可读性好
export function sowCellEquality(
  sol: number[],
  count: number,
  rng: () => number = Math.random,
): CellEquality[] {
  if (count <= 0) return [];
  // 按值分组：等值格对只能来自同值格（约束才与解一致）
  const byValue = new Map<number, number[]>();
  for (let i = 0; i < 81; i++) {
    const arr = byValue.get(sol[i]) ?? [];
    arr.push(i);
    byValue.set(sol[i], arr);
  }
  // 生成所有"同值且非 peer"候选对，按曼哈顿距离升序，近距离优先
  const cands: Array<{ a: number; b: number; d: number }> = [];
  for (const cells of byValue.values()) {
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i];
        const b = cells[j];
        if (isPeer(a, b)) continue;
        const d = Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) + Math.abs((a % 9) - (b % 9));
        cands.push({ a, b, d });
      }
    }
  }
  shuffleInPlace(cands, rng);
  cands.sort((x, y) => x.d - y.d); // 近距离优先（稳定排序下同距离保持随机序）

  const result: CellEquality[] = [];
  const usedCells = new Set<number>();
  for (const { a, b } of cands) {
    if (result.length >= count) break;
    if (usedCells.has(a) || usedCells.has(b)) continue;
    usedCells.add(a);
    usedCells.add(b);
    result.push({ a, b });
  }
  return result;
}

// 撒播笼间等值约束（需求5）：在隐藏笼相邻对中选和值相等的笼对
//   - 两笼和值必须真相等（约束与解一致）
//   - 每笼最多参与 1 个等值约束
export function sowCageEquality(
  cages: Cage[],
  sol: number[],
  count: number,
  rng: () => number = Math.random,
): CageEquality[] {
  if (count <= 0) return [];
  const hiddenCages = cages.filter((c) => c.sum === null);
  const pairs = findAdjacentCagePairs(hiddenCages);
  shuffleInPlace(pairs, rng);

  const result: CageEquality[] = [];
  const usedCages = new Set<number>();
  for (const [a, b] of pairs) {
    if (result.length >= count) break;
    if (usedCages.has(a.id) || usedCages.has(b.id)) continue;
    const sa = a.cells.reduce((s, idx) => s + sol[idx], 0);
    const sb = b.cells.reduce((s, idx) => s + sol[idx], 0);
    if (sa !== sb) continue; // 等值约束要求两笼和值真相等
    usedCages.add(a.id);
    usedCages.add(b.id);
    result.push({ a: a.id, b: b.id });
  }
  return result;
}
