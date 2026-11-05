
## 2026-10-29 19:19 UTC 控件接续
产物 a066e40502a221d314553bcfbca849bcac510a84；独立 sandbox headed Chromium，闭合合成读取。
- RECHECK-P07 listed steps 完成：首次500失败→重试成功→全部仓→切离重入，保留查看状态，无库存编辑输入。证据 controls-resumed/result.json。
- RECHECK-P02 partial：编辑分类/年份/季节/供应商选择文本保留；厚薄声明空数据、领型声明501及重试，不能冒候选成功。新增态待补。
- RECHECK-P03 partial：版型B搜索/加入/已选搜索/移除/取消原规格保持，编辑尺码组禁用。新增尺码组/颜色待补。
- controls-first、controls-resumed失败均保留：前者错误使用 light-DOM inner_text 读取 shadow 控件，后者漏季节tag；版型初次比较发生在规格读取完成前。以已查看截图和请求证明测试观察错误，仅修测试定位/等待，不改业务和预期。P07已通过不在第二轮重复。

### 19:22 UTC 新增态补测
controls-new/result.json：P02新增分类/年份/春夏多选/供应商实际选择，切页和取消→继续编辑/Esc保留款号名称；厚薄/领型仍待有效候选，P02仍PARTIAL。P03颜色001→A加入移除取消，尺码组上衣→裤子→配饰逐组成员正确、切页保留；与前一轮编辑版型合并覆盖原P03列明步骤，非全部商品保存验收。
冻结Demo frozen-product-new-1922b/result.json 实跑款号名称切页/取消/Esc和裤子→配饰选择，两者一致。首轮1922的shadow light-DOM读空失败保留，改精确控件内部文字观察，不改原Demo。原Demo默认A/年份与候选未知空值差异未因此清零，不猜默认业务规则。
