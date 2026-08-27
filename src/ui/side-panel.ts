import type { Difficulty } from '@/types/puzzle';
import type { GameStore } from '@/state/game-store';
import { getPuzzleList, getGlobalNumber, formatPuzzleNo } from '@/puzzle-loader';
import { formatTime } from './hud';

// 左侧控制栏：计时+帮助 / 上一题·题目选择·下一题 / 难度切换
//   导航按钮在题库为空时禁用；难度切换高亮当前难度
export interface SidePanelCallbacks {
  onPrev: () => void; // 上一题（环形）
  onPick: () => void; // 题目选择（弹窗）
  onNext: () => void; // 下一题（环形）
  onNewGame: (diff: Difficulty) => void; // 难度切换
  onHelp: () => void; // 帮助弹窗
}

// 四档难度的统一顺序与标签（side-panel/modal/puzzle-loader 共用语义）
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];
const DIFF_LABELS: Record<Difficulty, string> = {
  easy: '简单', normal: '普通', hard: '困难', expert: '专家',
};

export class SidePanel {
  el: HTMLElement;
  private cb: SidePanelCallbacks;
  private timeEl!: HTMLDivElement;
  private noEl!: HTMLDivElement; // 当前题全局序号
  private helpBtn!: HTMLButtonElement;
  private prevBtn!: HTMLButtonElement;
  private pickBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private diffBtns: Record<Difficulty, HTMLButtonElement> = {} as any;

  constructor(cb: SidePanelCallbacks) {
    this.cb = cb;
    this.el = document.createElement('div');
    this.el.className = 'side-panel';
    this.el.innerHTML = this.template();
    this.bindElements();
    this.bindEvents();
  }

  private template(): string {
    return `
      <div class="side-time-row">
        <div class="side-time" data-el="time">00:00</div>
        <div class="side-no" data-el="no">#001</div>
        <button class="help-btn" data-act="help" title="帮助">？</button>
      </div>
      <div class="side-nav">
        <button data-act="prev" title="上一题">上一题</button>
        <button data-act="pick" title="题目选择">题目选择</button>
        <button data-act="next" title="下一题">下一题</button>
      </div>
      <div class="side-diff">
        ${DIFFS.map((d) => `<button data-diff="${d}">${DIFF_LABELS[d]}</button>`).join('\n        ')}
      </div>
    `;
  }

  private bindElements(): void {
    const q = (sel: string) => this.el.querySelector(sel) as HTMLElement;
    this.timeEl = q('[data-el="time"]') as HTMLDivElement;
    this.noEl = q('[data-el="no"]') as HTMLDivElement;
    this.helpBtn = q('[data-act="help"]') as HTMLButtonElement;
    this.prevBtn = q('[data-act="prev"]') as HTMLButtonElement;
    this.pickBtn = q('[data-act="pick"]') as HTMLButtonElement;
    this.nextBtn = q('[data-act="next"]') as HTMLButtonElement;
    for (const d of DIFFS) {
      this.diffBtns[d] = q(`[data-diff="${d}"]`) as HTMLButtonElement;
    }
  }

  private bindEvents(): void {
    this.prevBtn.addEventListener('click', () => this.cb.onPrev());
    this.pickBtn.addEventListener('click', () => this.cb.onPick());
    this.nextBtn.addEventListener('click', () => this.cb.onNext());
    this.helpBtn.addEventListener('click', () => this.cb.onHelp());
    // 统一绑定四档难度按钮点击
    for (const d of DIFFS) {
      this.diffBtns[d].addEventListener('click', () => this.cb.onNewGame(d));
    }
  }

  // 由 main.ts 的 subscribe 回调调用：同步计时、题号、难度高亮、导航可用性
  update(store: GameStore): void {
    this.timeEl.textContent = formatTime(store.elapsedMs);
    const diff = store.getDifficulty();
    // 当前题全局序号（需求2）
    const list = getPuzzleList(diff);
    const idx = list.findIndex((p) => p.id === store.puzzle.id);
    this.noEl.textContent = idx >= 0 ? '#' + formatPuzzleNo(getGlobalNumber(diff, idx)) : '#---';
    for (const d of DIFFS) {
      this.diffBtns[d].classList.toggle('active', d === diff);
    }
    // 题库为空时禁用导航
    const disabled = list.length === 0;
    this.prevBtn.disabled = disabled;
    this.pickBtn.disabled = disabled;
    this.nextBtn.disabled = disabled;
  }
}
