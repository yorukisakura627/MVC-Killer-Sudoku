import type { ActionHandler, InputAction } from '@/input/pointer';

// 数字键盘（需求4）：4×4 网格布局
//   行1：擦除 / 撤销 / 重做 / 候选
//   行2：1 / 2 / 3 / 提示
//   行3：4 / 5 / 6 / 检查
//   行4：7 / 8 / 9 / 暂停
//   候选模式下数字按钮发 toggleCand，否则发 value（含相同数字删除逻辑）
export class Numpad {
  el: HTMLElement;
  private onAction: ActionHandler;
  private candBtn!: HTMLButtonElement;
  private undoBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;
  private hintBtn!: HTMLButtonElement;
  private hintCountEl!: HTMLSpanElement;
  // 当前是否候选模式：决定数字按钮发 value 还是 toggleCand
  private candidateMode = false;

  constructor(onAction: ActionHandler) {
    this.onAction = onAction;
    this.el = document.createElement('div');
    this.el.className = 'numpad';
    this.el.innerHTML = this.template();
    this.candBtn = this.el.querySelector('[data-act="candMode"]') as HTMLButtonElement;
    this.undoBtn = this.el.querySelector('[data-act="undo"]') as HTMLButtonElement;
    this.resetBtn = this.el.querySelector('[data-act="reset"]') as HTMLButtonElement;
    this.hintBtn = this.el.querySelector('[data-act="hint"]') as HTMLButtonElement;
    this.hintCountEl = this.el.querySelector('[data-act="hint"] [data-el="hintCount"]') as HTMLSpanElement;
    this.bindEvents();
  }

  private template(): string {
    // 4×4 顺序：擦除 撤销 重做 候选 / 1 2 3 提示 / 4 5 6 检查 / 7 8 9 暂停
    return `
      <button data-act="erase" title="擦除 (Backspace)">擦除</button>
      <button data-act="undo" title="撤销 (Ctrl+Z)">撤销</button>
      <button data-act="reset" title="重做本题：清空输入+重置计时">重做</button>
      <button data-act="candMode" title="候选模式 (C)">候选</button>
      <button data-act="value" data-val="1">1</button>
      <button data-act="value" data-val="2">2</button>
      <button data-act="value" data-val="3">3</button>
      <button data-act="hint" title="提示 (H)" class="hint-btn">
        提示
        <span class="hint-count" data-el="hintCount">0</span>
      </button>
      <button data-act="value" data-val="4">4</button>
      <button data-act="value" data-val="5">5</button>
      <button data-act="value" data-val="6">6</button>
      <button data-act="check" title="检查 (T)" class="danger">检查</button>
      <button data-act="value" data-val="7">7</button>
      <button data-act="value" data-val="8">8</button>
      <button data-act="value" data-val="9">9</button>
      <button data-act="pause" title="暂停 (空格)">暂停</button>
    `;
  }

  private bindEvents(): void {
    this.el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const act = btn.dataset.act;
      if (!act) return;
      // 候选模式下，数字键触发 toggleCand；否则触发 value
      if (act === 'value') {
        const v = Number(btn.dataset.val);
        this.onAction(this.candidateMode ? { kind: 'toggleCand', value: v } : { kind: 'value', value: v });
        return;
      }
      // 路由到对应动作
      const map: Record<string, InputAction> = {
        erase: { kind: 'value', value: 0 },
        candMode: { kind: 'toggleCandMode' },
        undo: { kind: 'undo' },
        reset: { kind: 'reset' },
        hint: { kind: 'hint' },
        check: { kind: 'check' },
        pause: { kind: 'pause' },
      };
      const action = map[act];
      if (action) this.onAction(action);
    });
  }

  // 由 main.ts 的 subscribe 回调调用，同步按钮禁用态与候选模式高亮
  //   canReset：有用户输入才激活"重做"；canHint：有剩余提示才激活"提示"；
  //   hintsRemaining：右上角红圈显示剩余次数；用完隐藏红圈（0 无信息量）
  update(opts: { candidateMode: boolean; canUndo: boolean; canReset: boolean; canHint: boolean; hintsRemaining: number; paused: boolean }): void {
    this.candidateMode = opts.candidateMode;
    this.candBtn.classList.toggle('active', opts.candidateMode);
    this.undoBtn.disabled = !opts.canUndo;
    this.resetBtn.disabled = !opts.canReset;
    this.hintBtn.disabled = !opts.canHint;
    if (this.hintCountEl) {
      this.hintCountEl.textContent = String(opts.hintsRemaining);
      this.hintCountEl.style.display = opts.hintsRemaining === 0 ? 'none' : '';
    }
  }
}
