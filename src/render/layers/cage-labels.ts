import type { RenderLayer } from './types';
import { cellRect } from '../view';

// 笼标签层：仅显示有和值的笼的和值
//   隐藏和值笼（sum=null，参与大小约束）不显示任何标签（需求3）
export const cageLabels: RenderLayer = {
  name: 'cage-labels',
  draw(ctx, view, theme) {
    const { puzzle } = view;
    const labelW = 22;
    const labelH = 16;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const cage of puzzle.cages) {
      // 隐藏和值笼不显示标签
      if (cage.sum === null) continue;
      // 找笼子左上角格（行最小→列最小）
      let minIdx = cage.cells[0];
      for (const idx of cage.cells) {
        if (Math.floor(idx / 9) < Math.floor(minIdx / 9) ||
            (Math.floor(idx / 9) === Math.floor(minIdx / 9) && idx % 9 < minIdx % 9)) {
          minIdx = idx;
        }
      }
      const rect = cellRect(view, minIdx);
      const lx = rect.x + 2;
      const ly = rect.y + 2;
      // 底色 + 和值文字
      ctx.fillStyle = theme.cageLabelBg;
      ctx.fillRect(lx, ly, labelW, labelH);
      ctx.fillStyle = theme.cageLabelFg;
      ctx.fillText(`${cage.sum}`, lx + labelW / 2, ly + labelH / 2 + 0.5);
    }
  },
};
