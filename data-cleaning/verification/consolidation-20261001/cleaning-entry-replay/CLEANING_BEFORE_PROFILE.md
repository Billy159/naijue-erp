# 清洗前全量扫描

正式工作簿 74，Sheet 99，非空行 807,728。

| 候选类型 | 单元格数 |
|---|---:|
| numeric_text_candidate | 2,684,479 |
| fullwidth_character | 102,802 |
| empty_string | 1,891,313 |
| embedded_linebreak_or_tab | 178 |
| date_text_candidate | 791 |
| nbsp | 52 |
| outer_whitespace | 13 |

## 按数据域

| 数据域 | 候选类型 | 单元格数 |
|---|---|---:|
| 业务历史 | date_text_candidate | 790 |
| 业务历史 | embedded_linebreak_or_tab | 112 |
| 业务历史 | empty_string | 1,831,079 |
| 业务历史 | fullwidth_character | 100,529 |
| 业务历史 | numeric_text_candidate | 2,631,875 |
| 其它来源 | empty_string | 8 |
| 其它来源 | fullwidth_character | 91 |
| 其它来源 | numeric_text_candidate | 20,085 |
| 基础资料 | embedded_linebreak_or_tab | 66 |
| 基础资料 | empty_string | 8,814 |
| 基础资料 | fullwidth_character | 1,111 |
| 基础资料 | nbsp | 52 |
| 基础资料 | numeric_text_candidate | 31,896 |
| 基础资料 | outer_whitespace | 13 |
| 库存快照 | date_text_candidate | 1 |
| 库存快照 | empty_string | 51,412 |
| 库存快照 | fullwidth_character | 1,053 |
| 库存快照 | numeric_text_candidate | 47 |
| 枚举与尺码 | fullwidth_character | 18 |
| 枚举与尺码 | numeric_text_candidate | 576 |

数字文本、全角字符、空字符串及备注换行是候选观察量，不等于可自动修复错误。
