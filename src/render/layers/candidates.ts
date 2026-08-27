import type { RenderLayer } from './types';
import { cellRect } from '../view';

// 候选数层：每格内 3×3 小字布局，1~9 各占一宫
//   需求2 后：有值格子也可保留候选（输入不同数字转候选），故移除"有值不画"限制
//   样式改进：候选位置向格中心收缩 30%（远离笼和值角标），字号调大、颜色调深
export const candidates: RenderLayer = {
  name: 'candidates',
  draw(ctx, view, theme) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 81; i++) {
      const cell = view.cells[i];
      if (cell.userCands.size === 0) continue;
      const rect = cellRect(view, i);
      const sub = view.cellSize / 3;
      const hasValue = cell.value !== 0;
      // 字号调大（0.18→0.22 / 有值 0.14→0.18），下限 10，保证可读性
      const fontPx = Math.max(
        10,
        Math.floor(view.cellSize * (hasValue ? 0.18 : 0.22)),
      );
      ctx.font = `${fontPx}px sans-serif`;
      // 有值时候选仍需避让中央大数字，用半透明区分
      ctx.fillStyle = hasValue ? theme.candidate + 'b3' : theme.candidate;
      // 格中心坐标：候选整体向中心收缩，避免压住左上角笼和值标签
      const cx = rect.x + view.cellSize / 2;
      const cy = rect.y + view.cellSize / 2;
      for (let v = 1; v <= 9; v++) {
        if (!cell.userCands.has(v)) continue;
        const sr = Math.floor((v - 1) / 3);
        const sc = (v - 1) % 3;
        // 原位置为 3×3 宫中心，向格中心收缩 30%（0.7 倍：进一步远离左上角和值标签）
        const gx = rect.x + sub * (sc + 0.5);
        const gy = rect.y + sub * (sr + 0.5);
        const x = cx + (gx - cx) * 0.7;
        const y = cy + (gy - cy) * 0.7;
        ctx.fillText(String(v), x, y + 0.5);
      }
    }
  },
};
