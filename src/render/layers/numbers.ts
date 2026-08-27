import type { RenderLayer } from './types';
import { cellRect } from '../view';

// 数字层：给定数（黑粗体）/ 用户输入（蓝）
//   冲突格用红色描边脉冲（由 highlights 层处理底色，本层只画文字）
export const numbers: RenderLayer = {
  name: 'numbers',
  draw(ctx, view, theme) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontPx = Math.floor(view.cellSize * 0.5);
    for (let i = 0; i < 81; i++) {
      const cell = view.cells[i];
      if (cell.value === 0) continue;
      const rect = cellRect(view, i);
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2 + 1;
      if (cell.isGiven) {
        ctx.fillStyle = theme.givenNumber;
        ctx.font = `bold ${fontPx}px sans-serif`;
      } else {
        ctx.fillStyle = theme.userInput;
        ctx.font = `500 ${fontPx}px sans-serif`;
      }
      ctx.fillText(String(cell.value), cx, cy);
    }
  },
};
