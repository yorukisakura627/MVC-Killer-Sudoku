import type { View } from '@/render/view';
import { pickCell } from '../render/view';

// 输入意图：由 pointer/keyboard 产生，由上层 dispatcher 处理
//   分离意图与执行，便于测试与多输入方式合并
export type InputAction =
  | { kind: 'select'; idx: number } // 单选（点击）
  | { kind: 'selectMany'; idxs: number[] } // 多选（拖动，需求1）
  | { kind: 'value'; value: number } // 给当前选中格填值；0=清除
  | { kind: 'toggleCand'; value: number } // 切换当前选中格的某候选
  | { kind: 'move'; dr: number; dc: number } // 方向键移动选格
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'toggleCandMode' }
  | { kind: 'hint' }
  | { kind: 'check' }
  | { kind: 'pause' } // 暂停/继续（需求3：空格键与按钮触发）
  | { kind: 'reset' }; // 重做本题：清空用户输入+重置计时（需求1）

export type ActionHandler = (action: InputAction) => void;

// 鼠标/触摸输入：点击单选，拖动多选（需求1）
//   - pointerdown 记录起点，进入"可能拖动"状态
//   - pointermove 超过阈值 → 拖动模式，累积选中经过的格子
//   - pointerup：未拖动 → 单选；拖动 → 多选
//   拖动选中的是起点到当前点所经过的路径格子（行/列方向沿直线，斜向则取起点-终点矩形内所有格）
export class PointerInput {
  private canvas: HTMLCanvasElement;
  private getView: () => View;
  private onAction: ActionHandler;
  private downIdx = -1;
  private dragging = false;
  private startX = 0;
  private startY = 0;
  // 拖动路径：鼠标实际划过的格子集合
  //   只选划过的格，而非起点-终点矩形（需求：路径式多选）
  private dragPath: Set<number> = new Set();
  private lastDragIdx = -1;

  constructor(canvas: HTMLCanvasElement, getView: () => View, onAction: ActionHandler) {
    this.canvas = canvas;
    this.getView = getView;
    this.onAction = onAction;
    canvas.addEventListener('pointerdown', this.handleDown);
    canvas.addEventListener('pointermove', this.handleMove);
    canvas.addEventListener('pointerup', this.handleUp);
    canvas.addEventListener('pointercancel', this.handleUp);
  }

  private handleDown = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const view = this.getView();
    const idx = pickCell(view, x, y);
    this.downIdx = idx;
    this.dragging = false;
    this.dragPath = new Set();
    this.lastDragIdx = idx;
    this.startX = x;
    this.startY = y;
  };

  private handleMove = (e: PointerEvent) => {
    if (this.downIdx < 0) return; // 未按下
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // 超过阈值进入拖动模式（区分点击与拖动）
    const dist = Math.hypot(x - this.startX, y - this.startY);
    if (!this.dragging && dist > 6) {
      this.dragging = true;
      // 进入拖动时先把起点格加入路径
      if (this.downIdx >= 0) this.dragPath.add(this.downIdx);
    }
    // 拖动中实时更新选区：把划过的格子加入路径并即时显示
    //   节流：仅当前格变化时才补路径并发 selectMany
    if (this.dragging) {
      const endIdx = pickCell(this.getView(), x, y);
      if (endIdx >= 0 && endIdx !== this.lastDragIdx) {
        this.addLineToPath(this.lastDragIdx, endIdx);
        this.lastDragIdx = endIdx;
        const idxs = Array.from(this.dragPath);
        if (idxs.length > 0) this.onAction({ kind: 'selectMany', idxs });
      }
    }
  };

  private handleUp = () => {
    if (this.downIdx < 0) return;
    if (!this.dragging) {
      // 纯点击 → 单选
      if (this.downIdx >= 0) this.onAction({ kind: 'select', idx: this.downIdx });
    } else {
      // 拖动结束 → 最终选区为划过的格子路径
      const idxs = Array.from(this.dragPath);
      if (idxs.length > 0) this.onAction({ kind: 'selectMany', idxs });
    }
    this.downIdx = -1;
    this.dragging = false;
  };

  // 沿拖动路径补全格子：从 a 到 b 的直线上所有格加入 dragPath
  //   保证快速拖动跳格时路径连续（行/列/对角方向均适用）
  private addLineToPath(a: number, b: number): void {
    if (a < 0 || b < 0) return;
    const ar = Math.floor(a / 9), ac = a % 9;
    const br = Math.floor(b / 9), bc = b % 9;
    const steps = Math.max(Math.abs(br - ar), Math.abs(bc - ac));
    if (steps === 0) { this.dragPath.add(b); return; }
    for (let i = 0; i <= steps; i++) {
      const r = Math.round(ar + ((br - ar) * i) / steps);
      const c = Math.round(ac + ((bc - ac) * i) / steps);
      this.dragPath.add(r * 9 + c);
    }
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.handleDown);
    this.canvas.removeEventListener('pointermove', this.handleMove);
    this.canvas.removeEventListener('pointerup', this.handleUp);
    this.canvas.removeEventListener('pointercancel', this.handleUp);
  }
}
