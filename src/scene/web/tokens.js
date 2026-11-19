// 组件级几何常量：与 styles.js 顶部的 --dpp-r-* / --dpp-h-* 一一对应。
// 之所以同时以 inline style 下发给控件，是因为插件运行在宿主页面里，
// 宿主的全局样式（不同版本/不同主题）可能参与级联，组件内联值优先于任何样式表。
export const R = {
  stage: 18,
  modal: 16,
  card: 12,
  control: 8,
  item: 6,
  code: 5,
  pill: 999,
  round: '50%',
};

export const H = {
  chip: 26,
  button: 28,
  seg: 24,
  pill: 22,
  input: 34,
};
