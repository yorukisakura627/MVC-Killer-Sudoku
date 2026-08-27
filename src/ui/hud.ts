import type { GameStore } from '@/state/game-store';
import type { Difficulty } from '@/types/puzzle';
import type { LoadProgress } from '@/puzzle-loader';
import { getCompletedIds } from '@/state/persistence';

// HUD 顶部控制栏：难度选择、计时、撤销/重做、提示/检查/候选模式、暂停/新游戏
//   DOM 实现而非 Canvas，便于点击交互与样式调整
export interface HudCallbacks {
  onNewGame: (diff: Difficulty) => void;
}

export class Hud {
  el: HTMLElement;
  private store: GameStore;
  private cb: HudCallbacks;
  private totalTimeSet: number = 0;

  // 明确赋值断言：在 bindElements() 中通过 DOM 查询初始化
  private timeEl!: HTMLSpanElement;
  private progressEl!: HTMLSpanElement;
  private reasonEl!: HTMLDivElement;
  private diffBtns: Record<Difficulty, HTMLButtonElement> = {} as any;

  constructor(store: GameStore, cb: HudCallbacks) {
    this.store = store;
    this.cb = cb;
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = this.template();
    this.bindElements();
    this.bindEvents();
    this.setTotalTimeSet(0); // 初始未知题库大小
  }

  private template(): string {
    // 撤销/重做/候选模式按钮已移入数字键盘 Numpad，HUD 只保留难度/计时/提示/检查/新题
    return `
      <div class="hud-group difficulty-group">
        <button data-diff="easy">简单</button>
        <button data-diff="normal">普通</button>
        <button data-diff="hard">困难</button>
      </div>
      <div class="hud-group">
        <span class="time-display" data-el="time">00:00</span>
        <span class="progress-display" data-el="progress">0/0</span>
        <button data-el="pause">暂停</button>
      </div>
      <div class="hud-group">
        <button data-el="hint" title="提示 (H)">提示</button>
        <button data-el="check" class="danger" title="检查 (T)">检查</button>
        <button data-el="newGame">新题</button>
      </div>
      <div class="hud-reason" data-el="reason"></div>
    `;
  }

  private bindElements(): void {
    const q = (sel: string) => this.el.querySelector(sel) as HTMLElement;
    this.timeEl = q('[data-el="time"]') as HTMLSpanElement;
    this.progressEl = q('[data-el="progress"]') as HTMLSpanElement;
    this.reasonEl = q('[data-el="reason"]') as HTMLDivElement;
    for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
      this.diffBtns[d] = q(`[data-diff="${d}"]`) as HTMLButtonElement;
    }
  }

  private bindEvents(): void {
    this.diffBtns.easy.addEventListener('click', () => this.cb.onNewGame('easy'));
    this.diffBtns.normal.addEventListener('click', () => this.cb.onNewGame('normal'));
    this.diffBtns.hard.addEventListener('click', () => this.cb.onNewGame('hard'));
    (this.el.querySelector('[data-el="hint"]') as HTMLButtonElement).addEventListener('click', () => this.store.requestHint());
    (this.el.querySelector('[data-el="check"]') as HTMLButtonElement).addEventListener('click', () => this.store.check());
    (this.el.querySelector('[data-el="newGame"]') as HTMLButtonElement).addEventListener('click', () => this.cb.onNewGame(this.store.getDifficulty()));
    (this.el.querySelector('[data-el="pause"]') as HTMLButtonElement).addEventListener('click', () => this.store.pauseTimer());
  }

  // 设置某难度题库总数（用于显示 X/Y 进度）
  //   注意：不主动触发 update，因为调用方（main.ts）在 store 就绪后会立即调用 update
  //   若在此处 update，store 可能仍是占位（history 为 undefined），访问 canUndo 会崩溃
  setTotalTimeSet(n: number): void {
    this.totalTimeSet = n;
  }

  // 替换内部 store 引用（用于切换题目时绑定新 store）
  setStore(store: GameStore): void {
    this.store = store;
  }

  // 显示加载进度
  showProgress(p: LoadProgress): void {
    this.reasonEl.textContent = p.message;
  }

  // 从 store 同步 HUD 状态（撤销/重做/候选模式按钮状态由 Numpad.update 负责）
  update(store: GameStore): void {
    this.timeEl.textContent = formatTime(store.elapsedMs);
    this.reasonEl.textContent = store.hintReason || '';
    // 高亮当前难度按钮
    for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
      this.diffBtns[d].classList.toggle('active', d === store.getDifficulty());
    }
    // 题库进度
    const completed = getCompletedIds();
    const diff = store.getDifficulty();
    let done = 0;
    let total = this.totalTimeSet;
    void diff;
    void completed;
    this.progressEl.textContent = `${done}/${total}`;
  }

  setProgressCount(done: number, total: number): void {
    this.progressEl.textContent = `${done}/${total}`;
  }
}

// 时间格式化 mm:ss
export function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
