// 主题配色：明确区分普通笼、隐藏笼、格间大小、笼间大小四种视觉元素
//   玩家可凭颜色一眼区分约束类型
export interface Theme {
  bg: string;
  gridLine: string;
  gridLineThick: string;
  cageBorder: string; // 笼边粗虚线（深红）
  cageLabelBg: string; // 笼和值标签底色（白）
  cageLabelFg: string; // 笼和值标签文字（黑）
  cageLabelBorder: string; // 笼和值标签描边（中灰：白底与浅色表格背景的区分线）
  hiddenCageLabelBg: string; // 隐藏笼"?"标签底色（金）
  hiddenCageLabelFg: string;
  cellIneq: string; // 格间大小符号（深蓝）
  cageIneq: string; // 笼间大小符号（橙）
  cageIneqGuide: string; // 笼间符号引导虚线
  cellEq: string; // 格间等值符号（深蓝，与大小约束同族，靠形状区分）
  cageEq: string; // 笼间等值符号（橙，与大小约束同族）
  givenNumber: string;
  userInput: string;
  candidate: string;
  highlightSelected: string;
  highlightPeer: string;
  highlightSameValue: string;
  highlightCage: string;
  highlightConflict: string;
  highlightHint: string;
}

export const DEFAULT_THEME: Theme = {
  bg: '#fefefe',
  gridLine: '#d1d5db',
  gridLineThick: '#1f2937',
  cageBorder: '#b91c1c',
  cageLabelBg: '#ffffff', // 笼和值标签：白底黑字（白字叠白底不可读的修订）
  cageLabelFg: '#111827',
  cageLabelBorder: '#9ca3af',
  hiddenCageLabelBg: '#f59e0b',
  hiddenCageLabelFg: '#ffffff',
  cellIneq: '#1e3a8a',
  cageIneq: '#f59e0b',
  cageIneqGuide: '#fbbf24',
  cellEq: '#1e3a8a',
  cageEq: '#f59e0b',
  givenNumber: '#111827',
  userInput: '#1e40af',
  candidate: '#6b7280', // 候选数：中灰（调深，提升可读性）
  highlightSelected: '#fef3c7',
  highlightPeer: '#fef9c3',
  highlightSameValue: '#dbeafe',
  highlightCage: '#fed7aa',
  highlightConflict: '#ef4444',
  highlightHint: '#10b981',
};
