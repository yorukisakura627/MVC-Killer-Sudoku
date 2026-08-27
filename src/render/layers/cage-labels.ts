import type { RenderLayer } from './types';
import { cellRect } from '../view';

// 笼标签层：仅显示有和值的笼的和值
//   隐藏和值笼（sum=null，参与大小约束）不显示任何标签（需求3）
//   样式：白底黑字小标签（需求修订：此前"去底色嵌边框"后白字叠白底不可读），
//   白底块带浅灰细描边保证与表格背景区分；位置从笼左上格的左上角
//   向笼体延伸方向（右/下邻格属于该笼）微移，让标签更"贴近"它所属的笼
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
      const cellSet = new Set(cage.cells);
      const rect = cellRect(view, minIdx);
      // 向笼体方向偏移：右邻格属于笼则右移，下邻格属于笼则下移，
      // 使标签贴近笼的延伸部分，便于辨认该和值属于哪个笼
      const dx = cellSet.has(minIdx + 1) && minIdx % 9 < 8 ? 5 : 0;
      const dy = cellSet.has(minIdx + 9) && Math.floor(minIdx / 9) < 8 ? 5 : 0;
      const cx = rect.x + 1 + dx;
      const cy = rect.y + 1 + dy;
      // 白底块：先画白色小矩形（盖住边框线交叉处），再画浅灰描边与黑色数字
      ctx.fillStyle = theme.cageLabelBg; // 纯白底（theme 中定义）
      ctx.fillRect(cx - 9, cy - 7, 18, 14);
      ctx.strokeStyle = theme.cageLabelBorder; // 中灰描边：让白底小方块轮廓清晰可辨
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 9, cy - 7, 18, 14);
      ctx.fillStyle = theme.cageLabelFg; // 黑字
      ctx.fillText(`${cage.sum}`, cx, cy + 0.5);
    }
  },
};
