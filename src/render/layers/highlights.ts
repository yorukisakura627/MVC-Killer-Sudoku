import type { RenderLayer } from './types';
import { cellRect, getPeers, cageOfCell } from '../view';

// 高亮层：选中、peer（同行/列/宫）、相同数字、同笼、冲突、提示
//   绘制顺序在网格线之上、笼边/笼标签/大小符号之下，避免遮挡关键约束提示
//   所有填充色追加 2 位 hex alpha（~0.16）以保证足够淡，不喧宾夺主
export const highlights: RenderLayer = {
  name: 'highlights',
  draw(ctx, view, theme) {
    const sel = view.selected;
    // 多选集合：优先用 selectedSet，否则单选
    const selSet = view.selectedSet.size > 0 ? view.selectedSet : (sel >= 0 ? new Set([sel]) : new Set<number>());
    if (selSet.size === 0 && view.hintTarget < 0) return;

    // 1. 提示格：绿色边框脉冲
    if (view.hintTarget >= 0) {
      const rect = cellRect(view, view.hintTarget);
      ctx.fillStyle = theme.highlightHint + '30'; // 半透明
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    if (selSet.size === 0) return;
    const selArr = Array.from(selSet);
    const selCell = view.cells[sel];

    // 2. peer 高亮：淡黄（行/列/宫），多选时合并所有 peer
    const peers = new Set<number>();
    for (const s of selArr) for (const p of getPeers(s)) peers.add(p);
    // 多选时 peer 中可能含已选格，排除
    for (const s of selSet) peers.delete(s);
    ctx.fillStyle = theme.highlightPeer + '55';
    for (const p of peers) {
      const rect = cellRect(view, p);
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    // 3. 同笼高亮：淡橙（仅主选中格的笼，避免多选时笼高亮混乱）
    const cage = sel >= 0 ? cageOfCell(view.puzzle, sel) : undefined;
    if (cage) {
      ctx.fillStyle = theme.highlightCage + '55';
      for (const idx of cage.cells) {
        if (selSet.has(idx)) continue;
        const rect = cellRect(view, idx);
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
    }

    // 4. 相同数字高亮：淡蓝（仅主选中格有值时）
    if (selCell && selCell.value !== 0) {
      ctx.fillStyle = theme.highlightSameValue + '40';
      for (let i = 0; i < 81; i++) {
        if (selSet.has(i)) continue;
        if (view.cells[i].value === selCell.value) {
          const rect = cellRect(view, i);
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }
      }
    }

    // 5. 选中格：蓝色填充（深于相同数字的淡蓝），与 peer 黄色明显区分
    //   不画边框，仅靠底色区分（需求2）
    ctx.fillStyle = theme.highlightSameValue + '99';
    for (const s of selSet) {
      const rect = cellRect(view, s);
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    // 6. 冲突格描红边
    ctx.strokeStyle = theme.highlightConflict;
    ctx.lineWidth = 3;
    for (let i = 0; i < 81; i++) {
      if (!view.cells[i].conflict) continue;
      const r = cellRect(view, i);
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
  },
};
