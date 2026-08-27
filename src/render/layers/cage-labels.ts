import type { RenderLayer } from './types';
import { cellRect } from '../view';

// 笼标签层：仅显示有和值的笼的和值
//   隐藏和值笼（sum=null，参与大小/等值约束）不显示任何标签
//   样式：白底黑字小标签，无描边（白底直接叠在浅色网格上已足够清晰）
//   位置：白底块左上角与笼左上格的左上角精确对齐（上边/左边与笼边框线重合），
//   所有标签整齐统一地嵌在笼角上；不再向笼体方向偏移（偏移导致各标签参差不齐）
export const cageLabels: RenderLayer = {
  name: 'cage-labels',
  draw(ctx, view, theme) {
    const { puzzle } = view;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 白底块尺寸：固定 18×14，覆盖格子左上角的边框交叉区域
    const labelW = 18;
    const labelH = 14;

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
      // 白底块与笼边框对齐：原点 = 格子左上角，块边与边框线重合 → 整齐不突兀
      ctx.fillStyle = theme.cageLabelBg; // 纯白底
      ctx.fillRect(rect.x, rect.y, labelW, labelH);
      // 黑字画在白底块中心
      ctx.fillStyle = theme.cageLabelFg;
      ctx.fillText(`${cage.sum}`, rect.x + labelW / 2, rect.y + labelH / 2 + 0.5);
    }
  },
};
