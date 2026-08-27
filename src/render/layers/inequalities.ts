import type { RenderLayer } from './types';
import type { View } from '../view';
import { cellRect } from '../view';
import type { CellInequality, CageInequality } from '@/types/constraint';
import type { Cage } from '@/types/cage';

// 大小约束层：分别绘制格间（实心深蓝三角贴格子边）与笼间（空心橙三角+虚线引导）
//   视觉三重区分：颜色 / 形状 / 位置
//   为避免笼间箭头（金色/橙色）与格间箭头（蓝色）位置重合：
//     1. 笼间选两笼的格对时，优先挑"不与现有格间大小约束共享同一条边"的端点
//     2. 若所有候选对都冲突（极端，如两单格笼相邻且有 cellIneq），沿引导线法向偏移三角
export const inequalities: RenderLayer = {
  name: 'inequalities',
  draw(ctx, view, theme) {
    const { puzzle } = view;
    // 笼间引导虚线（先画，避免被三角覆盖）
    ctx.strokeStyle = theme.cageIneqGuide;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    for (const ci of puzzle.cageIneq) {
      drawCageIneqGuide(ctx, view, puzzle.cages, ci, puzzle.cellIneq);
    }
    ctx.setLineDash([]);

    // 格间大小：实心三角，深蓝
    ctx.fillStyle = theme.cellIneq;
    for (const ii of puzzle.cellIneq) {
      drawCellIneq(ctx, view, ii);
    }

    // 笼间大小：空心三角，橙
    ctx.strokeStyle = theme.cageIneq;
    ctx.fillStyle = theme.cageIneq;
    ctx.lineWidth = 2;
    for (const ci of puzzle.cageIneq) {
      drawCageIneqTriangle(ctx, view, puzzle.cages, ci, puzzle.cellIneq);
    }
  },
};

// 格间大小符号：在两格共享边中央画实心三角，箭头指向"较小"一侧
//   size 随格子尺寸缩放，最小 9，保证视觉醒目
function drawCellIneq(ctx: CanvasRenderingContext2D, view: View, ii: CellInequality) {
  const ra = Math.floor(ii.a / 9);
  const ca = ii.a % 9;
  const rb = Math.floor(ii.b / 9);
  const cb = ii.b % 9;
  const aRect = cellRect(view, ii.a);
  const bRect = cellRect(view, ii.b);
  const size = Math.max(9, Math.floor(view.cellSize * 0.18));
  // 同行 → 垂直边；同列 → 水平边
  if (ra === rb) {
    // 横向相邻，符号在中间垂直边上
    const x = (aRect.x + bRect.x + view.cellSize) / 2; // 共享边 x
    const y = aRect.y + view.cellSize / 2;
    const dir = ii.rel === '>' ? (ca < cb ? 1 : -1) : ca < cb ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x + dir * size, y);
    ctx.closePath();
    ctx.fill();
  } else if (ca === cb) {
    // 纵向相邻，符号在中间水平边上
    const x = aRect.x + view.cellSize / 2;
    const y = (aRect.y + bRect.y + view.cellSize) / 2;
    const dir = ii.rel === '>' ? (ra < rb ? 1 : -1) : ra < rb ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + dir * size);
    ctx.closePath();
    ctx.fill();
  }
}

// 判断 (a,b) 两格是否 4 邻且恰好是某条 cellIneq 的对应格对（位置冲突）
function cellIneqUsesPair(cellIneqList: CellInequality[], a: number, b: number): boolean {
  for (const ii of cellIneqList) {
    if ((ii.a === a && ii.b === b) || (ii.a === b && ii.b === a)) return true;
  }
  return false;
}

// 为笼间约束选取一对端点（来自 A 笼一单元格、B 笼一单元格）
//   优先"距离最近且不与格间大小约束的两格完全重合"；
//   若所有候选都与 cellIneq 冲突（极端），则 fallback 取最近的，并返回 conflict=true 供绘制层偏移
function pickCageEndpoints(
  cageA: Cage,
  cageB: Cage,
  cellIneqList: CellInequality[],
): { a: number; b: number; conflict: boolean } | null {
  // 候选：{a, b, dist, conflict}
  type Cand = { a: number; b: number; dist: number; conflict: boolean };
  const cands: Cand[] = [];
  for (const a of cageA.cells) {
    for (const b of cageB.cells) {
      const ar = Math.floor(a / 9), ac = a % 9;
      const br = Math.floor(b / 9), bc = b % 9;
      const manhattan = Math.abs(ar - br) + Math.abs(ac - bc);
      // 4 邻且共享 cellIneq 边 → 冲突
      const adj4 = manhattan === 1;
      const conflict = adj4 && cellIneqUsesPair(cellIneqList, a, b);
      cands.push({ a, b, dist: manhattan, conflict });
    }
  }
  if (cands.length === 0) return null;
  // 排序：先冲突升序（false 在前），再距离升序
  cands.sort((x, y) => {
    if (x.conflict !== y.conflict) return x.conflict ? 1 : -1;
    return x.dist - y.dist;
  });
  const best = cands[0];
  return { a: best.a, b: best.b, conflict: best.conflict };
}

// 笼间引导虚线：连接两笼选定端点的中心
function drawCageIneqGuide(
  ctx: CanvasRenderingContext2D,
  view: View,
  cages: Cage[],
  ci: CageInequality,
  cellIneqList: CellInequality[],
) {
  const cageA = cages.find((c) => c.id === ci.a);
  const cageB = cages.find((c) => c.id === ci.b);
  if (!cageA || !cageB) return;
  const ep = pickCageEndpoints(cageA, cageB, cellIneqList);
  if (!ep) return;
  const ra = cellRect(view, ep.a);
  const rb = cellRect(view, ep.b);
  ctx.beginPath();
  ctx.moveTo(ra.x + ra.w / 2, ra.y + ra.h / 2);
  ctx.lineTo(rb.x + rb.w / 2, rb.y + rb.h / 2);
  ctx.stroke();
}

// 笼间大小符号：在引导线中点画空心三角，箭头指向"较小和值"笼
//   若端点仍与格间约束冲突（无法换端点），则沿引导线法向偏移三角，避免完全重合
function drawCageIneqTriangle(
  ctx: CanvasRenderingContext2D,
  view: View,
  cages: Cage[],
  ci: CageInequality,
  cellIneqList: CellInequality[],
) {
  const cageA = cages.find((c) => c.id === ci.a);
  const cageB = cages.find((c) => c.id === ci.b);
  if (!cageA || !cageB) return;
  const ep = pickCageEndpoints(cageA, cageB, cellIneqList);
  if (!ep) return;
  const ra = cellRect(view, ep.a);
  const rb = cellRect(view, ep.b);
  let ax = ra.x + ra.w / 2;
  let ay = ra.y + ra.h / 2;
  let bx = rb.x + rb.w / 2;
  let by = rb.y + rb.h / 2;
  // 方向向量从 A 指向 B
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // 三角尺寸随格子大小缩放，最小值保证醒目
  const tip = Math.max(12, view.cellSize * 0.22);
  const base = Math.max(6, view.cellSize * 0.11);
  const half = Math.max(9, view.cellSize * 0.16);
  // 中点；冲突时做法向偏移，让三角错开蓝色箭头
  let mx = (ax + bx) / 2;
  let my = (ay + by) / 2;
  if (ep.conflict) {
    // 法向（垂直引导线）偏移 1/2 cell，相当于把三角移到边旁
    const nx = -uy;
    const ny = ux;
    const off = view.cellSize * 0.35;
    mx += nx * off;
    my += ny * off;
  }
  // rel '>' 表示 A 和 > B 和，三角指向 B（从 A 看，箭头朝 B 方向）
  const sign = ci.rel === '>' ? 1 : -1;
  const tipX = mx + sign * ux * tip;
  const tipY = my + sign * uy * tip;
  const baseX = mx - sign * ux * base;
  const baseY = my - sign * uy * base;
  // 垂直于方向的基线
  const px = -uy;
  const py = ux;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + px * half, baseY + py * half);
  ctx.lineTo(baseX - px * half, baseY - py * half);
  ctx.closePath();
  ctx.stroke();
}
