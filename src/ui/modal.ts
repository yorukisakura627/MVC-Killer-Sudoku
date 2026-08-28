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

// 四档难度标签（弹窗与题库导航共用）
export const DIFF_LABELS: Record<Difficulty, string> = {
  easy: '简单', normal: '普通', hard: '困难', expert: '专家',
};

function diffLabel(diff: string): string {
  return DIFF_LABELS[diff as Difficulty] ?? diff;
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
      <h2>杀手数独 · 大小与等值约束</h2>
      <p class="help-copy">© 2026 <a href="https://github.com/yorukisakura627" target="_blank" rel="noopener noreferrer" style="color:#1e40af;text-decoration:underline">sakura_yoruki</a> · Killer Sudoku with Inequalities · 版权所有</p>
      <h3>项目简介</h3>
      <p>一款融合 Killer 笼和值与相邻格/笼大小、等值约束的数独变体。每局保证唯一解且可纯逻辑推导，分简单/普通/困难/专家四档难度，难度越高可用信息越少。</p>
      <h3>玩法</h3>
      <ul>
        <li>在 9×9 格内填入 1~9，使每行、每列、每个 3×3 宫不重复。</li>
        <li>Killer 笼：虚线框内数字之和等于左上角<span style="background:#fff;color:#111827;font-weight:bold;padding:0 3px;border-radius:2px">白底黑字</span>标注的和值，且笼内数字不重复。</li>
        <li>本作有两类额外约束，<b>看颜色分归属、看形状分含义</b>：
          <ul>
            <li><span style="color:#1e3a8a;font-weight:bold">深蓝色 = 格与格之间</span>：相邻两格共享边上的<span style="color:#1e3a8a;font-weight:bold">实心小三角（▶/◀）</span>表示大小关系，<b>尖角指向较小的一格</b>；两格间蓝色虚线连线中点的<span style="color:#1e3a8a;font-weight:bold">蓝色 "="</span> 表示两格填<b>相同数字</b>（两格必不同行/列/宫）。</li>
            <li><span style="color:#f59e0b;font-weight:bold">金色 = 笼与笼之间</span>：两笼间金色虚线上的<span style="color:#f59e0b;font-weight:bold">空心三角</span>表示两笼和值的大小关系，<b>尖角指向较小和值的笼</b>；虚线上的<span style="color:#f59e0b;font-weight:bold">金色 "="</span> 表示两笼<b>和值相等</b>。</li>
          </ul>
        </li>
        <li>参与笼间约束（大小或等值）的笼<b>不显示和值</b>，需通过 45 法则或邻接关系推理；其余笼左上角都标有和值。</li>
        <li>每个格子必填且仅填一个 1~9 的数字。</li>
      </ul>
      <h3>符号速查</h3>
      <ul>
        <li>深蓝实心三角（相邻格边上）：格间大小；金色空心三角（笼间虚线上）：笼间大小。尖角都指向<b>较小</b>一侧。</li>
        <li>蓝色 "="（两格连线中点）：两格数字相同；金色 "="（两笼间虚线上）：两笼和值相等。</li>
        <li>一句话记忆：<b>深蓝看格子，金色看笼子；三角比大小，等号表相同。</b></li>
      </ul>
      <h3>功能介绍</h3>
      <ul>
        <li>鼠标点击选格、按住拖动多选批量填数。</li>
        <li>候选模式：在已填数字的格子输入不同数字会转为候选；候选可逐个标记/删除。</li>
        <li>数字键盘：1-9 填数、擦除、撤销、重做（重做本题）、候选模式切换。</li>
        <li>提示（简单5/普通4/困难3/专家2 次）：随机填一个空格的正确答案，可被更改，撤销不恢复次数；按钮右上角红圈为剩余次数。</li>
        <li>检查：按数独规则校验当前所有已填数字（行列宫重复、笼和错误、大小/等值关系违反），标红违反的格子 2 秒。（未填值或约束两侧有空格时暂不判定。）</li>
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
  // 四档难度按顺序展示，全局序号跨难度连续
  const diffs: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];
  let html = '<div class="overlay-content picker-content"><h2>题目选择</h2>';
  for (const d of diffs) {
    const list = getPuzzleList(d);
    html += `<div class="picker-diff"><div class="picker-diff-label">${DIFF_LABELS[d]}（${list.length} 题）</div><div class="picker-grid">`;
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
