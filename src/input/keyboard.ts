import type { View } from '@/render/view';
import type { ActionHandler } from './pointer';

// 键盘输入：方向键选格、数字键输入、Shift+数字切换候选、撤销重做
//   - 1-9：填值
//   - 0/Delete/Backspace：清除
//   - Shift+1-9 或候选模式下 1-9：切换候选
//   - 方向键：移动选中格
//   - Ctrl/Cmd+Z：撤销；Ctrl/Cmd+Shift+Z 或 Ctrl+Y：重做
//   - C：切换候选模式
//   - H：提示
//   - T：检查
export class KeyboardInput {
  private getView: () => View;
  private onAction: ActionHandler;
  private bound: (e: KeyboardEvent) => void;

  constructor(getView: () => View, onAction: ActionHandler) {
    this.getView = getView;
    this.onAction = onAction;
    this.bound = this.handleKey.bind(this);
    window.addEventListener('keydown', this.bound);
  }

  private handleKey(e: KeyboardEvent): void {
    const view = this.getView();
    const sel = view.selected;
    // 撤销/重做全局可用
    if (isUndo(e)) {
      e.preventDefault();
      this.onAction({ kind: 'undo' });
      return;
    }
    if (isRedo(e)) {
      e.preventDefault();
      this.onAction({ kind: 'redo' });
      return;
    }
    if (e.key.toLowerCase() === 'c') {
      e.preventDefault();
      this.onAction({ kind: 'toggleCandMode' });
      return;
    }
    if (e.key.toLowerCase() === 'h') {
      e.preventDefault();
      this.onAction({ kind: 'hint' });
      return;
    }
    if (e.key.toLowerCase() === 't') {
      e.preventDefault();
      this.onAction({ kind: 'check' });
      return;
    }
    // 空格键：暂停/继续（需求3），全局可用
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      this.onAction({ kind: 'pause' });
      return;
    }
    // 以下动作需有选中格
    if (sel < 0) return;

    // 方向键移动选格
    const move = parseArrow(e.key);
    if (move) {
      e.preventDefault();
      this.onAction({ kind: 'move', dr: move[0], dc: move[1] });
      return;
    }

    // 数字键
    if (e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const v = Number(e.key);
      if (e.shiftKey || view.candidateMode) {
        this.onAction({ kind: 'toggleCand', value: v });
      } else {
        this.onAction({ kind: 'value', value: v });
      }
      return;
    }
    if (e.key === '0' || e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.onAction({ kind: 'value', value: 0 });
      return;
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.bound);
  }
}

function isUndo(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
}
function isRedo(e: KeyboardEvent): boolean {
  return (
    ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
    ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')
  );
}
function parseArrow(key: string): [number, number] | null {
  switch (key) {
    case 'ArrowUp':
      return [-1, 0];
    case 'ArrowDown':
      return [1, 0];
    case 'ArrowLeft':
      return [0, -1];
    case 'ArrowRight':
      return [0, 1];
    default:
      return null;
  }
}
