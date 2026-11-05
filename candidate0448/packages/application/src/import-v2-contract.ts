/** Normalized v2 wire schema only; no private records or source identities. */
export const IMPORT_V2_TABLES = [
  {
    "entity": "HALL",
    "file": "business/06厅.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "厅名称",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "默认客户来源编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "默认销货仓来源编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "状态",
        "logicalType": "ENUM",
        "required": true
      }
    ]
  },
  {
    "entity": "WAREHOUSE",
    "file": "business/07仓库.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "仓库名称",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "所属厅来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "状态",
        "logicalType": "ENUM",
        "required": true
      },
      {
        "name": "切换范围",
        "logicalType": "ENUM",
        "required": true
      }
    ]
  },
  {
    "entity": "STAFF",
    "file": "business/08员工.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "姓名",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "角色",
        "logicalType": "ENUM",
        "required": true
      },
      {
        "name": "所属厅来源编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "联系方式",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "任职状态",
        "logicalType": "ENUM",
        "required": true
      }
    ]
  },
  {
    "entity": "PAYMENT_METHOD",
    "file": "business/09收款方式.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "方式名称",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "状态",
        "logicalType": "ENUM",
        "required": true
      }
    ]
  },
  {
    "entity": "PAYMENT_ACCOUNT",
    "file": "business/10收款账户.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "账户显示名称",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "收款方式来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "状态",
        "logicalType": "ENUM",
        "required": true
      }
    ]
  },
  {
    "entity": "PAYMENT_ACCOUNT_HALL",
    "file": "business/11账户适用厅.csv",
    "columns": [
      {
        "name": "账户来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "厅来源编号",
        "logicalType": "TEXT",
        "required": true
      }
    ]
  },
  {
    "entity": "CUSTOMER",
    "file": "business/04客户.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "原编码",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "名称",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "状态",
        "logicalType": "ENUM",
        "required": true
      }
    ]
  },
  {
    "entity": "SUPPLIER",
    "file": "business/05供应商.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "原编码",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "名称",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "状态",
        "logicalType": "ENUM",
        "required": true
      }
    ]
  },
  {
    "entity": "PRODUCT",
    "file": "business/01商品.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "款号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "商品名称",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "分类路径",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "年份",
        "logicalType": "INTEGER",
        "required": false
      },
      {
        "name": "季节",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "供应商来源编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "尺码组",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "系统货号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "厚薄",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "领型或裤型",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "采购价",
        "logicalType": "MONEY",
        "required": false
      },
      {
        "name": "零售价",
        "logicalType": "MONEY",
        "required": false
      },
      {
        "name": "五级批发价（工厂店供货价）",
        "logicalType": "MONEY",
        "required": false
      },
      {
        "name": "六级批发价（贴牌价）",
        "logicalType": "MONEY",
        "required": false
      },
      {
        "name": "七级批发价（批发价）",
        "logicalType": "MONEY",
        "required": false
      },
      {
        "name": "八级批发价（代理商供货价）",
        "logicalType": "MONEY",
        "required": false
      },
      {
        "name": "九级批发价（工厂店零售价）",
        "logicalType": "MONEY",
        "required": false
      },
      {
        "name": "十级批发价（葛玉珠）",
        "logicalType": "MONEY",
        "required": false
      },
      {
        "name": "最低售价",
        "logicalType": "MONEY",
        "required": false
      },
      {
        "name": "状态",
        "logicalType": "ENUM",
        "required": true
      }
    ]
  },
  {
    "entity": "SKU",
    "file": "business/02合法SKU.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "SKU编码",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "商品来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "颜色编码",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "颜色名称",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "版型编码",
        "logicalType": "ENUM",
        "required": true
      },
      {
        "name": "完整尺码",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "原尺码编码",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "状态",
        "logicalType": "ENUM",
        "required": true
      },
      {
        "name": "切换范围",
        "logicalType": "ENUM",
        "required": true
      },
      {
        "name": "新尺码字典ID",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "新尺码组ID",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "新尺码组名称",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "新尺码编码",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "合并来源SKU数",
        "logicalType": "INTEGER",
        "required": false
      },
      {
        "name": "原尺码编码字段语义",
        "logicalType": "TEXT",
        "required": false
      }
    ]
  },
  {
    "entity": "BARCODE",
    "file": "business/03历史条码.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "条码",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "SKU来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "条码性质",
        "logicalType": "ENUM",
        "required": true
      },
      {
        "name": "原条码方案",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "状态",
        "logicalType": "ENUM",
        "required": true
      },
      {
        "name": "绑定范围",
        "logicalType": "ENUM",
        "required": false
      },
      {
        "name": "商品来源编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "合并前SKU来源编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原始条码性质快照",
        "logicalType": "ENUM",
        "required": false
      },
      {
        "name": "主旧码归一化依据",
        "logicalType": "TEXT",
        "required": false
      }
    ]
  },
  {
    "entity": "INVENTORY_BASELINE",
    "file": "business/12切换库存.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "仓库来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "SKU来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "核准库存数量",
        "logicalType": "INTEGER",
        "required": true
      },
      {
        "name": "核准依据",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "合并输入库存行数",
        "logicalType": "INTEGER",
        "required": false
      },
      {
        "name": "来源单位集合快照",
        "logicalType": "JSON_ARRAY_TEXT",
        "required": false
      },
      {
        "name": "库存行来源编号语义",
        "logicalType": "TEXT",
        "required": false
      }
    ]
  },
  {
    "entity": "SALES_HEADER",
    "file": "business/13历史销货单头.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "原单号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "单据类型",
        "logicalType": "ENUM",
        "required": true
      },
      {
        "name": "业务日期",
        "logicalType": "DATE",
        "required": true
      },
      {
        "name": "所属厅来源编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "营业员来源编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "客户来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "仓库来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "原审核状态",
        "logicalType": "ENUM",
        "required": true
      },
      {
        "name": "优惠前金额",
        "logicalType": "MONEY",
        "required": true
      },
      {
        "name": "整单优惠",
        "logicalType": "MONEY",
        "required": true
      },
      {
        "name": "应结金额",
        "logicalType": "MONEY",
        "required": true
      },
      {
        "name": "备注",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原制单账号编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原创建厅编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原创建时间",
        "logicalType": "DATETIME",
        "required": false
      },
      {
        "name": "原修改时间",
        "logicalType": "DATETIME",
        "required": false
      },
      {
        "name": "原审核账号编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原审核时间",
        "logicalType": "DATETIME",
        "required": false
      },
      {
        "name": "创建厅归属来源",
        "logicalType": "ENUM",
        "required": false
      },
      {
        "name": "创建厅归属原因",
        "logicalType": "TEXT",
        "required": false
      }
    ]
  },
  {
    "entity": "SALES_LINE",
    "file": "business/14历史销货明细.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "单据来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "原行号",
        "logicalType": "INTEGER",
        "required": true
      },
      {
        "name": "SKU来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "原数量",
        "logicalType": "INTEGER",
        "required": true
      },
      {
        "name": "原参考价",
        "logicalType": "MONEY",
        "required": false
      },
      {
        "name": "原成交单价",
        "logicalType": "MONEY",
        "required": true
      },
      {
        "name": "原行金额",
        "logicalType": "MONEY",
        "required": true
      },
      {
        "name": "原分摊优惠",
        "logicalType": "MONEY",
        "required": false
      },
      {
        "name": "原赠品标记",
        "logicalType": "ENUM",
        "required": false
      },
      {
        "name": "原定价方式",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原折扣十分位",
        "logicalType": "INTEGER",
        "required": false
      },
      {
        "name": "原普通零价确认",
        "logicalType": "ENUM",
        "required": false
      },
      {
        "name": "原款号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原品名",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原颜色名称",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原版型名称",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原完整尺码",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原使用条码",
        "logicalType": "TEXT",
        "required": false
      }
    ]
  },
  {
    "entity": "SETTLEMENT",
    "file": "business/15历史收退记录.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "单据来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "原收退行号",
        "logicalType": "INTEGER",
        "required": true
      },
      {
        "name": "账户来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "方向",
        "logicalType": "ENUM",
        "required": true
      },
      {
        "name": "金额",
        "logicalType": "MONEY",
        "required": true
      },
      {
        "name": "原账户显示名",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原方式显示名",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原收款方式来源编号",
        "logicalType": "TEXT",
        "required": false
      }
    ]
  },
  {
    "entity": "TRANSFER_HEADER",
    "file": "business/16历史调拨单头.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "原单号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "业务日期",
        "logicalType": "DATE",
        "required": true
      },
      {
        "name": "调出仓来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "调入仓来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "原审核状态",
        "logicalType": "ENUM",
        "required": true
      },
      {
        "name": "备注",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原制单角色",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原制单账号编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原创建厅编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原创建时间",
        "logicalType": "DATETIME",
        "required": false
      },
      {
        "name": "原修改时间",
        "logicalType": "DATETIME",
        "required": false
      },
      {
        "name": "原审核账号编号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原审核时间",
        "logicalType": "DATETIME",
        "required": false
      },
      {
        "name": "创建厅归属来源",
        "logicalType": "ENUM",
        "required": false
      },
      {
        "name": "创建厅归属原因",
        "logicalType": "TEXT",
        "required": false
      }
    ]
  },
  {
    "entity": "TRANSFER_LINE",
    "file": "business/17历史调拨明细.csv",
    "columns": [
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "单据来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "原行号",
        "logicalType": "INTEGER",
        "required": true
      },
      {
        "name": "SKU来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "原数量",
        "logicalType": "INTEGER",
        "required": true
      },
      {
        "name": "原款号",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原品名",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原颜色名称",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原版型名称",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原完整尺码",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "原使用条码",
        "logicalType": "TEXT",
        "required": false
      }
    ]
  },
  {
    "entity": "ISSUE",
    "file": "business/18待处理.csv",
    "columns": [
      {
        "name": "问题编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "涉及页签",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "来源编号",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "问题字段",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "来源原值",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "问题说明",
        "logicalType": "TEXT",
        "required": true
      },
      {
        "name": "拟处理方式",
        "logicalType": "TEXT",
        "required": false
      },
      {
        "name": "核对结果",
        "logicalType": "ENUM",
        "required": false
      }
    ]
  }
] as const;
