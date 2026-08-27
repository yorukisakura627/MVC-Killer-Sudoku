import type { RenderLayer } from './types';
import { cellRect } from '../view';

// 笼标签层：仅显示有和值的笼的和值
//   隐藏和值笼（sum=null，参与大小约束）不显示任何标签（需求3）
//   样式改进：去掉底色块，和值直接嵌在笼左上角的边框线上——
//   先用表格底色画小挖空块"盖住"边框线（覆盖效果），再在上面绘制数字
export const cageLabels: RenderLayer = {
  name: 'cage-labels',
  draw(ctx, view, theme) {
    const { puzzle } = view;
    ctx.font = 'bold 12px sans-serif';
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
      // 数字中心贴住格子左上角（略向内偏移，横跨两条边框线的交点）
      const cx = rect.x + 1;
      const cy = rect.y + 1;
      // 挖空块：表格底色小矩形盖住边框线，让数字"嵌"在框上而非压在色块里
      ctx.fillStyle = theme.bg;
      ctx.fillRect(cx - 9, cy - 7, 18, 14);
      ctx.fillStyle = theme.cageLabelFg;
      ctx.fillText(`${cage.sum}`, cx, cy + 0.5);
    }
  },
};
