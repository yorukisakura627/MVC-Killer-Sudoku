import type { RenderLayer } from './types';
import { cellRect } from '../view';

// 笼标签层：仅显示有和值的笼的和值
//   隐藏和值笼（sum=null，参与大小/等值约束）不显示任何标签
//   样式：白底黑字小标签，无描边（白底直接叠在浅色网格上已足够清晰）
//   位置：白底块从笼左上格左上角内移 2px（仍盖住笼边框虚线、不盖宫/格实线边框），整齐统一
export const cageLabels: RenderLayer = {
  name: 'cage-labels',
  draw(ctx, view, theme) {
    const { puzzle } = view;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 白底块尺寸：固定 18×14
    const labelW = 18;
    const labelH = 14;
    // 内移 2px：遮住笼虚线边框，但不会覆盖宫/格边框（2px 留出边框线的位置）
    const inset = 2;

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
      // 内移 2px：底框仍在笼边框虚线内侧，盖住笼虚线但不盖宫/格实线边框
      ctx.fillStyle = theme.cageLabelBg; // 纯白底
      ctx.fillRect(rect.x + inset, rect.y + inset, labelW, labelH);
      // 黑字画在白底块中心
      ctx.fillStyle = theme.cageLabelFg;
      ctx.fillText(`${cage.sum}`, rect.x + inset + labelW / 2, rect.y + inset + labelH / 2 + 0.5);
    }
  },
};
