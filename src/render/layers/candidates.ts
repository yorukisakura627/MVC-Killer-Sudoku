import type { RenderLayer } from './types';
import { cellRect } from '../view';

// 候选数层：每格内 3×3 小字布局，1~9 各占一宫
//   需求2 后：有值格子也可保留候选（输入不同数字转候选），故移除"有值不画"限制
//   有值时候选字号更小且半透明，避免与中央大数字冲突；大数字层在上会覆盖中央候选
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
      // 有值时候选更小、更淡，置于四角避开中央大数字
      const fontPx = Math.max(
        8,
        Math.floor(view.cellSize * (hasValue ? 0.14 : 0.18)),
      );
      ctx.font = `${fontPx}px sans-serif`;
      ctx.fillStyle = hasValue ? theme.candidate + '99' : theme.candidate;
      for (let v = 1; v <= 9; v++) {
        if (!cell.userCands.has(v)) continue;
        const sr = Math.floor((v - 1) / 3);
        const sc = (v - 1) % 3;
        const x = rect.x + sub * (sc + 0.5);
        const y = rect.y + sub * (sr + 0.5);
        ctx.fillText(String(v), x, y + 0.5);
      }
    }
  },
};
