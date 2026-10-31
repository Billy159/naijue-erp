# T01 / S01 列表原步骤限定验证

业务源码基准51ed075680139a3862a528d221f0ed7a0d05db7b。本批没有新增业务代码修改。fixture为原有QA合成只读资料，不是生产历史。

## 已执行
- dot原生构建成功，脚本核对全量产物与输入hash、当前HEAD、API实际数据。原生有sandbox Chromium前台点击，无强制点击与隐藏DOM交互。
- T01 actual-t01-fifth：16个步骤记录通过。真实第二页进入详情返回保留页码/筛选/行；960px左右横滚右操作列；三种状态独立及组合、颜色和数量/分类汇总；空单号结果、带数量标记的高级筛选收起展开；日期倒序本地阻止请求且保留旧结果、改正重新查询；未审核0022详情返回；调出仓真实候选单仓查询。
- S01 actual-s01-first：20个步骤记录通过。以上公共路径及销货零结果分页禁用、营业员不存在搜索、退换状态详情返回、营业厅/客户筛选返回。
- 所有业务命令被测试桥拒绝，实际零写命令。

## 测试脚本失败与修正
前三次T01失败是定位错误：控件中心点击落在标签关闭，input被标签遮盖，hover箭头被清除图标替换。改为正常可见控件左侧空白区点击（不force）。第四次在“收起筛选1”的数量标记处，旧精确文本定位失败；改按现有按钮类及aria-expanded。没有为测试修掉正式校验或修改业务。

## 明确保留
两用例整页仍PARTIAL。本fixture无分类+N样本，该子路径未执行；既有专门分类溢出用例需单独引用。退换仅18张、最小每页20，因此原退换第2页未执行，不能制造第2页。没有同轮冻结Demo配对、真实权限角色及PG保存审核链验证。步骤记录中包含明确标记缺样本的检查，不能把16/20当作完整功能数。

## 重跑
使用tests/document-list-readonly-public-config.json生成新构建。执行tests/recheck-document-lists-browser.py BUILD OUT --expected-checkpoint FULL_SHA --node NODE --headed，可追加--case RECHECK-T01或RECHECK-S01。HEAD必须与固定构建一致，OUT不可存在；读取与UI筛选均限synthetic-management.invalid。
