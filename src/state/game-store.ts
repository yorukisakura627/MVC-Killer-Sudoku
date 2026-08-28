import type { Puzzle } from '@/types/puzzle';
import type { Difficulty } from '@/types/puzzle';
import type { CellState } from '@/render/view';
import { History, makeToggleCandCommand, type Command } from '@/input/history';
import { saveGame, markCompleted } from './persistence';

// 游戏状态：单一数据源，所有 UI/输入/渲染都基于此
//   - 用户填值/候选改动通过命令栈记录，支持撤销重做
//   - 完成后自动存档与标记题库进度
export class GameStore {
  puzzle: Puzzle;
  cells: CellState[];
  history: History;
  selected: number = -1;
  // 多选集合（需求1）：鼠标拖动多选后写入，resolveTargets 优先读取
  selectedSet: Set<number> = new Set();
  candidateMode: boolean = false;
  elapsedMs: number = 0;
  hintTarget: number = -1;
  hintReason: string = '';
  completed: boolean = false;
  paused: boolean = false;
  // 提示用量（需求2）：easy5/normal3/hard1，用一次永久+1，撤销不恢复
  hintsUsed: number = 0;

  private listeners: Set<(store: GameStore) => void> = new Set();
  private timer: number | null = null;
  private lastTickAt = 0;

  constructor(puzzle: Puzzle) {
    this.puzzle = puzzle;
    this.cells = Array.from({ length: 81 }, (_, i) => ({
      value: puzzle.givens.get(i) ?? 0,
      isGiven: puzzle.givens.has(i),
      userCands: new Set<number>(),
      conflict: false,
    }));
    this.history = new History();
  }

  // === 订阅 ===
  subscribe(fn: (store: GameStore) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    this.listeners.forEach((fn) => fn(this));
  }

  // === 计时 ===
  startTimer(): void {
    if (this.timer !== null) return;
    this.lastTickAt = Date.now();
    this.timer = window.setInterval(() => {
      if (this.paused || this.completed) return;
      const now = Date.now();
      this.elapsedMs += now - this.lastTickAt;
      this.lastTickAt = now;
      this.emit();
    }, 1000);
  }
  pauseTimer(): void {
    this.paused = !this.paused;
    this.lastTickAt = Date.now();
    this.emit();
  }
  stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // === 选格 ===
  //   单选清空多选集；多选通过 selectMulti/selectAdd 维护 selectedSet
  select(idx: number): void {
    if (idx < 0 || idx >= 81) return;
    this.selected = idx;
    this.selectedSet = new Set([idx]);
    this.hintTarget = -1; // 选格后清除提示
    this.emit();
  }

  // 多选：替换为给定集合（拖动结束时调用）
  selectMulti(idxs: number[]): void {
    if (idxs.length === 0) return;
    this.selectedSet = new Set(idxs);
    this.selected = idxs[0]; // 主选中格（用于候选等单格操作）
    this.hintTarget = -1;
    this.emit();
  }

  // 返回当前操作目标格集合：多选优先，否则单选
  resolveTargets(): number[] {
    if (this.selectedSet.size > 0) return Array.from(this.selectedSet);
    if (this.selected >= 0) return [this.selected];
    return [];
  }
  moveSel(dr: number, dc: number): void {
    if (this.selected < 0) {
      this.select(40); // 中心格
      return;
    }
    const r = Math.floor(this.selected / 9) + dr;
    const c = (this.selected % 9) + dc;
    if (r < 0 || r > 8 || c < 0 || c > 8) return;
    this.select(r * 9 + c);
  }

  // === 输入值 ===
  //   统一规则（需求1：候选保持）：
  //   - 擦除(v=0) → 清空值与候选
  //   - 有值且 == v → 删除确定值，候选保留
  //   - 有值且 != v → 原值降级为候选，新数加入候选，清空确定值（进入候选模式）
  //   - 无确定值且已有候选 → 保持候选模式，切换 v（有则删、无则加）
  //       候选删空后格子回到空格状态，下次输入才填确定值
  //   - 无值无候选（空格）→ 填确定值 v
  //   given 格不可改；多选时对集合内每个非给定格逐个应用
  inputValue(v: number): void {
    if (this.completed) return;
    const targets = this.resolveTargets();
    if (targets.length === 0) return;
    interface Op { idx: number; before: number; after: number; candBefore: Set<number>; candAfter: Set<number>; }
    const ops: Op[] = [];
    for (const idx of targets) {
      const cell = this.cells[idx];
      if (cell.isGiven) continue;
      const before = cell.value;
      const candBefore = new Set(cell.userCands);
      if (v === 0) {
        // 擦除：清空值与候选
        if (before === 0 && candBefore.size === 0) continue;
        ops.push({ idx, before, after: 0, candBefore, candAfter: new Set() });
      } else if (before !== 0 && before === v) {
        // 有值且相同 → 删除确定值，候选保留
        ops.push({ idx, before, after: 0, candBefore, candAfter: new Set(candBefore) });
      } else if (before !== 0 && before !== v) {
        // 有值且不同 → 原值降级候选，新数加入候选，清空确定值
        const after = new Set(candBefore);
        after.add(before); // 原值降级为候选
        after.add(v);      // 新数加入候选
        ops.push({ idx, before, after: 0, candBefore, candAfter: after });
      } else {
        // before === 0（无确定值）
        if (candBefore.size > 0) {
          // 已有候选 → 保持候选模式，切换 v
          const after = new Set(candBefore);
          if (after.has(v)) after.delete(v);
          else after.add(v);
          // 候选删空后自然回到空格状态，下次输入填值
          ops.push({ idx, before: 0, after: 0, candBefore, candAfter: after });
        } else {
          // 空格（无值无候选）→ 填确定值
          ops.push({ idx, before: 0, after: v, candBefore, candAfter: new Set() });
        }
      }
    }
    if (ops.length === 0) return;
    // 组合命令：值与候选一并 redo/undo，保证撤销时完整恢复
    const store = this;
    const cmd: Command = {
      redo() { for (const o of ops) { store.setCellValue(o.idx, o.after); store.setCellCands(o.idx, o.candAfter); } },
      undo() { for (const o of ops) { store.setCellValue(o.idx, o.before); store.setCellCands(o.idx, o.candBefore); } },
      describe() { return `输入 ${ops.length} 格`; },
    };
    this.history.push(cmd);
    cmd.redo();
    this.hintTarget = -1;
    this.afterChange();
  }

  // === 切换候选 ===
  //   候选模式/Shift 用：对选中格切换某候选标记
  //   需求2 后允许有值格子也保留候选，故移除"有值不能标候选"限制
  toggleCand(v: number): void {
    if (this.selected < 0 || this.completed) return;
    const cell = this.cells[this.selected];
    if (cell.isGiven) return;
    const before = new Set(cell.userCands);
    const after = new Set(cell.userCands);
    if (after.has(v)) after.delete(v);
    else after.add(v);
    const idx = this.selected;
    const cmd = makeToggleCandCommand(
      [{ idx, before, after }],
      (i, cands) => this.setCellCands(i, cands),
    );
    this.history.push(cmd);
    cmd.redo();
    this.hintTarget = -1;
    this.afterChange();
  }

  toggleCandMode(): void {
    this.candidateMode = !this.candidateMode;
    this.emit();
  }

  // === 撤销重做 ===
  undo(): void {
    if (this.history.undoLast()) {
      this.hintTarget = -1;
      this.afterChange();
    }
  }
  redo(): void {
    if (this.history.redoLast()) {
      this.hintTarget = -1;
      this.afterChange();
    }
  }

  // === 提示（需求2）===
  //   四档难度提示数：easy5 / normal4 / hard3 / expert2
  //   用一次随机填一个空格(value==0)的正确答案
  //   提示填的值可被用户更改；撤销正常撤销该数字但不恢复提示次数
  get hintLimit(): number {
    return this.puzzle.difficulty === 'easy' ? 5
      : this.puzzle.difficulty === 'normal' ? 4
      : this.puzzle.difficulty === 'hard' ? 3 : 2;
  }
  get hintsRemaining(): number {
    return Math.max(0, this.hintLimit - this.hintsUsed);
  }
  requestHint(): void {
    if (this.completed) return;
    if (this.hintsRemaining <= 0) {
      this.hintReason = '提示次数已用完';
      this.emit();
      return;
    }
    // 收集未填确定数字的空格（value==0，有候选也算"未填充数字"）
    const empty: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (!this.cells[i].isGiven && this.cells[i].value === 0) empty.push(i);
    }
    if (empty.length === 0) {
      this.hintReason = '已无空格';
      this.emit();
      return;
    }
    const target = empty[Math.floor(Math.random() * empty.length)];
    const correct = this.puzzle.solution[target];
    // 填入正确答案：走命令栈可撤销，清该格候选
    const before = 0;
    const candBefore = new Set(this.cells[target].userCands);
    const store = this;
    const cmd: Command = {
      redo() { store.setCellValue(target, correct); store.setCellCands(target, new Set()); },
      undo() { store.setCellValue(target, before); store.setCellCands(target, candBefore); },
      describe() { return '提示填值'; },
    };
    this.history.push(cmd);
    cmd.redo();
    // 提示次数永久+1，不进命令栈（撤销不恢复）
    this.hintsUsed++;
    this.hintTarget = target;
    this.hintReason = `提示：填入 ${correct}`;
    this.afterChange();
  }

  // === 重做本题（需求1）===
  //   清空所有用户输入（值与候选）、重置计时与历史、提示次数归零
  resetPuzzle(): void {
    for (let i = 0; i < 81; i++) {
      if (!this.cells[i].isGiven) {
        this.cells[i].value = 0;
        this.cells[i].userCands = new Set();
      }
      this.cells[i].conflict = false;
    }
    this.history = new History();
    this.elapsedMs = 0;
    this.completed = false;
    this.hintsUsed = 0;
    this.hintTarget = -1;
    this.hintReason = '';
    this.lastTickAt = Date.now();
    this.emit();
  }

  // 是否存在用户输入（用于"重做"按钮激活判断）
  hasUserInput(): boolean {
    return this.cells.some((c) => !c.isGiven && (c.value !== 0 || c.userCands.size > 0));
  }

  // === 检查 ===
  //   规则校验（而非与答案对比）：仅用当前已知输入，按数独规则标红冲突格 2 秒
  //   检测维度：①行列宫重复 ②笼和(笼内值全填且和≠sum) ③格间大小 ④格间等值
  //   笼间大小/等值只在两侧笼和值确定（笼内值全填或 sum≠null）时校验；
  //   笼内未填值 → 该笼参与的笼间大小/等值暂不校验（信息不足）。
  //   给定数也参与冲突判定（若用户填错与给定重复也应标红）。
  check(): void {
    // 先全部清除
    for (const c of this.cells) c.conflict = false;
    const mark = (idx: number) => {
      this.cells[idx].conflict = true;
    };

    // ① 行列宫重复：对每一行/列/宫，按值分组找重复
    for (let k = 0; k < 9; k++) {
      const byVRow = new Map<number, number[]>();
      const byVCol = new Map<number, number[]>();
      for (let j = 0; j < 9; j++) {
        const ri = k * 9 + j;
        const rv = this.cells[ri].value;
        if (rv !== 0) {
          const arr = byVRow.get(rv) ?? [];
          arr.push(ri);
          byVRow.set(rv, arr);
        }
        const ci = j * 9 + k;
        const cv = this.cells[ci].value;
        if (cv !== 0) {
          const arr = byVCol.get(cv) ?? [];
          arr.push(ci);
          byVCol.set(cv, arr);
        }
      }
      for (const arr of byVRow.values()) if (arr.length > 1) arr.forEach(mark);
      for (const arr of byVCol.values()) if (arr.length > 1) arr.forEach(mark);
    }
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const byV = new Map<number, number[]>();
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const idx = (br * 3 + i) * 9 + (bc * 3 + j);
            const v = this.cells[idx].value;
            if (v !== 0) {
              const arr = byV.get(v) ?? [];
              arr.push(idx);
              byV.set(v, arr);
            }
          }
        }
        for (const arr of byV.values()) if (arr.length > 1) arr.forEach(mark);
      }
    }

    // ② 笼和校验：笼内无空值且都不为 0 时，检查和是否等于 cage.sum
    for (const cage of this.puzzle.cages) {
      if (cage.sum === null) continue; // 隐藏和值笼不直接校验（通过笼间约束部分校验）
      let cageSum = 0;
      let filled = true;
      for (const idx of cage.cells) {
        const v = this.cells[idx].value;
        if (v === 0) { filled = false; break; }
        cageSum += v;
      }
      if (!filled) continue;
      if (cageSum !== cage.sum) {
        for (const idx of cage.cells) mark(idx);
      }
    }

    // ③ 格间大小约束：两格都有确定值时校验 rel 是否成立
    for (const ii of this.puzzle.cellIneq) {
      const va = this.cells[ii.a].value;
      const vb = this.cells[ii.b].value;
      if (va === 0 || vb === 0) continue;
      const ok = ii.rel === '>' ? va > vb : va < vb;
      if (!ok) { mark(ii.a); mark(ii.b); }
    }

    // ④ 格间等值约束：两格都有确定值时校验是否相等
    for (const eq of this.puzzle.cellEq) {
      const va = this.cells[eq.a].value;
      const vb = this.cells[eq.b].value;
      if (va === 0 || vb === 0) continue;
      if (va !== vb) { mark(eq.a); mark(eq.b); }
    }

    // ⑤ 笼间大小约束：两笼都能确定和值时校验 rel 是否成立
    //   确定方式：sum 已知 或 笼内值全填（求和）；笼内有候选不算确定。
    const evaluateCageSum = (cage: { id: number; sum: number | null; cells: number[] }): number | null => {
      if (cage.sum !== null) return cage.sum;
      let s = 0;
      for (const idx of cage.cells) {
        const v = this.cells[idx].value;
        if (v === 0) return null;
        s += v;
      }
      return s;
    };
    const cageById = new Map(this.puzzle.cages.map((c) => [c.id, c]));
    for (const ci of this.puzzle.cageIneq) {
      const ca = cageById.get(ci.a);
      const cb = cageById.get(ci.b);
      if (!ca || !cb) continue;
      const sa = evaluateCageSum(ca);
      const sb = evaluateCageSum(cb);
      if (sa === null || sb === null) continue;
      const ok = ci.rel === '>' ? sa > sb : sa < sb;
      if (ok) continue;
      for (const idx of ca.cells) mark(idx);
      for (const idx of cb.cells) mark(idx);
    }

    // ⑥ 笼间等值约束：两笼和值都确定时校验是否相等
    for (const ce of this.puzzle.cageEq) {
      const ca = cageById.get(ce.a);
      const cb = cageById.get(ce.b);
      if (!ca || !cb) continue;
      const sa = evaluateCageSum(ca);
      const sb = evaluateCageSum(cb);
      if (sa === null || sb === null) continue;
      if (sa === sb) continue;
      for (const idx of ca.cells) mark(idx);
      for (const idx of cb.cells) mark(idx);
    }

    const anyConflict = this.cells.some((c) => c.conflict);
    if (anyConflict) {
      this.emit();
      setTimeout(() => {
        for (const c of this.cells) c.conflict = false;
        this.emit();
      }, 2000);
    } else {
      this.emit();
    }
  }

  // === 内部工具 ===
  //   setCellValue 不再清空候选：候选由调用方命令显式管理（需求2 允许有值格子保留候选）
  private setCellValue(idx: number, v: number): void {
    this.cells[idx].value = v;
  }
  private setCellCands(idx: number, cands: Set<number>): void {
    this.cells[idx].userCands = new Set(cands);
  }

  // 每次输入后调用：检测完成、存档、emit
  private afterChange(): void {
    if (this.isComplete() && !this.completed) {
      this.completed = true;
      markCompleted(this.puzzle.id);
    }
    saveGame(this);
    this.emit();
  }

  isComplete(): boolean {
    return this.cells.every((c, i) => c.value === this.puzzle.solution[i]);
  }

  // 难度与题库进度信息（HUD 用）
  getDifficulty(): Difficulty {
    return this.puzzle.difficulty;
  }
  getRating(): number {
    return this.puzzle.rating;
  }
}
