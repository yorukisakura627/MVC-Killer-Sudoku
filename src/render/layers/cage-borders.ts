import type { RenderLayer } from './types';
import { cageOfCell } from '../view';

// 笼边层：粗虚线，深红色
//   算法：对每个笼，对笼内每个格子的四条边判断是否"对外"——
//   若邻居格不属于本笼（或在网格边界外），则该边画粗虚线
//   避免笼内边被重复绘制
export const cageBorders: RenderLayer = {
  name: 'cage-borders',
  draw(ctx, view, theme) {
    const { cellSize, origin, puzzle } = view;
    // 笼边加半透明（需求2）：红虚线太刺眼，叠 alpha 调淡
    ctx.strokeStyle = theme.cageBorder + '88';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    // 笼边内缩（需求3）：边线整体向格子内侧偏移 inset 像素，
    //   避免与相邻笼边或宫边重合，便于辨认
    const inset = Math.max(2, Math.floor(cellSize * 0.06));

    for (const cage of puzzle.cages) {
      for (const idx of cage.cells) {
        const r = Math.floor(idx / 9);
        const c = idx % 9;
        const x = origin.x + c * cellSize;
        const y = origin.y + r * cellSize;
        // 北边：内缩后 y+inset，长度不变保证同笼相邻格连续
        if (r === 0 || cageOfCell(puzzle, (r - 1) * 9 + c)?.id !== cage.id) {
          ctx.beginPath();
          ctx.moveTo(x, y + inset);
          ctx.lineTo(x + cellSize, y + inset);
          ctx.stroke();
        }
        // 南边
        if (r === 8 || cageOfCell(puzzle, (r + 1) * 9 + c)?.id !== cage.id) {
          ctx.beginPath();
          ctx.moveTo(x, y + cellSize - inset);
          ctx.lineTo(x + cellSize, y + cellSize - inset);
          ctx.stroke();
        }
        // 西边
        if (c === 0 || cageOfCell(puzzle, r * 9 + (c - 1))?.id !== cage.id) {
          ctx.beginPath();
          ctx.moveTo(x + inset, y);
          ctx.lineTo(x + inset, y + cellSize);
          ctx.stroke();
        }
        // 东边
        if (c === 8 || cageOfCell(puzzle, r * 9 + (c + 1))?.id !== cage.id) {
          ctx.beginPath();
          ctx.moveTo(x + cellSize - inset, y);
          ctx.lineTo(x + cellSize - inset, y + cellSize);
          ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);
  },
};
