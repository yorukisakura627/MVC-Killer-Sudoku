import type { View } from '../view';
import type { Theme } from '../theme';

// 渲染层接口：每层只关心如何绘制自己负责的内容
//   绘制顺序由 canvas.ts 主循环决定，层与层之间不直接耦合
export interface RenderLayer {
  readonly name: string;
  draw(ctx: CanvasRenderingContext2D, view: View, theme: Theme): void;
}
