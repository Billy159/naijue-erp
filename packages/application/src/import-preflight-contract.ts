/** Offline v0.3 intake contract. Original 18 business sheets / 154 headers remain unchanged.
 * No database schema, write API, inferred source facts, or production runtime dependency. */
export type ImportFieldType = "TEXT" | "ENUM" | "INTEGER" | "MONEY" | "DATE" | "DATETIME";
export interface ImportFieldContract {
  readonly header: string; readonly type: ImportFieldType; readonly required: boolean;
  readonly allowed?: readonly string[]; readonly referenceEntity?: string;
  /** Approved source snapshot mapping only; not permission to write or infer a value. */
  readonly nativeTarget?: "sales_settlement.payment_method_id_snapshot";
}
export interface ImportSheetContract {
  readonly name: string; readonly entityType: string; readonly fields: readonly ImportFieldContract[];
  /** A missing optional sheet is not an incomplete master-data or permission grant. */
  readonly intakeOptional?: true;
  readonly relationshipUse?: "HISTORICAL_RECOMMENDATION_ONLY_NOT_PERMISSION";
  /** Original ordered columns stay intact. Only an exact approved trailing extension is accepted. */
  readonly optionalTrailingFields?: readonly ImportFieldContract[];
}
export const IMPORT_PREFLIGHT_CONTRACT_VERSION = "0.3-offline-kernel.3";
export const IMPORT_PREFLIGHT_SHEETS: readonly ImportSheetContract[] = [
  {
    "name": "06厅",
    "entityType": "HALL",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*厅名称",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "默认客户来源编号",
        "type": "TEXT",
        "required": false,
        "referenceEntity": "CUSTOMER"
      },
      {
        "header": "默认销货仓来源编号",
        "type": "TEXT",
        "required": false,
        "referenceEntity": "WAREHOUSE"
      },
      {
        "header": "*状态",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "正常",
          "停用"
        ]
      }
    ]
  },
  {
    "name": "07仓库",
    "entityType": "WAREHOUSE",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*仓库名称",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*所属厅来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "HALL"
      },
      {
        "header": "*状态",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "正常",
          "停用"
        ]
      },
      {
        "header": "*切换范围",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "待核",
          "本次完整核准",
          "不在本次范围"
        ]
      }
    ]
  },
  {
    "name": "08员工",
    "entityType": "STAFF",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*姓名",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*角色",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "管理员",
          "仓库",
          "营业员"
        ]
      },
      {
        "header": "所属厅来源编号",
        "type": "TEXT",
        "required": false,
        "referenceEntity": "HALL"
      },
      {
        "header": "联系方式",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "*任职状态",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "在职",
          "离职"
        ]
      }
    ]
  },
  {
    "name": "09收款方式",
    "entityType": "PAYMENT_METHOD",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*方式名称",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*状态",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "正常",
          "停用"
        ]
      }
    ]
  },
  {
    "name": "10收款账户",
    "entityType": "PAYMENT_ACCOUNT",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*账户显示名称",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*收款方式来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "PAYMENT_METHOD"
      },
      {
        "header": "*状态",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "正常",
          "停用"
        ]
      }
    ]
  },
  {
    "name": "11账户适用厅",
    "entityType": "PAYMENT_ACCOUNT_HALL",
    "intakeOptional": true,
    "relationshipUse": "HISTORICAL_RECOMMENDATION_ONLY_NOT_PERMISSION",
    "fields": [
      {
        "header": "*账户来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "PAYMENT_ACCOUNT"
      },
      {
        "header": "*厅来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "HALL"
      }
    ]
  },
  {
    "name": "04客户",
    "entityType": "CUSTOMER",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*原编码",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*名称",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*状态",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "正常",
          "停用"
        ]
      }
    ]
  },
  {
    "name": "05供应商",
    "entityType": "SUPPLIER",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*原编码",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*名称",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*状态",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "正常",
          "停用"
        ]
      }
    ]
  },
  {
    "name": "01商品",
    "entityType": "PRODUCT",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*款号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*商品名称",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*分类路径",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "年份",
        "type": "INTEGER",
        "required": false
      },
      {
        "header": "季节",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "供应商来源编号",
        "type": "TEXT",
        "required": false,
        "referenceEntity": "SUPPLIER"
      },
      {
        "header": "*尺码组",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "系统货号",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "厚薄",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "领型或裤型",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "采购价",
        "type": "MONEY",
        "required": false
      },
      {
        "header": "零售价",
        "type": "MONEY",
        "required": false
      },
      {
        "header": "五级批发价（工厂店供货价）",
        "type": "MONEY",
        "required": false
      },
      {
        "header": "六级批发价（贴牌价）",
        "type": "MONEY",
        "required": false
      },
      {
        "header": "七级批发价（批发价）",
        "type": "MONEY",
        "required": false
      },
      {
        "header": "八级批发价（代理商供货价）",
        "type": "MONEY",
        "required": false
      },
      {
        "header": "九级批发价（工厂店零售价）",
        "type": "MONEY",
        "required": false
      },
      {
        "header": "十级批发价（葛玉珠）",
        "type": "MONEY",
        "required": false
      },
      {
        "header": "最低售价",
        "type": "MONEY",
        "required": false
      },
      {
        "header": "*状态",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "正常",
          "停用"
        ]
      }
    ]
  },
  {
    "name": "02合法SKU",
    "entityType": "SKU",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*SKU编码",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*商品来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "PRODUCT"
      },
      {
        "header": "*颜色编码",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*颜色名称",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*版型编码",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "Y",
          "A",
          "B",
          "C",
          "D",
          "E"
        ]
      },
      {
        "header": "*完整尺码",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "原尺码编码",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "*状态",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "正常",
          "停用"
        ]
      },
      {
        "header": "*切换范围",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "待核",
          "本次完整核准",
          "不在本次范围"
        ]
      }
    ]
  },
  {
    "name": "03历史条码",
    "entityType": "BARCODE",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*条码",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*SKU来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "SKU"
      },
      {
        "header": "*条码性质",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "主码",
          "已确认旧码"
        ]
      },
      {
        "header": "原条码方案",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "*状态",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "正常",
          "停用"
        ]
      }
    ]
  },
  {
    "name": "12切换库存",
    "entityType": "INVENTORY_BASELINE",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*仓库来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "WAREHOUSE"
      },
      {
        "header": "*SKU来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "SKU"
      },
      {
        "header": "*核准库存数量",
        "type": "INTEGER",
        "required": true
      },
      {
        "header": "*核准依据",
        "type": "TEXT",
        "required": true
      }
    ]
  },
  {
    "name": "13历史销货单头",
    "entityType": "SALES_HEADER",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*原单号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*单据类型",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "销售",
          "退货",
          "换货"
        ]
      },
      {
        "header": "*业务日期",
        "type": "DATE",
        "required": true
      },
      {
        "header": "所属厅来源编号",
        "type": "TEXT",
        "required": false,
        "referenceEntity": "HALL"
      },
      {
        "header": "营业员来源编号",
        "type": "TEXT",
        "required": false,
        "referenceEntity": "STAFF"
      },
      {
        "header": "*客户来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "CUSTOMER"
      },
      {
        "header": "*仓库来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "WAREHOUSE"
      },
      {
        "header": "*原审核状态",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "未审核",
          "已审核",
          "已作废"
        ]
      },
      {
        "header": "*优惠前金额",
        "type": "MONEY",
        "required": true
      },
      {
        "header": "*整单优惠",
        "type": "MONEY",
        "required": true
      },
      {
        "header": "*应结金额",
        "type": "MONEY",
        "required": true
      },
      {
        "header": "备注",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原制单账号编号",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原创建厅编号",
        "type": "TEXT",
        "required": false,
        "referenceEntity": "HALL"
      },
      {
        "header": "原创建时间",
        "type": "DATETIME",
        "required": false
      },
      {
        "header": "原修改时间",
        "type": "DATETIME",
        "required": false
      },
      {
        "header": "原审核账号编号",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原审核时间",
        "type": "DATETIME",
        "required": false
      }
    ]
  },
  {
    "name": "14历史销货明细",
    "entityType": "SALES_LINE",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*单据来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "SALES_HEADER"
      },
      {
        "header": "*原行号",
        "type": "INTEGER",
        "required": true
      },
      {
        "header": "*SKU来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "SKU"
      },
      {
        "header": "*原数量",
        "type": "INTEGER",
        "required": true
      },
      {
        "header": "原参考价",
        "type": "MONEY",
        "required": false
      },
      {
        "header": "*原成交单价",
        "type": "MONEY",
        "required": true
      },
      {
        "header": "*原行金额",
        "type": "MONEY",
        "required": true
      },
      {
        "header": "原分摊优惠",
        "type": "MONEY",
        "required": false
      },
      {
        "header": "原赠品标记",
        "type": "ENUM",
        "required": false,
        "allowed": [
          "是",
          "否"
        ]
      },
      {
        "header": "原定价方式",
        "type": "TEXT",
        "required": false,
        "allowed": [
          "UNIT_PRICE",
          "DISCOUNT"
        ]
      },
      {
        "header": "原折扣十分位",
        "type": "INTEGER",
        "required": false
      },
      {
        "header": "原普通零价确认",
        "type": "ENUM",
        "required": false,
        "allowed": [
          "是",
          "否"
        ]
      },
      {
        "header": "原款号",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原品名",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原颜色名称",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原版型名称",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原完整尺码",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原使用条码",
        "type": "TEXT",
        "required": false
      }
    ]
  },
  {
    "name": "15历史收退记录",
    "entityType": "SETTLEMENT",
    "optionalTrailingFields": [
      {
        "header": "原收款方式来源编号",
        "type": "TEXT",
        "required": false,
        "referenceEntity": "PAYMENT_METHOD",
        "nativeTarget": "sales_settlement.payment_method_id_snapshot"
      }
    ],
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*单据来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "SALES_HEADER"
      },
      {
        "header": "*原收退行号",
        "type": "INTEGER",
        "required": true
      },
      {
        "header": "*账户来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "PAYMENT_ACCOUNT"
      },
      {
        "header": "*方向",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "收款",
          "退款"
        ]
      },
      {
        "header": "*金额",
        "type": "MONEY",
        "required": true
      },
      {
        "header": "原账户显示名",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原方式显示名",
        "type": "TEXT",
        "required": false
      }
    ]
  },
  {
    "name": "16历史调拨单头",
    "entityType": "TRANSFER_HEADER",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*原单号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*业务日期",
        "type": "DATE",
        "required": true
      },
      {
        "header": "*调出仓来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "WAREHOUSE"
      },
      {
        "header": "*调入仓来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "WAREHOUSE"
      },
      {
        "header": "*原审核状态",
        "type": "ENUM",
        "required": true,
        "allowed": [
          "未审核",
          "已审核",
          "已作废"
        ]
      },
      {
        "header": "备注",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原制单角色",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原制单账号编号",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原创建厅编号",
        "type": "TEXT",
        "required": false,
        "referenceEntity": "HALL"
      },
      {
        "header": "原创建时间",
        "type": "DATETIME",
        "required": false
      },
      {
        "header": "原修改时间",
        "type": "DATETIME",
        "required": false
      },
      {
        "header": "原审核账号编号",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原审核时间",
        "type": "DATETIME",
        "required": false
      }
    ]
  },
  {
    "name": "17历史调拨明细",
    "entityType": "TRANSFER_LINE",
    "fields": [
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*单据来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "TRANSFER_HEADER"
      },
      {
        "header": "*原行号",
        "type": "INTEGER",
        "required": true
      },
      {
        "header": "*SKU来源编号",
        "type": "TEXT",
        "required": true,
        "referenceEntity": "SKU"
      },
      {
        "header": "*原数量",
        "type": "INTEGER",
        "required": true
      },
      {
        "header": "原款号",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原品名",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原颜色名称",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原版型名称",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原完整尺码",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "原使用条码",
        "type": "TEXT",
        "required": false
      }
    ]
  },
  {
    "name": "18待处理",
    "entityType": "ISSUE",
    "fields": [
      {
        "header": "*问题编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*涉及页签",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*来源编号",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "*问题字段",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "来源原值",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "*问题说明",
        "type": "TEXT",
        "required": true
      },
      {
        "header": "拟处理方式",
        "type": "TEXT",
        "required": false
      },
      {
        "header": "核对结果",
        "type": "ENUM",
        "required": false,
        "allowed": [
          "待核",
          "已核待确认",
          "已解决",
          "明确排除"
        ]
      }
    ]
  }
];
export const IMPORT_PREFLIGHT_GUIDE_SHEETS: readonly string[] = ["字段说明", "示例勿导入", "样例说明", "样例金额核对", "切换与历史边界", "分摊与舍入说明"];
/** Retained as raw source evidence, never interpreted as publication approval. */
export const IMPORT_PREFLIGHT_SUPPORT_SHEETS: readonly string[] = ["切换核准"];
