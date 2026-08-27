import type { RenderLayer } from './types';
import type { View } from '../view';
import { cellRect } from '../view';
import type { CellInequality, CageInequality } from '@/types/constraint';
import type { Cage } from '@/types/cage';

// 大小约束层：分别绘制格间（实心黑三角贴格子边）与笼间（空心橙三角笼外+虚线引导）
//   视觉三重区分：颜色 / 形状 / 位置
export const inequalities: RenderLayer = {
  name: 'inequalities',
  draw(ctx, view, theme) {
    const { puzzle } = view;
    // 笼间引导虚线（先画，避免被三角覆盖）
    ctx.strokeStyle = theme.cageIneqGuide;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    for (const ci of puzzle.cageIneq) {
      drawCageIneqGuide(ctx, view, puzzle.cages, ci);
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
      drawCageIneqTriangle(ctx, view, puzzle.cages, ci);
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
    // rel '>' 表示 a > b，三角指向 b（较小值）
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

// 笼间引导虚线：连接两笼最近格的中心
function drawCageIneqGuide(
  ctx: CanvasRenderingContext2D,
  view: View,
  cages: Cage[],
  ci: CageInequality,
) {
  const cageA = cages.find((c) => c.id === ci.a);
  const cageB = cages.find((c) => c.id === ci.b);
  if (!cageA || !cageB) return;
  // 找最近格对
  let best: { a: number; b: number; dist: number } | null = null;
  for (const a of cageA.cells) {
    for (const b of cageB.cells) {
      const d = Math.abs(a - b);
      if (!best || d < best.dist) best = { a, b, dist: d };
    }
  }
  if (!best) return;
  const ra = cellRect(view, best.a);
  const rb = cellRect(view, best.b);
  ctx.beginPath();
  ctx.moveTo(ra.x + ra.w / 2, ra.y + ra.h / 2);
  ctx.lineTo(rb.x + rb.w / 2, rb.y + rb.h / 2);
  ctx.stroke();
}

// 笼间大小符号：在引导线中点画空心三角，箭头指向"较小和值"笼
function drawCageIneqTriangle(
  ctx: CanvasRenderingContext2D,
  view: View,
  cages: Cage[],
  ci: CageInequality,
) {
  const cageA = cages.find((c) => c.id === ci.a);
  const cageB = cages.find((c) => c.id === ci.b);
  if (!cageA || !cageB) return;
  let best: { a: number; b: number; dist: number } | null = null;
  for (const a of cageA.cells) {
    for (const b of cageB.cells) {
      const d = Math.abs(a - b);
      if (!best || d < best.dist) best = { a, b, dist: d };
    }
  }
  if (!best) return;
  const ra = cellRect(view, best.a);
  const rb = cellRect(view, best.b);
  const ax = ra.x + ra.w / 2;
  const ay = ra.y + ra.h / 2;
  const bx = rb.x + rb.w / 2;
  const by = rb.y + rb.h / 2;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  // 方向向量从 A 指向 B
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // rel '>' 表示 A 和 > B 和，三角指向 B（从 A 看，箭头朝 B 方向）
  const sign = ci.rel === '>' ? 1 : -1; // '>' 时三角指向 B；'<' 时反向（指向 A）
  // 三角尺寸随格子大小缩放，最小值保证醒目
  const tip = Math.max(12, view.cellSize * 0.22);
  const base = Math.max(6, view.cellSize * 0.11);
  const half = Math.max(9, view.cellSize * 0.16);
  // 三角顶点
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
