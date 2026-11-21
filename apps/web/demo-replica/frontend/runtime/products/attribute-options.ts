// Temporary fixed form options from frozen Demo b8bcfe3,
// frontend/product-master.js:28–30. Keep early shape codes as strings.
export const productThicknessOptions = ['薄款', '常规', '厚款'] as const;

export const productCollarOptions = [
  ['01', '圆领'],
  ['02', '中领'],
  ['03', '高领'],
  ['15', '西装领'],
  ['16', '翻领'],
  ['17', '立领'],
  ['18', '立翻领'],
  ['19', '棒球领'],
  ['20', '带帽'],
  ['21', '交叉领'],
] as const;

export const productTrouserOptions = [
  ['22', '正常裤脚'],
  ['23', '裤脚偏小'],
  ['24', '裤脚偏大'],
  ['26', '大版裤'],
  ['27', '小脚裤'],
] as const;

export const productShapeOptions = [...productCollarOptions, ...productTrouserOptions] as const;
