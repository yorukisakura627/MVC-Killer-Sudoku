// 命令模式：每个用户操作（填值、切换候选）封装为 Command
//   undo/redo 通过反向应用实现
//   支持批量操作合并（一次输入产生多格修改）

export interface Command {
  undo(): void;
  redo(): void;
  describe(): string;
}

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private max: number;

  constructor(max = 200) {
    this.max = max;
  }

  push(cmd: Command): void {
    this.undoStack.push(cmd);
    this.redoStack = []; // 新操作清空 redo 栈
    if (this.undoStack.length > this.max) {
      this.undoStack.shift();
    }
  }

  undoLast(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    return true;
  }

  redoLast(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.redo();
    this.undoStack.push(cmd);
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

// 命令构造工具：填值/清除（每格记录 before/after）
export interface ValueChange {
  idx: number;
  before: number;
  after: number;
}

export function makeSetValueCommand(
  changes: ValueChange[],
  applyFn: (idx: number, v: number) => void,
): Command {
  return {
    redo: () => changes.forEach((c) => applyFn(c.idx, c.after)),
    undo: () => changes.forEach((c) => applyFn(c.idx, c.before)),
    describe: () => `修改 ${changes.length} 格`,
  };
}

// 命令构造工具：切换候选（每格记录 before/after 候选集）
export interface CandChange {
  idx: number;
  before: Set<number>;
  after: Set<number>;
}

export function makeToggleCandCommand(
  changes: CandChange[],
  applyFn: (idx: number, cands: Set<number>) => void,
): Command {
  return {
    redo: () => changes.forEach((c) => applyFn(c.idx, c.after)),
    undo: () => changes.forEach((c) => applyFn(c.idx, c.before)),
    describe: () => `切换 ${changes.length} 格候选`,
  };
}
