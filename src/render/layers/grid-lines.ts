import type { RenderLayer } from './types';

// 网格线层：9×9 细线 + 3×3 宫粗线
//   先画细线再画粗线，避免粗线被细线覆盖
export const gridLines: RenderLayer = {
  name: 'grid-lines',
  draw(ctx, view) {
    const { cellSize, origin } = view;
    const total = cellSize * 9;
    // 细线（每格）
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 9; i++) {
      const p = origin.x + i * cellSize;
      ctx.moveTo(p, origin.y);
      ctx.lineTo(p, origin.y + total);
      const q = origin.y + i * cellSize;
      ctx.moveTo(origin.x, q);
      ctx.lineTo(origin.x + total, q);
    }
    ctx.stroke();

    // 3×3 宫粗线（每 3 格）
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 9; i += 3) {
      const p = origin.x + i * cellSize;
      ctx.moveTo(p, origin.y);
      ctx.lineTo(p, origin.y + total);
      const q = origin.y + i * cellSize;
      ctx.moveTo(origin.x, q);
      ctx.lineTo(origin.x + total, q);
    }
    ctx.stroke();
  },
};
