import type { GameStore } from '@/state/game-store';
import type { Difficulty, Puzzle } from '@/types/puzzle';
import {
  getPuzzleList,
  getGlobalNumber,
  formatPuzzleNo,
} from '@/puzzle-loader';
import { formatTime } from './hud';

// 模态对话框：完成动画 + 用时记录 + 加载提示
//   纯 DOM 实现，不依赖第三方库

export function showCompletionModal(store: GameStore, onNext: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="overlay-content">
      <h2>🎉 完成！</h2>
      <p>难度：${diffLabel(store.getDifficulty())}（评分 ${store.getRating()}）</p>
      <div class="big-time">${formatTime(store.elapsedMs)}</div>
      <button data-act="next">下一题</button>
      <button data-act="close" class="secondary">关闭</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-act="next"]')!.addEventListener('click', () => {
    overlay.remove();
    onNext();
  });
  overlay.querySelector('[data-act="close"]')!.addEventListener('click', () => overlay.remove());
}

export function showLoadingOverlay(message: string): { update: (m: string) => void; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="overlay-content">
      <div class="spinner"></div>
      <p data-el="msg">${message}</p>
    </div>
  `;
  document.body.appendChild(overlay);
  return {
    update: (m: string) => {
      const el = overlay.querySelector('[data-el="msg"]') as HTMLElement;
      if (el) el.textContent = m;
    },
    close: () => overlay.remove(),
  };
}

export function showErrorOverlay(message: string, onRetry?: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="overlay-content">
      <h2>错误</h2>
      <p>${message}</p>
      ${onRetry ? '<button data-act="retry">重试</button>' : ''}
      <button data-act="close" class="secondary">关闭</button>
    </div>
  `;
  document.body.appendChild(overlay);
  if (onRetry) {
    overlay.querySelector('[data-act="retry"]')!.addEventListener('click', () => {
      overlay.remove();
      onRetry();
    });
  }
  overlay.querySelector('[data-act="close"]')!.addEventListener('click', () => overlay.remove());
}

function diffLabel(diff: string): string {
  return diff === 'easy' ? '简单' : diff === 'normal' ? '普通' : '困难';
}

// 暂停遮罩：覆盖数独表格本体（不覆盖整页），用表格底色
//   元素由外部 append 到 Canvas 容器（position:relative 的父级）
//   点击遮罩 → 触发 onContinue 恢复游戏
export class PauseOverlay {
  el: HTMLDivElement;
  constructor(onContinue: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'pause-overlay';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="pause-content">
        <div class="pause-icon">⏸</div>
        <h2>已暂停</h2>
        <p>点击此处或按"暂停"按钮继续</p>
      </div>
    `;
    this.el.addEventListener('click', () => onContinue());
  }
  show(): void { this.el.hidden = false; }
  hide(): void { this.el.hidden = true; }
}

// 帮助弹窗（需求1）：版权、项目简介、玩法、功能介绍
export function showHelpOverlay(): void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="overlay-content help-content">
      <h2>杀手数独 · 大小约束</h2>
      <p class="help-copy">© 2026 Killer Sudoku with Inequalities · 版权所有</p>
      <h3>项目简介</h3>
      <p>一款融合 Killer 笼和值与相邻格/笼大小约束的数独变体。每局保证唯一解且可纯逻辑推导，分简单/普通/困难三档难度，难度越高可用信息越少。</p>
      <h3>玩法</h3>
      <ul>
        <li>在 9×9 格内填入 1~9，使每行、每列、每个 3×3 宫不重复。</li>
        <li>Killer 笼：虚线框内数字之和等于左上角标注的和值，且笼内数字不重复。</li>
        <li>格间大小约束：相邻格间的小三角（＞/＜）表示两侧数字大小关系。</li>
        <li>笼间大小约束：参与大小关系的笼不显示和值，需通过 45 法则或邻接推理得到。</li>
        <li>每个格子必填且仅填一个 1~9 的数字。</li>
      </ul>
      <h3>功能介绍</h3>
      <ul>
        <li>鼠标点击选格、按住拖动多选批量填数。</li>
        <li>候选模式：在已填数字的格子输入不同数字会转为候选；候选可逐个标记/删除。</li>
        <li>数字键盘：1-9 填数、擦除、撤销、重做（重做本题）、候选模式切换。</li>
        <li>提示（简单5/普通3/困难1 次）：随机填一个空格的正确答案，可被更改，撤销不恢复次数。</li>
        <li>检查：高亮当前冲突的格子。</li>
        <li>暂停：空格键或暂停按钮，遮罩表格防偷看。</li>
        <li>题目选择弹窗：按难度浏览全部题目并跳转。</li>
      </ul>
      <button data-act="close">关闭</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-act="close"]')!.addEventListener('click', () => overlay.remove());
}

// 题目选择弹窗（需求3）：各难度所有题，每行 5 个，按钮显示全局序号
//   onPick(diff, idx) 选中后加载该题
export function showPuzzlePicker(onPick: (diff: Difficulty, idx: number) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
  const labels: Record<Difficulty, string> = { easy: '简单', normal: '普通', hard: '困难' };
  let html = '<div class="overlay-content picker-content"><h2>题目选择</h2>';
  for (const d of diffs) {
    const list = getPuzzleList(d);
    html += `<div class="picker-diff"><div class="picker-diff-label">${labels[d]}（${list.length} 题）</div><div class="picker-grid">`;
    list.forEach((_: Puzzle, i: number) => {
      const no = formatPuzzleNo(getGlobalNumber(d, i));
      html += `<button class="picker-btn" data-diff="${d}" data-idx="${i}">${no}</button>`;
    });
    html += '</div></div>';
  }
  html += '<button data-act="close" class="secondary">关闭</button></div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('.picker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = (btn as HTMLElement).dataset.diff as Difficulty;
      const i = Number((btn as HTMLElement).dataset.idx);
      overlay.remove();
      onPick(d, i);
    });
  });
  overlay.querySelector('[data-act="close"]')!.addEventListener('click', () => overlay.remove());
}
