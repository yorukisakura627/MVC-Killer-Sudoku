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

// 约束重叠回退 + 补回（需求1）：渲染端的防重叠只是"尽量不产生"，仍会有漏网的
//   重叠（如和值标签位置与等号中点重合、等号间互相覆盖）。统一策略：
//   1) 枚举所有符号位置（标签 + 三角 + 等号），找出"任何一对距离<最小间距"的冲突；
//   2) 按优先级删除低优先级符号：和值标签 > 笼间等值 > 格间等值 > 笼间大小 > 格间大小；
//      同优先级则按索引靠后者删除，保证删除数量最小；
//   3) 删除后按被删除数量从剩余候选里补回该类约束；补不回来的空缺只能接受该题
//      约束数量减少，后续若唯一性/难度不达标则 pipeline 直接熔断换新题。
export interface ResolveOverlapResult {
  cellIneq: CellInequality[];
  cageIneq: CageInequality[];
  cellEq: CellEquality[];
  cageEq: CageEquality[];
  // 因重叠被删除（未补回）的数量：调用方日志用
  removed: { cellIneq: number; cageIneq: number; cellEq: number; cageEq: number };
}

// 优先级数值：越大越优先保留（0 = 被删候选，越小越先被删）
const PRIO_LABEL = 10;    // 和值标签：绝对保留
const PRIO_CAGE_EQ = 5;   // 笼间等值：次优先
const PRIO_CELL_EQ = 3;   // 格间等值
const PRIO_CAGE_INEQ = 2; // 笼间大小
const PRIO_CELL_INEQ = 1; // 格间大小（信息量最低，先删）

export function resolveConstraintOverlaps(
  cages: Cage[],
  sol: number[],
  cellIneq: CellInequality[],
  cageIneq: CageInequality[],
  cellEq: CellEquality[],
  cageEq: CageEquality[],
  rng: () => number = Math.random,
  givens?: ReadonlySet<number>,
): ResolveOverlapResult {
  // === 步骤 0：用户规则 2/3——双给定格间约束必删 ===
  //   两个相邻格都给定值时格间大小约束无效（规则 2）；两个对角格都给定值时
  //   格间等值约束无效（规则 3）。givens 传入时（挖空后的二次调用），
  //   把双给定约束标记为必删；补回阶段跳过双给定候选，避免重新引入无效约束
  const forceRemovedCellIneq = new Set<number>();
  const forceRemovedCellEq = new Set<number>();
  if (givens) {
    cellIneq.forEach((ii, idx) => {
      if (givens.has(ii.a) && givens.has(ii.b)) forceRemovedCellIneq.add(idx);
    });
    cellEq.forEach((eq, idx) => {
      if (givens.has(eq.a) && givens.has(eq.b)) forceRemovedCellEq.add(idx);
    });
  }

  // === 步骤 1：构建符号池（每条符号：位置 + 类型索引 + 优先级）===
  type Sym = {
    mid: { r: number; c: number };
    prio: number;
    cat: 'cellIneq' | 'cageIneq' | 'cellEq' | 'cageEq';
    idx: number; // 在对应数组中的下标
  };
  const syms: Sym[] = [];
  // 和值标签：没有 idx，仅作为"永远保留"的锚定符号（PRIO 最大）
  const labelCells = collectLabelCells(cages);
  for (const lc of labelCells) {
    syms.push({
      mid: { r: Math.floor(lc / 9) + 0.0, c: (lc % 9) + 0.0 },
      prio: PRIO_LABEL,
      cat: 'cellIneq',
      idx: -1,
    });
  }
  cellIneq.forEach((ii, idx) => {
    if (forceRemovedCellIneq.has(idx)) return; // 规则2：双给定必删，不进符号池
    syms.push({ mid: cellPairMidpoint(ii.a, ii.b), prio: PRIO_CELL_INEQ, cat: 'cellIneq', idx });
  });
  // cageIneq 位置通过 pickCageEndpoints
  const cageById = new Map(cages.map((c) => [c.id, c]));
  cageIneq.forEach((ci, idx) => {
    const ca = cageById.get(ci.a), cb = cageById.get(ci.b);
    if (!ca || !cb) return;
    const ep = pickCageEndpoints(ca, cb, cellIneq);
    if (!ep) return;
    let mid = cageEndpointMidpoint(ep);
    // 冲突偏移与渲染端一致：ep.conflict → 法向偏移 0.35 格
    if (ep.conflict) {
      const ar = Math.floor(ep.a / 9), ac = ep.a % 9;
      const br = Math.floor(ep.b / 9), bc = ep.b % 9;
      const dx = bc - ac, dy = br - ar;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const nx = -uy, ny = ux;
      mid = { r: mid.r + ny * 0.35, c: mid.c + nx * 0.35 };
    }
    syms.push({ mid, prio: PRIO_CAGE_INEQ, cat: 'cageIneq', idx });
  });
  cellEq.forEach((eq, idx) => {
    if (forceRemovedCellEq.has(idx)) return; // 规则3：双给定必删，不进符号池
    syms.push({ mid: cellPairMidpoint(eq.a, eq.b), prio: PRIO_CELL_EQ, cat: 'cellEq', idx });
  });
  cageEq.forEach((eq, idx) => {
    const ca = cageById.get(eq.a), cb = cageById.get(eq.b);
    if (!ca || !cb) return;
    const ep = pickCageEndpoints(ca, cb, cellIneq);
    if (!ep) return;
    let mid = cageEndpointMidpoint(ep);
    if (ep.conflict) {
      const ar = Math.floor(ep.a / 9), ac = ep.a % 9;
      const br = Math.floor(ep.b / 9), bc = ep.b % 9;
      const dx = bc - ac, dy = br - ar;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const nx = -uy, ny = ux;
      mid = { r: mid.r + ny * 0.35, c: mid.c + nx * 0.35 };
    }
    syms.push({ mid, prio: PRIO_CAGE_EQ, cat: 'cageEq', idx });
  });

  // === 步骤 2：反复扫描冲突，删除低优先级 ===
  // 位图：被删除的符号索引（syms 中的位置）
  const removed = new Set<number>();
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < syms.length; i++) {
      if (removed.has(i)) continue;
      const si = syms[i];
      for (let j = i + 1; j < syms.length; j++) {
        if (removed.has(j)) continue;
        const sj = syms[j];
        const dsq = (si.mid.r - sj.mid.r) ** 2 + (si.mid.c - sj.mid.c) ** 2;
        if (dsq >= MIN_SYMBOL_DIST_SQ) continue;
        // 选一个删除：优先级低的先删；同优先级删索引靠后的那个
        let loser = -1;
        if (si.prio < sj.prio) loser = i;
        else if (sj.prio < si.prio) loser = j;
        else loser = j;
        // 被删的不能是"和值标签锚定"（PRIO_LABEL 永远优先）
        if (syms[loser].prio >= PRIO_LABEL) {
          // 罕见：两个标签重叠（不可能）或对手是标签 → 标签不能删，必须删对手
          const opp = loser === i ? j : i;
          if (syms[opp].prio >= PRIO_LABEL) continue; // 双标签都不能删，交给渲染层裁剪
          loser = opp;
        }
        removed.add(loser);
        progress = true;
      }
    }
  }

  // === 步骤 3：按类别整理剩余约束 ===
  const cellIneqRemain: CellInequality[] = [];
  const cageIneqRemain: CageInequality[] = [];
  const cellEqRemain: CellEquality[] = [];
  const cageEqRemain: CageEquality[] = [];
  const origSizes = { cellIneq: cellIneq.length, cageIneq: cageIneq.length, cellEq: cellEq.length, cageEq: cageEq.length };
  const keepFlags = {
    cellIneq: new Set<number>(),
    cageIneq: new Set<number>(),
    cellEq: new Set<number>(),
    cageEq: new Set<number>(),
  };
  for (let k = 0; k < syms.length; k++) {
    if (removed.has(k)) continue;
    const s = syms[k];
    if (s.idx < 0) continue; // 标签锚定不是约束
    keepFlags[s.cat].add(s.idx);
  }
  cellIneq.forEach((ii, i) => { if (keepFlags.cellIneq.has(i)) cellIneqRemain.push(ii); });
  cageIneq.forEach((ci, i) => { if (keepFlags.cageIneq.has(i)) cageIneqRemain.push(ci); });
  cellEq.forEach((eq, i) => { if (keepFlags.cellEq.has(i)) cellEqRemain.push(eq); });
  cageEq.forEach((eq, i) => { if (keepFlags.cageEq.has(i)) cageEqRemain.push(eq); });

  // === 步骤 4：从候选里补齐被删除数量 ===
  //   cellIneq / cellEq 的补回：复用原函数但目标是"补齐到目标数量"，不洗牌直接从已跳过的候选里顺序挑
  const target = origSizes;

  // cellIneq 补回：从剩余未选的相邻对里挑（等值不等则跳过）
  if (cellIneqRemain.length < target.cellIneq) {
    const usedPairs = new Set(cellIneqRemain.map((ii) => `${ii.a}-${ii.b}`));
    const missing = target.cellIneq - cellIneqRemain.length;
    void missing;
    for (let r = 0; r < 9; r++) {
      if (cellIneqRemain.length >= target.cellIneq) break;
      for (let c = 0; c < 9; c++) {
        if (cellIneqRemain.length >= target.cellIneq) break;
        const a = r * 9 + c;
        const tryPair = (x: number, y: number) => {
          const key = x < y ? `${x}-${y}` : `${y}-${x}`;
          if (usedPairs.has(key)) return;
          const va = sol[x], vb = sol[y];
          if (va === vb) return;
          // 规则2：两格都给定值时大小约束无效，不补回
          if (givens && givens.has(x) && givens.has(y)) return;
          const cand: CellInequality = { a: x, b: y, rel: va > vb ? '>' : '<' };
          const mid = cellPairMidpoint(x, y);
          // 防重叠：若与现保留符号冲突则继续下一个
          const existing: Array<{ r: number; c: number }> = [];
          for (const lc of labelCells) existing.push({ r: Math.floor(lc / 9), c: lc % 9 });
          for (const ii of cellIneqRemain) existing.push(cellPairMidpoint(ii.a, ii.b));
          for (const ci of cageIneqRemain) {
            const ccA = cageById.get(ci.a), ccB = cageById.get(ci.b);
            if (!ccA || !ccB) continue;
            const ep = pickCageEndpoints(ccA, ccB, cellIneqRemain);
            if (!ep) continue;
            let m = cageEndpointMidpoint(ep);
            if (ep.conflict) {
              const ar = Math.floor(ep.a / 9), ac = ep.a % 9, br = Math.floor(ep.b / 9), bc = ep.b % 9;
              const dx = bc - ac, dy = br - ar, len = Math.hypot(dx, dy) || 1;
              const nx = -(dy / len), ny = dx / len;
              m = { r: m.r + ny * 0.35, c: m.c + nx * 0.35 };
            }
            existing.push(m);
          }
          for (const eq of cellEqRemain) existing.push(cellPairMidpoint(eq.a, eq.b));
          for (const eq of cageEqRemain) {
            const ccA = cageById.get(eq.a), ccB = cageById.get(eq.b);
            if (!ccA || !ccB) continue;
            const ep = pickCageEndpoints(ccA, ccB, cellIneqRemain);
            if (!ep) continue;
            let m = cageEndpointMidpoint(ep);
            if (ep.conflict) {
              const ar = Math.floor(ep.a / 9), ac = ep.a % 9, br = Math.floor(ep.b / 9), bc = ep.b % 9;
              const dx = bc - ac, dy = br - ar, len = Math.hypot(dx, dy) || 1;
              const nx = -(dy / len), ny = dx / len;
              m = { r: m.r + ny * 0.35, c: m.c + nx * 0.35 };
            }
            existing.push(m);
          }
          if (tooClose(mid, existing)) return;
          usedPairs.add(key);
          cellIneqRemain.push(cand);
        };
        if (c < 8) tryPair(a, a + 1);
        if (r < 8) tryPair(a, a + 9);
      }
    }
  }

  // cageIneq 补回：从相邻隐藏笼对里重扫
  if (cageIneqRemain.length < target.cageIneq) {
    const hiddenCages = cages.filter((c) => c.sum === null);
    const usedKeys = new Set(cageIneqRemain.map((ci) => (ci.a < ci.b ? `${ci.a}-${ci.b}` : `${ci.b}-${ci.a}`)));
    const existing: Array<{ r: number; c: number }> = [];
    for (const lc of labelCells) existing.push({ r: Math.floor(lc / 9), c: lc % 9 });
    for (const ii of cellIneqRemain) existing.push(cellPairMidpoint(ii.a, ii.b));
    for (const ci of cageIneqRemain) {
      const ca = cageById.get(ci.a), cb = cageById.get(ci.b);
      if (!ca || !cb) continue;
      const ep = pickCageEndpoints(ca, cb, cellIneqRemain);
      if (!ep) continue;
      let m = cageEndpointMidpoint(ep);
      if (ep.conflict) {
        const ar = Math.floor(ep.a / 9), ac = ep.a % 9, br = Math.floor(ep.b / 9), bc = ep.b % 9;
        const dx = bc - ac, dy = br - ar, len = Math.hypot(dx, dy) || 1;
        const nx = -(dy / len), ny = dx / len;
        m = { r: m.r + ny * 0.35, c: m.c + nx * 0.35 };
      }
      existing.push(m);
    }
    for (const eq of cellEqRemain) existing.push(cellPairMidpoint(eq.a, eq.b));
    for (const eq of cageEqRemain) {
      const ca = cageById.get(eq.a), cb = cageById.get(eq.b);
      if (!ca || !cb) continue;
      const ep = pickCageEndpoints(ca, cb, cellIneqRemain);
      if (!ep) continue;
      let m = cageEndpointMidpoint(ep);
      if (ep.conflict) {
        const ar = Math.floor(ep.a / 9), ac = ep.a % 9, br = Math.floor(ep.b / 9), bc = ep.b % 9;
        const dx = bc - ac, dy = br - ar, len = Math.hypot(dx, dy) || 1;
        const nx = -(dy / len), ny = dx / len;
        m = { r: m.r + ny * 0.35, c: m.c + nx * 0.35 };
      }
      existing.push(m);
    }
    const pairs = findAdjacentCagePairs(hiddenCages);
    shuffleInPlace(pairs, rng);
    for (const [a, b] of pairs) {
      if (cageIneqRemain.length >= target.cageIneq) break;
      const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      if (usedKeys.has(key)) continue;
      const sa = a.cells.reduce((s, i) => s + sol[i], 0);
      const sb = b.cells.reduce((s, i) => s + sol[i], 0);
      if (sa === sb) continue;
      const diff = Math.abs(sa - sb);
      const minSum = Math.min(sa, sb);
      if (diff > elasticLimit(minSum)) continue;
      const ep = pickCageEndpoints(a, b, cellIneqRemain);
      if (!ep || ep.conflict) continue;
      const mid = cageEndpointMidpoint(ep);
      if (labelCells.has(midCellIdx(mid))) continue;
      if (tooClose(mid, existing)) continue;
      usedKeys.add(key);
      existing.push(mid);
      cageIneqRemain.push({ a: a.id, b: b.id, rel: sa > sb ? '>' : '<' });
    }
  }

  // cellEq 补回：重扫同值非 peer 格对
  if (cellEqRemain.length < target.cellEq) {
    const usedCells = new Set<number>();
    for (const eq of cellEqRemain) { usedCells.add(eq.a); usedCells.add(eq.b); }
    const byValue = new Map<number, number[]>();
    for (let i = 0; i < 81; i++) {
      const arr = byValue.get(sol[i]) ?? [];
      arr.push(i);
      byValue.set(sol[i], arr);
    }
    const cands: Array<{ a: number; b: number; d: number }> = [];
    for (const cells of byValue.values()) {
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i], b = cells[j];
          if (isPeer(a, b)) continue;
          // 规则3：两格都给定值时等值约束无效，不补回
          if (givens && givens.has(a) && givens.has(b)) continue;
          // 棋盘距离 ≤ 1：对角相邻才补回，横跨多格的不补（需求3）
          const dra = Math.abs(Math.floor(a / 9) - Math.floor(b / 9));
          const dca = Math.abs((a % 9) - (b % 9));
          const boardDist = Math.max(dra, dca);
          if (boardDist > 1) continue;
          const d = dra + dca;
          cands.push({ a, b, d });
        }
      }
    }
    cands.sort((x, y) => x.d - y.d);
    // 占用位置 = 所有已保留符号 + 标签
    const occupied: Array<{ r: number; c: number }> = [];
    for (const lc of labelCells) occupied.push({ r: Math.floor(lc / 9), c: lc % 9 });
    for (const ii of cellIneqRemain) occupied.push(cellPairMidpoint(ii.a, ii.b));
    for (const ci of cageIneqRemain) {
      const ca = cageById.get(ci.a), cb = cageById.get(ci.b);
      if (!ca || !cb) continue;
      const ep = pickCageEndpoints(ca, cb, cellIneqRemain);
      if (!ep) continue;
      let m = cageEndpointMidpoint(ep);
      if (ep.conflict) {
        const ar = Math.floor(ep.a / 9), ac = ep.a % 9, br = Math.floor(ep.b / 9), bc = ep.b % 9;
        const dx = bc - ac, dy = br - ar, len = Math.hypot(dx, dy) || 1;
        const nx = -(dy / len), ny = dx / len;
        m = { r: m.r + ny * 0.35, c: m.c + nx * 0.35 };
      }
      occupied.push(m);
    }
    for (const eq of cellEqRemain) occupied.push(cellPairMidpoint(eq.a, eq.b));
    for (const eq of cageEqRemain) {
      const ca = cageById.get(eq.a), cb = cageById.get(eq.b);
      if (!ca || !cb) continue;
      const ep = pickCageEndpoints(ca, cb, cellIneqRemain);
      if (!ep) continue;
      let m = cageEndpointMidpoint(ep);
      if (ep.conflict) {
        const ar = Math.floor(ep.a / 9), ac = ep.a % 9, br = Math.floor(ep.b / 9), bc = ep.b % 9;
        const dx = bc - ac, dy = br - ar, len = Math.hypot(dx, dy) || 1;
        const nx = -(dy / len), ny = dx / len;
        m = { r: m.r + ny * 0.35, c: m.c + nx * 0.35 };
      }
      occupied.push(m);
    }
    for (const { a, b } of cands) {
      if (cellEqRemain.length >= target.cellEq) break;
      if (usedCells.has(a) || usedCells.has(b)) continue;
      const mid = cellPairMidpoint(a, b);
      if (labelCells.has(midCellIdx(mid))) continue;
      if (tooClose(mid, occupied)) continue;
      usedCells.add(a); usedCells.add(b);
      occupied.push(mid);
      cellEqRemain.push({ a, b });
    }
  }

  // cageEq 补回：重扫相邻隐藏笼对
  if (cageEqRemain.length < target.cageEq) {
    const cageIneqKeys = new Set(
      cageIneqRemain.map((ci) => (ci.a < ci.b ? `${ci.a}-${ci.b}` : `${ci.b}-${ci.a}`)),
    );
    const usedCages = new Set<number>();
    for (const eq of cageEqRemain) { usedCages.add(eq.a); usedCages.add(eq.b); }
    const occupied: Array<{ r: number; c: number }> = [];
    for (const lc of labelCells) occupied.push({ r: Math.floor(lc / 9), c: lc % 9 });
    for (const ii of cellIneqRemain) occupied.push(cellPairMidpoint(ii.a, ii.b));
    for (const ci of cageIneqRemain) {
      const ca = cageById.get(ci.a), cb = cageById.get(ci.b);
      if (!ca || !cb) continue;
      const ep = pickCageEndpoints(ca, cb, cellIneqRemain);
      if (!ep) continue;
      let m = cageEndpointMidpoint(ep);
      if (ep.conflict) {
        const ar = Math.floor(ep.a / 9), ac = ep.a % 9, br = Math.floor(ep.b / 9), bc = ep.b % 9;
        const dx = bc - ac, dy = br - ar, len = Math.hypot(dx, dy) || 1;
        const nx = -(dy / len), ny = dx / len;
        m = { r: m.r + ny * 0.35, c: m.c + nx * 0.35 };
      }
      occupied.push(m);
    }
    for (const eq of cellEqRemain) occupied.push(cellPairMidpoint(eq.a, eq.b));
    for (const eq of cageEqRemain) {
      const ca = cageById.get(eq.a), cb = cageById.get(eq.b);
      if (!ca || !cb) continue;
      const ep = pickCageEndpoints(ca, cb, cellIneqRemain);
      if (!ep) continue;
      let m = cageEndpointMidpoint(ep);
      if (ep.conflict) {
        const ar = Math.floor(ep.a / 9), ac = ep.a % 9, br = Math.floor(ep.b / 9), bc = ep.b % 9;
        const dx = bc - ac, dy = br - ar, len = Math.hypot(dx, dy) || 1;
        const nx = -(dy / len), ny = dx / len;
        m = { r: m.r + ny * 0.35, c: m.c + nx * 0.35 };
      }
      occupied.push(m);
    }
    const hiddenCages = cages.filter((c) => c.sum === null);
    const pairs = findAdjacentCagePairs(hiddenCages);
    shuffleInPlace(pairs, rng);
    for (const [a, b] of pairs) {
      if (cageEqRemain.length >= target.cageEq) break;
      if (usedCages.has(a.id) || usedCages.has(b.id)) continue;
      const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      if (cageIneqKeys.has(key)) continue;
      const sa = a.cells.reduce((s, i) => s + sol[i], 0);
      const sb = b.cells.reduce((s, i) => s + sol[i], 0);
      if (sa !== sb) continue;
      const ep = pickCageEndpoints(a, b, cellIneqRemain);
      if (!ep || ep.conflict) continue;
      const mid = cageEndpointMidpoint(ep);
      if (labelCells.has(midCellIdx(mid))) continue;
      if (tooClose(mid, occupied)) continue;
      usedCages.add(a.id); usedCages.add(b.id);
      occupied.push(mid);
      cageEqRemain.push({ a: a.id, b: b.id });
    }
  }

  return {
    cellIneq: cellIneqRemain,
    cageIneq: cageIneqRemain,
    cellEq: cellEqRemain,
    cageEq: cageEqRemain,
    removed: {
      cellIneq: Math.max(0, origSizes.cellIneq - cellIneqRemain.length),
      cageIneq: Math.max(0, origSizes.cageIneq - cageIneqRemain.length),
      cellEq: Math.max(0, origSizes.cellEq - cellEqRemain.length),
      cageEq: Math.max(0, origSizes.cageEq - cageEqRemain.length),
    },
  };
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
  //   限制：棋盘距离必须 = 1（对角相邻）——直线相邻必然 peer 被 isPeer 排除；
  //   横跨多格的等值连线会遮挡候选数视野，全部不撒（需求3）
  const cands: Array<{ a: number; b: number; d: number }> = [];
  for (const cells of byValue.values()) {
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i];
        const b = cells[j];
        if (isPeer(a, b)) continue;
        const dra = Math.abs(Math.floor(a / 9) - Math.floor(b / 9));
        const dca = Math.abs((a % 9) - (b % 9));
        const boardDist = Math.max(dra, dca);
        if (boardDist > 1) continue; // 横跨多格的等值约束直接排除
        const d = dra + dca; // 曼哈顿距离仅用于排序
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
