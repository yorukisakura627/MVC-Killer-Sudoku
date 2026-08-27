import type { Cage } from '@/types/cage';
import type { CellInequality, CageInequality, CellEquality, CageEquality } from '@/types/constraint';
import { findAdjacentCagePairs, elasticLimit, pickCageEndpoints, cageEndpointMidpoint } from './cage-builder';

// 全局防重叠（需求3）：所有约束符号（格间大小三角、笼间大小三角、格间等号、
//   笼间等号）在棋盘上互不重叠，否则玩家看不见被盖住的符号。
//   策略：撒播时收集"已占用符号位置"（格坐标，0.5 步长），新符号中点与它们的
//   距离低于最小间距则放弃该候选；符号位置计算与渲染端完全一致（确定性）。

// 符号间最小间距的平方（格坐标空间）：0.6 格
//   符号半径约 10~12px，0.6 格（≈33px @55px 格）保证两个符号边缘不贴不叠
const MIN_SYMBOL_DIST_SQ = 0.36;

// 任意两格中心连线的中点（格坐标，行列可为 .5）
//   渲染端格间大小三角 / 格间等号均画在该点，保证撒播端与渲染端位置一致
function cellPairMidpoint(a: number, b: number): { r: number; c: number } {
  return {
    r: (Math.floor(a / 9) + Math.floor(b / 9)) / 2,
    c: ((a % 9) + (b % 9)) / 2,
  };
}

// 有和值笼的左上格（行最小→列最小）：和值标签的绘制位置
//   与渲染端 cage-labels.ts 的选取逻辑一致，用于符号避让标签
function collectLabelCells(cages: Cage[]): Set<number> {
  const labelCells = new Set<number>();
  for (const cage of cages) {
    if (cage.sum === null) continue;
    let minIdx = cage.cells[0];
    for (const idx of cage.cells) {
      if (Math.floor(idx / 9) < Math.floor(minIdx / 9) ||
          (Math.floor(idx / 9) === Math.floor(minIdx / 9) && idx % 9 < minIdx % 9)) {
        minIdx = idx;
      }
    }
    labelCells.add(minIdx);
  }
  return labelCells;
}

// 中点是否与任一已占用位置过近（低于最小间距 → 视觉上会重叠）
function tooClose(mid: { r: number; c: number }, occupied: Array<{ r: number; c: number }>): boolean {
  return occupied.some((m) => (m.r - mid.r) ** 2 + (m.c - mid.c) ** 2 < MIN_SYMBOL_DIST_SQ);
}

// 中点是否落在某格上（行列向下取整定位格）
function midCellIdx(mid: { r: number; c: number }): number {
  return Math.floor(mid.r) * 9 + Math.floor(mid.c);
}

// 撒播格间大小约束：在解中随机选 count 个相邻格对，按解中值的方向标 > 或 <
//   - 不允许重复同一对
//   - 相等值不撒（大小约束需要不同值）
//   - count 是上限，实际可能少于（无足够合法相邻对）
//   - 最先撒播，其符号位置作为后续其他约束的避让对象
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
//   - 防重叠：端点避开 cellIneq 共享边（conflict 直接放弃，渲染端不会触发偏移兜底）、
//     符号不压和值标签、与已选符号保持最小间距
//   - count 是上限，实际可能少于（无足够合法相邻对）
export function sowCageIneq(
  cages: Cage[],
  sol: number[],
  count: number,
  rng: () => number = Math.random,
  cellIneqList: CellInequality[] = [],
): CageInequality[] {
  const hiddenCages = cages.filter((c) => c.sum === null);
  const pairs = findAdjacentCagePairs(hiddenCages);
  shuffleInPlace(pairs, rng);

  const labelCells = collectLabelCells(cages);
  const result: CageInequality[] = [];
  const used = new Set<string>();
  const usedMids: Array<{ r: number; c: number }> = [];
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
    // 端点与渲染端一致：避开 cellIneq 共享边；仍冲突则放弃该对（不依赖渲染端偏移兜底）
    const ep = pickCageEndpoints(a, b, cellIneqList);
    if (!ep || ep.conflict) continue;
    const mid = cageEndpointMidpoint(ep);
    // 符号不得压住和值标签
    if (labelCells.has(midCellIdx(mid))) continue;
    // 与已选符号保持最小间距
    if (tooClose(mid, usedMids)) continue;
    usedMids.push(mid);
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
//   - 防重叠：等号不压和值标签，且与格间大小三角、笼间大小三角、其他等号保持最小间距
export function sowCellEquality(
  sol: number[],
  count: number,
  rng: () => number = Math.random,
  cellIneqList: CellInequality[] = [],
  cageIneqList: CageInequality[] = [],
  cages: Cage[] = [],
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

  // 全局防重叠禁区（已占用符号位置，格坐标 0.5 网格）：
  //   - 格间大小三角位置 = 相邻对共享边中点
  //   - 笼间大小三角位置 = 与渲染端一致（pickCageEndpoints + cageEndpointMidpoint）
  const occupied: Array<{ r: number; c: number }> = [];
  for (const ii of cellIneqList) occupied.push(cellPairMidpoint(ii.a, ii.b));
  const cageById = new Map(cages.map((c) => [c.id, c]));
  for (const ci of cageIneqList) {
    const ca = cageById.get(ci.a);
    const cb = cageById.get(ci.b);
    if (!ca || !cb) continue;
    const ep = pickCageEndpoints(ca, cb, cellIneqList);
    if (ep) occupied.push(cageEndpointMidpoint(ep));
  }
  const labelCells = collectLabelCells(cages);

  const result: CellEquality[] = [];
  const usedCells = new Set<number>();
  const usedMids: Array<{ r: number; c: number }> = [];
  for (const { a, b } of cands) {
    if (result.length >= count) break;
    if (usedCells.has(a) || usedCells.has(b)) continue;
    const mid = cellPairMidpoint(a, b);
    // 等号不得压住和值标签
    if (labelCells.has(midCellIdx(mid))) continue;
    // 与所有已有符号（大小三角、其他等号）保持最小间距
    if (tooClose(mid, occupied) || tooClose(mid, usedMids)) continue;
    usedCells.add(a);
    usedCells.add(b);
    usedMids.push(mid);
    result.push({ a, b });
  }
  return result;
}

// 撒播笼间等值约束（需求5）：在隐藏笼相邻对中选和值相等的笼对
//   - 两笼和值必须真相等（约束与解一致）
//   - 每笼最多参与 1 个等值约束
//   - 防重叠（需求3）：等号不与任何其他符号（笼间大小三角、格间大小三角、
//     格间等号）、和值标签重叠；与 cageIneq 相同笼对直接排除（同对必同位置）
export function sowCageEquality(
  cages: Cage[],
  sol: number[],
  count: number,
  rng: () => number = Math.random,
  cellIneqList: CellInequality[] = [],
  cageIneqList: CageInequality[] = [],
  cellEqList: CellEquality[] = [],
): CageEquality[] {
  if (count <= 0) return [];

  // 与解无关的静态避让数据：
  //   - cageIneq 笼对键集合（同对排除：位置完全重合）
  //   - 已占用符号位置 = cageIneq 三角中点 + cellEq 等号中点
  //   - 有和值笼的左上格集合（标签位置避让）
  const cageIneqKeys = new Set(
    cageIneqList.map((ci) => (ci.a < ci.b ? `${ci.a}-${ci.b}` : `${ci.b}-${ci.a}`)),
  );
  const cageById = new Map(cages.map((c) => [c.id, c]));
  const occupied: Array<{ r: number; c: number }> = [];
  for (const ci of cageIneqList) {
    const ca = cageById.get(ci.a);
    const cb = cageById.get(ci.b);
    if (!ca || !cb) continue;
    const ep = pickCageEndpoints(ca, cb, cellIneqList);
    if (ep) occupied.push(cageEndpointMidpoint(ep));
  }
  for (const eq of cellEqList) occupied.push(cellPairMidpoint(eq.a, eq.b));
  const labelCells = collectLabelCells(cages);

  const hiddenCages = cages.filter((c) => c.sum === null);
  const pairs = findAdjacentCagePairs(hiddenCages);
  shuffleInPlace(pairs, rng);

  const result: CageEquality[] = [];
  const usedCages = new Set<number>();
  const usedMids: Array<{ r: number; c: number }> = [];
  for (const [a, b] of pairs) {
    if (result.length >= count) break;
    if (usedCages.has(a.id) || usedCages.has(b.id)) continue;
    // 与 cageIneq 同笼对 → 位置完全重合，直接排除
    const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
    if (cageIneqKeys.has(key)) continue;
    const sa = a.cells.reduce((s, idx) => s + sol[idx], 0);
    const sb = b.cells.reduce((s, idx) => s + sol[idx], 0);
    if (sa !== sb) continue; // 等值约束要求两笼和值真相等
    // 端点与渲染端一致：避开 cellIneq 共享边；仍冲突则放弃该对
    const ep = pickCageEndpoints(a, b, cellIneqList);
    if (!ep || ep.conflict) continue;
    const mid = cageEndpointMidpoint(ep);
    // 等号不得压住和值标签
    if (labelCells.has(midCellIdx(mid))) continue;
    // 与所有已有符号（大小三角、格间等号、已选笼间等号）保持最小间距
    if (tooClose(mid, occupied) || tooClose(mid, usedMids)) continue;
    usedCages.add(a.id);
    usedCages.add(b.id);
    usedMids.push(mid);
    result.push({ a: a.id, b: b.id });
  }
  return result;
}
