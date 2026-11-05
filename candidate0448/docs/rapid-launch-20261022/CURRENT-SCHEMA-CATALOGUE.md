# 现有 50 表 / 516 字段静态目录

这是迁移0001–0019的静态源码目录，不是生产实库盘点。每表中文用途和全部列声明来自随附快照；可空字段允许保留未提供/未知，不能当作0或默认值；NOT NULL或主键必须由可信业务/服务器事实提供。早期内联约束可能被后续ALTER替代，表后保留全部原ALTER来源；有效新增变更另见确认单，不将本目录当可直接执行DDL。

## schema_migration - 数据库迁移版本登记

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: version

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| version | integer PRIMARY KEY | 必填 |
| description | text NOT NULL | 必填 |
| applied_at | timestamptz NOT NULL DEFAULT transaction_timestamp() | 必填 |

## customer - 客户

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| code | text NOT NULL UNIQUE | 必填 |
| name | text NOT NULL | 必填 |
| enabled | boolean NOT NULL | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |
| created_at | timestamptz | 可空 |
| updated_at | timestamptz | 可空 |

## supplier - 供应商

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| code | text NOT NULL UNIQUE | 必填 |
| name | text NOT NULL | 必填 |
| enabled | boolean NOT NULL | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |
| created_at | timestamptz | 可空 |
| updated_at | timestamptz | 可空 |

## hall - 营业厅及默认客户/销售仓

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| name | text NOT NULL | 必填 |
| default_customer_id | uuid REFERENCES naijue_erp.customer(id) | 可空 |
| default_sales_warehouse_id | uuid | 可空 |
| enabled | boolean NOT NULL | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |

## warehouse - 仓库及唯一所属厅

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| hall_id | uuid NOT NULL REFERENCES naijue_erp.hall(id) | 必填 |
| name | text NOT NULL | 必填 |
| enabled | boolean NOT NULL | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |

## staff - 员工资料和业务角色

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| name | text NOT NULL | 必填 |
| hall_id | uuid REFERENCES naijue_erp.hall(id) | 可空 |
| role | text NOT NULL | 必填 |
| contact | text | 可空 |
| employment_status | text NOT NULL | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |

## user_account - 登录账号、密码摘要与会话失效版本

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| staff_id | uuid NOT NULL UNIQUE REFERENCES naijue_erp.staff(id) | 必填 |
| login_name | text NOT NULL UNIQUE | 必填 |
| password_hash | text NOT NULL | 必填 |
| login_enabled | boolean NOT NULL | 必填 |
| auth_version | integer NOT NULL CHECK (auth_version > 0) | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |
| created_at | timestamptz NOT NULL | 必填 |
| updated_at | timestamptz NOT NULL | 必填 |

## product_category - 商品分类树

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| parent_id | uuid REFERENCES naijue_erp.product_category(id) | 可空 |
| name | text NOT NULL | 必填 |
| display_order | integer NOT NULL | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |

## color - 颜色字典

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| code | text NOT NULL UNIQUE | 必填 |
| name | text NOT NULL | 必填 |
| enabled | boolean NOT NULL | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |

## fit - 版型字典

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| code | text NOT NULL UNIQUE CHECK (code ~ '^[A-Z]$') | 必填 |
| name | text NOT NULL | 必填 |
| enabled | boolean NOT NULL | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |

## size - 尺码身份

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| code | text | 可空 |
| name | text NOT NULL | 必填 |

## size_group - 尺码组（只读）

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| code | text NOT NULL UNIQUE | 必填 |
| name | text NOT NULL | 必填 |

## size_group_member - 尺码组成员及顺序

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: PRIMARY KEY (size_group_id, size_id)

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| size_group_id | uuid NOT NULL REFERENCES naijue_erp.size_group(id) | 必填 |
| size_id | uuid NOT NULL REFERENCES naijue_erp.size(id) | 必填 |
| display_order | integer NOT NULL | 必填 |

```sql
PRIMARY KEY (size_group_id, size_id)
```

## season - 季节字典（只读）

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| code | text NOT NULL UNIQUE | 必填 |
| name | text NOT NULL | 必填 |
| display_order | integer NOT NULL | 必填 |

## product - 商品款号/基础属性/整款九价

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| product_code | text NOT NULL UNIQUE | 必填 |
| name | text NOT NULL | 必填 |
| category_id | uuid NOT NULL REFERENCES naijue_erp.product_category(id) | 必填 |
| supplier_id | uuid REFERENCES naijue_erp.supplier(id) | 可空 |
| season_id | uuid REFERENCES naijue_erp.season(id) | 可空 |
| size_group_id | uuid NOT NULL REFERENCES naijue_erp.size_group(id) | 必填 |
| retail_price | decimal(18,2) CHECK (retail_price >= 0) | 可空 |
| enabled | boolean NOT NULL | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |
| year | integer | 可空 |
| system_item_code | text | 可空 |
| thickness | text | 可空 |
| collar_pants_type | text | 可空 |
| purchase_price | decimal(18,2) CHECK (purchase_price >= 0) | 可空 |
| wholesale5_price | decimal(18,2) CHECK (wholesale5_price >= 0) | 可空 |
| wholesale6_price | decimal(18,2) CHECK (wholesale6_price >= 0) | 可空 |
| wholesale7_price | decimal(18,2) CHECK (wholesale7_price >= 0) | 可空 |
| wholesale8_price | decimal(18,2) CHECK (wholesale8_price >= 0) | 可空 |
| wholesale9_price | decimal(18,2) CHECK (wholesale9_price >= 0) | 可空 |
| wholesale10_price | decimal(18,2) CHECK (wholesale10_price >= 0) | 可空 |
| minimum_price | decimal(18,2) CHECK (minimum_price >= 0) | 可空 |

## sku - 商品颜色版型尺码的实际规格

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| product_id | uuid NOT NULL REFERENCES naijue_erp.product(id) | 必填 |
| color_id | uuid NOT NULL REFERENCES naijue_erp.color(id) | 必填 |
| fit_id | uuid NOT NULL REFERENCES naijue_erp.fit(id) | 必填 |
| size_id | uuid NOT NULL REFERENCES naijue_erp.size(id) | 必填 |
| sku_code | text NOT NULL UNIQUE | 必填 |
| enabled | boolean NOT NULL | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |

```sql
UNIQUE (product_id, color_id, fit_id, size_id)
```

## payment_method - 收款方式

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| name | text NOT NULL | 必填 |
| enabled | boolean NOT NULL | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |

## payment_account - 资金账户

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| name | text NOT NULL | 必填 |
| payment_method_id | uuid NOT NULL REFERENCES naijue_erp.payment_method(id) | 必填 |
| enabled | boolean NOT NULL | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |

## payment_account_hall - 资金账户适用营业厅（多厅）

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: PRIMARY KEY (payment_account_id, hall_id)

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| payment_account_id | uuid NOT NULL REFERENCES naijue_erp.payment_account(id) | 必填 |
| hall_id | uuid NOT NULL REFERENCES naijue_erp.hall(id) | 必填 |

```sql
PRIMARY KEY (payment_account_id, hall_id)
```

## sales_header - 当前销货/独立退货/换货单头

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| number | text NOT NULL CHECK (length(number) > 0) | 必填 |
| business_type | text NOT NULL CHECK (business_type IN ('SALE', 'RETURN', 'EXCHANGE')) | 必填 |
| business_date | date NOT NULL | 必填 |
| hall_id | uuid NOT NULL REFERENCES naijue_erp.hall(id) | 必填 |
| salesperson_id | uuid REFERENCES naijue_erp.staff(id) | 可空 |
| customer_id | uuid NOT NULL REFERENCES naijue_erp.customer(id) | 必填 |
| warehouse_id | uuid NOT NULL REFERENCES naijue_erp.warehouse(id) | 必填 |
| status | text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'VOID')) | 必填 |
| gross_amount | decimal(18,2) NOT NULL | 必填 |
| order_discount | decimal(18,2) NOT NULL CHECK (order_discount >= 0) | 必填 |
| net_due | decimal(18,2) NOT NULL | 必填 |
| note | text | 可空 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |
| created_by_account_id | uuid NOT NULL REFERENCES naijue_erp.user_account(id) | 必填 |
| created_hall_id | uuid REFERENCES naijue_erp.hall(id) | 可空 |
| created_at | timestamptz NOT NULL | 必填 |
| updated_at | timestamptz NOT NULL | 必填 |
| approved_by_account_id | uuid REFERENCES naijue_erp.user_account(id) | 可空 |
| approved_at | timestamptz | 可空 |
| stock_basis | text NOT NULL CHECK (stock_basis IN ('RUNTIME_LEDGER', 'CUTOFF_HISTORY')) | 必填 |
| import_batch_id | uuid REFERENCES naijue_erp.import_batch(id) | 可空 |

```sql
CHECK ((status = 'APPROVED' AND approved_by_account_id IS NOT NULL AND approved_at IS NOT NULL)
    OR (status <> 'APPROVED' AND approved_by_account_id IS NULL AND approved_at IS NULL))
```

## sales_line - 当前销货明细、价格事实与名称快照

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| sales_id | uuid NOT NULL REFERENCES naijue_erp.sales_header(id) | 必填 |
| line_no | integer NOT NULL CHECK (line_no > 0) | 必填 |
| sku_id | uuid NOT NULL REFERENCES naijue_erp.sku(id) | 必填 |
| quantity | bigint NOT NULL | 必填 |
| reference_price | decimal(18,2) CHECK (reference_price >= 0) | 可空 |
| deal_price | decimal(18,2) NOT NULL CHECK (deal_price >= 0) | 必填 |
| line_amount | decimal(18,2) NOT NULL | 必填 |
| allocated_discount | decimal(18,2) NOT NULL CHECK (allocated_discount >= 0) | 必填 |
| is_gift | boolean NOT NULL | 必填 |
| product_code_snapshot | text NOT NULL | 必填 |
| product_name_snapshot | text NOT NULL | 必填 |
| color_name_snapshot | text NOT NULL | 必填 |
| fit_name_snapshot | text NOT NULL | 必填 |
| size_name_snapshot | text NOT NULL | 必填 |
| barcode_snapshot | text | 可空 |
| is_current | boolean NOT NULL | 必填 |
| pricing_rule | text | 可空 |
| discount_tenths | integer | 可空 |
| zero_confirmed | boolean | 可空 |

## sales_settlement - 单据收款/退款明细

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| sales_id | uuid NOT NULL REFERENCES naijue_erp.sales_header(id) | 必填 |
| line_no | integer NOT NULL CHECK (line_no > 0) | 必填 |
| payment_account_id | uuid NOT NULL REFERENCES naijue_erp.payment_account(id) | 必填 |
| direction | text NOT NULL CHECK (direction IN ('RECEIVE', 'REFUND')) | 必填 |
| amount | decimal(18,2) NOT NULL CHECK (amount >= 0) | 必填 |
| account_name_snapshot | text NOT NULL | 必填 |
| method_name_snapshot | text NOT NULL | 必填 |
| payment_method_id_snapshot | uuid REFERENCES naijue_erp.payment_method(id) | 可空 |

```sql
UNIQUE (sales_id, line_no) DEFERRABLE INITIALLY DEFERRED
```

## operation_receipt - 请求幂等与已提交操作回执

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| actor_account_id | uuid NOT NULL REFERENCES naijue_erp.user_account(id) | 必填 |
| request_key | text NOT NULL CHECK (length(request_key) > 0) | 必填 |
| request_hash | text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$') | 必填 |
| action | text NOT NULL CHECK (action IN ('SAVE', 'APPROVE', 'UNAPPROVE', 'VOID')) | 必填 |
| target_type | text NOT NULL CHECK (target_type = 'SALES') | 必填 |
| target_id | uuid NOT NULL REFERENCES naijue_erp.sales_header(id) | 必填 |
| status | text NOT NULL CHECK (status = 'COMMITTED') | 必填 |
| result_data | jsonb NOT NULL | 必填 |
| created_at | timestamptz NOT NULL DEFAULT transaction_timestamp() | 必填 |
| completed_at | timestamptz NOT NULL | 必填 |
| target_sales_id | uuid GENERATED ALWAYS AS (CASE WHEN target_type = 'SALES' THEN target_id END) STORED REFERENCES naijue_erp.sales_header(id) | 可空 |
| target_transfer_id | uuid GENERATED ALWAYS AS (CASE WHEN target_type = 'TRANSFER' THEN target_id END) STORED REFERENCES naijue_erp.transfer_header(id) | 可空 |
| target_customer_id | uuid GENERATED ALWAYS AS (CASE WHEN target_type = 'CUSTOMER' THEN target_id END) STORED REFERENCES naijue_erp.customer(id) | 可空 |
| target_supplier_id | uuid GENERATED ALWAYS AS (CASE WHEN target_type = 'SUPPLIER' THEN target_id END) STORED REFERENCES naijue_erp.supplier(id) | 可空 |

```sql
UNIQUE (actor_account_id, request_key)
UNIQUE (id, actor_account_id, target_id, action)
CHECK (jsonb_typeof(result_data) = 'object' AND result_data ?& ARRAY['operationId', 'salesId', 'version', 'status', 'ledgerEntryIds']
    AND jsonb_typeof(result_data->'operationId') = 'string' AND jsonb_typeof(result_data->'salesId') = 'string'
    AND (result_data->>'operationId') IS NOT DISTINCT FROM id::text
    AND (result_data->>'salesId') IS NOT DISTINCT FROM target_id::text
    AND jsonb_typeof(result_data->'version') = 'number' AND jsonb_typeof(result_data->'status') = 'string'
    AND jsonb_typeof(result_data->'ledgerEntryIds') = 'array')
```

## audit_change - 业务修改前后值和操作者审计

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| operation_id | uuid NOT NULL UNIQUE | 必填 |
| actor_account_id | uuid NOT NULL REFERENCES naijue_erp.user_account(id) | 必填 |
| object_type | text NOT NULL CHECK (object_type = 'SALES') | 必填 |
| object_id | uuid NOT NULL REFERENCES naijue_erp.sales_header(id) | 必填 |
| action | text NOT NULL CHECK (action IN ('SAVE', 'APPROVE', 'UNAPPROVE', 'VOID')) | 必填 |
| old_version | integer CHECK (old_version > 0) | 可空 |
| new_version | integer NOT NULL CHECK (new_version > 0) | 必填 |
| before_values | jsonb | 可空 |
| after_values | jsonb NOT NULL | 必填 |
| occurred_at | timestamptz NOT NULL | 必填 |
| object_sales_id | uuid GENERATED ALWAYS AS (CASE WHEN object_type = 'SALES' THEN object_id END) STORED REFERENCES naijue_erp.sales_header(id) | 可空 |
| object_transfer_id | uuid GENERATED ALWAYS AS (CASE WHEN object_type = 'TRANSFER' THEN object_id END) STORED REFERENCES naijue_erp.transfer_header(id) | 可空 |
| object_customer_id | uuid GENERATED ALWAYS AS (CASE WHEN object_type = 'CUSTOMER' THEN object_id END) STORED REFERENCES naijue_erp.customer(id) | 可空 |
| object_supplier_id | uuid GENERATED ALWAYS AS (CASE WHEN object_type = 'SUPPLIER' THEN object_id END) STORED REFERENCES naijue_erp.supplier(id) | 可空 |

```sql
UNIQUE (operation_id, object_id)
CHECK (new_version = COALESCE(old_version, 0) + 1)
FOREIGN KEY (operation_id, actor_account_id, object_id, action)
    REFERENCES naijue_erp.operation_receipt (id, actor_account_id, target_id, action) DEFERRABLE INITIALLY DEFERRED
```

## inventory_ledger - 不可变库存变动流水

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| operation_id | uuid NOT NULL REFERENCES naijue_erp.operation_receipt(id) DEFERRABLE INITIALLY DEFERRED | 必填 |
| event_kind | text NOT NULL CHECK (event_kind IN ('APPROVE', 'UNAPPROVE')) | 必填 |
| warehouse_id | uuid NOT NULL REFERENCES naijue_erp.warehouse(id) | 必填 |
| sku_id | uuid NOT NULL REFERENCES naijue_erp.sku(id) | 必填 |
| quantity_delta | bigint NOT NULL CHECK (quantity_delta <> 0) | 必填 |
| source_sales_line_id | uuid REFERENCES naijue_erp.sales_line(id) | 可空 |
| endpoint | text NOT NULL CHECK (endpoint = 'SALES_WAREHOUSE') | 必填 |
| source_document_version | integer CHECK (source_document_version > 0) | 可空 |
| reverses_entry_id | uuid UNIQUE REFERENCES naijue_erp.inventory_ledger(id) | 可空 |
| business_date | date NOT NULL | 必填 |
| posted_at | timestamptz NOT NULL | 必填 |
| source_transfer_line_id | uuid REFERENCES naijue_erp.transfer_line(id) | 可空 |
| source_import_batch_id | uuid REFERENCES naijue_erp.import_batch(id) | 可空 |

```sql
UNIQUE (operation_id, source_sales_line_id, endpoint)
CHECK ((event_kind = 'UNAPPROVE') = (reverses_entry_id IS NOT NULL))
```

## inventory_balance - 仓库/SKU当前库存余额

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0001_runtime_sales.sql`
- 主键: PRIMARY KEY (warehouse_id, sku_id)

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| warehouse_id | uuid NOT NULL REFERENCES naijue_erp.warehouse(id) | 必填 |
| sku_id | uuid NOT NULL REFERENCES naijue_erp.sku(id) | 必填 |
| quantity | bigint NOT NULL | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |
| last_operation_id | uuid REFERENCES naijue_erp.operation_receipt(id) DEFERRABLE INITIALLY DEFERRED | 可空 |
| updated_at | timestamptz NOT NULL | 必填 |

```sql
PRIMARY KEY (warehouse_id, sku_id)
```

## auth_session - 登录会话

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0003_auth_sessions.sql`
- 主键: token_hash

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| token_hash | text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$') | 必填 |
| account_id | uuid NOT NULL REFERENCES naijue_erp.user_account(id) | 必填 |
| auth_version | integer NOT NULL CHECK (auth_version > 0) | 必填 |
| created_at | timestamptz NOT NULL | 必填 |
| expires_at | timestamptz NOT NULL | 必填 |
| revoked_at | timestamptz | 可空 |

```sql
CHECK (expires_at > created_at)
```

## transfer_header - 当前调拨单头

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0004_transfer_runtime.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| number | text NOT NULL CHECK (length(number) > 0) | 必填 |
| business_date | date NOT NULL | 必填 |
| from_warehouse_id | uuid NOT NULL REFERENCES naijue_erp.warehouse(id) | 必填 |
| to_warehouse_id | uuid NOT NULL REFERENCES naijue_erp.warehouse(id) | 必填 |
| status | text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'VOID')) | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |
| note | text | 可空 |
| created_by_account_id | uuid NOT NULL REFERENCES naijue_erp.user_account(id) | 必填 |
| created_hall_id | uuid REFERENCES naijue_erp.hall(id) | 可空 |
| created_role | text NOT NULL CHECK (created_role IN ('ADMIN', 'WAREHOUSE', 'SALESPERSON')) | 必填 |
| created_at | timestamptz NOT NULL | 必填 |
| updated_at | timestamptz NOT NULL | 必填 |
| approved_by_account_id | uuid REFERENCES naijue_erp.user_account(id) | 可空 |
| approved_at | timestamptz | 可空 |
| stock_basis | text NOT NULL CHECK (stock_basis IN ('RUNTIME_LEDGER', 'CUTOFF_HISTORY')) | 必填 |
| import_batch_id | uuid REFERENCES naijue_erp.import_batch(id) | 可空 |

```sql
CHECK (from_warehouse_id <> to_warehouse_id)
CHECK ((status = 'APPROVED' AND approved_by_account_id IS NOT NULL AND approved_at IS NOT NULL)
    OR (status <> 'APPROVED' AND approved_by_account_id IS NULL AND approved_at IS NULL))
```

## transfer_line - 当前调拨规格明细

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0004_transfer_runtime.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| transfer_id | uuid NOT NULL REFERENCES naijue_erp.transfer_header(id) | 必填 |
| line_no | integer NOT NULL CHECK (line_no > 0) | 必填 |
| sku_id | uuid NOT NULL REFERENCES naijue_erp.sku(id) | 必填 |
| quantity | bigint NOT NULL CHECK (quantity > 0) | 必填 |
| product_code_snapshot | text NOT NULL | 必填 |
| product_name_snapshot | text NOT NULL | 必填 |
| color_name_snapshot | text NOT NULL | 必填 |
| fit_name_snapshot | text NOT NULL | 必填 |
| size_name_snapshot | text NOT NULL | 必填 |
| barcode_snapshot | text | 可空 |
| is_current | boolean NOT NULL | 必填 |
| current_line_no | integer GENERATED ALWAYS AS (CASE WHEN is_current THEN line_no END) STORED | 可空 |

```sql
CONSTRAINT transfer_line_current_position UNIQUE (transfer_id, current_line_no) DEFERRABLE INITIALLY DEFERRED
```

## product_image - 受控商品图片索引

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0005_product_read_fields.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| product_id | uuid NOT NULL REFERENCES naijue_erp.product(id) | 必填 |
| file_ref | text NOT NULL CHECK (length(file_ref) > 0) | 必填 |
| mime | text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')) | 必填 |
| byte_size | bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608) | 必填 |
| display_order | integer NOT NULL | 必填 |
| created_at | timestamptz NOT NULL | 必填 |
| created_by_account_id | uuid REFERENCES naijue_erp.user_account(id) | 可空 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |

## import_batch - 导入批次及发布状态

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| source_name | text NOT NULL CHECK (source_name ~ '^[a-z][a-z0-9_.:-]*$') | 必填 |
| source_manifest_ref | text NOT NULL CHECK (length(btrim(source_manifest_ref)) > 0) | 必填 |
| source_hash | text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$') | 必填 |
| cutoff_at | timestamptz NOT NULL | 必填 |
| mapping_version | text NOT NULL CHECK (length(btrim(mapping_version)) > 0) | 必填 |
| inventory_mode | text NOT NULL CHECK (inventory_mode = 'CUTOFF_STOCK_BASELINE') | 必填 |
| status | text NOT NULL CHECK (status IN ('STAGED', 'VALIDATING', 'PASSED', 'IMPORTED', 'FAILED')) | 必填 |
| checkpoint | jsonb NOT NULL | 必填 |
| created_at | timestamptz NOT NULL | 必填 |
| completed_at | timestamptz | 可空 |
| history_expected_counts | jsonb CHECK (history_expected_counts IS NULL OR naijue_erp.valid_history_counts(history_expected_counts)) | 可空 |
| history_actual_counts | jsonb CHECK (history_actual_counts IS NULL OR naijue_erp.valid_history_counts(history_actual_counts)) | 可空 |
| history_payload_hash | text CHECK (history_payload_hash ~ '^[0-9a-f]{64}$') | 可空 |
| history_validation_passed | boolean NOT NULL DEFAULT false | 必填 |

```sql
CHECK ((status = 'IMPORTED') = (completed_at IS NOT NULL))
CHECK ((jsonb_typeof(checkpoint) = 'object' AND checkpoint ?& ARRAY['sequence', 'cursor', 'counts', 'expected']
    AND (checkpoint - ARRAY['sequence', 'cursor', 'counts', 'expected']) = '{}'::jsonb
    AND checkpoint->>'sequence' ~ '^[0-9]+$' AND checkpoint->>'cursor' ~ '^[0-9]+$'
    AND jsonb_typeof(checkpoint->'counts') = 'object' AND jsonb_typeof(checkpoint->'expected') = 'object') IS TRUE)
```

## import_record - 逐实体导入记录

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| import_batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| source_entity_type | text NOT NULL CHECK (length(btrim(source_entity_type)) > 0) | 必填 |
| source_key | text NOT NULL CHECK (length(source_key) > 0) | 必填 |
| source_record_hash | text NOT NULL CHECK (source_record_hash ~ '^[0-9a-f]{64}$') | 必填 |
| source_file_ref | text NOT NULL CHECK (length(btrim(source_file_ref)) > 0) | 必填 |
| target_type | text CHECK (target_type IN ('WAREHOUSE', 'SKU', 'INVENTORY_LEDGER', 'IMPORT_BATCH')) | 可空 |
| target_id | uuid | 可空 |
| status | text NOT NULL CHECK (status IN ('ACCEPTED', 'QUARANTINED', 'EXCLUDED', 'CONFLICT', 'IMPORTED')) | 必填 |
| decision_reason | text | 可空 |
| reviewed_at | timestamptz | 可空 |

```sql
UNIQUE (import_batch_id, source_entity_type, source_key)
CHECK ((target_type IS NULL) = (target_id IS NULL))
CHECK (status <> 'IMPORTED' OR (target_type IS NOT NULL AND reviewed_at IS NOT NULL))
```

## barcode_scheme - 已确认条码方案描述

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0009_catalogue_prices_barcodes.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| name | text NOT NULL CHECK (length(btrim(name)) > 0) | 必填 |
| barcode_type | text NOT NULL CHECK (length(btrim(barcode_type)) > 0) | 必填 |
| rule_description | text NOT NULL CHECK (length(btrim(rule_description)) > 0) | 必填 |
| code_length | integer CHECK (code_length > 0) | 可空 |
| rule_version | text NOT NULL CHECK (length(btrim(rule_version)) > 0) | 必填 |
| status | text NOT NULL CHECK (status IN ('CURRENT', 'HISTORICAL')) | 必填 |

## sku_barcode - 原始条码与SKU绑定

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0009_catalogue_prices_barcodes.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| barcode | text COLLATE "C" NOT NULL UNIQUE CHECK (length(barcode) > 0) | 必填 |
| sku_id | uuid NOT NULL REFERENCES naijue_erp.sku(id) | 必填 |
| barcode_kind | text NOT NULL CHECK (barcode_kind IN ('MAIN', 'CONFIRMED_OLD')) | 必填 |
| scheme_id | uuid REFERENCES naijue_erp.barcode_scheme(id) | 可空 |
| enabled | boolean NOT NULL | 必填 |

## import_source_row - 不可变导入原始行与字段来源

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0011_history_storage.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| entity_type | text NOT NULL CHECK (length(entity_type) > 0) | 必填 |
| source_key | text NOT NULL CHECK (length(source_key) > 0) | 必填 |
| file_ref | text NOT NULL | 必填 |
| sheet | text NOT NULL | 必填 |
| row_no | bigint NOT NULL CHECK (row_no > 0) | 必填 |
| source_file_sha256 | text NOT NULL CHECK (source_file_sha256 ~ '^[0-9a-f]{64}$') | 必填 |
| row_sha256 | text NOT NULL CHECK (row_sha256 ~ '^[0-9a-f]{64}$') | 必填 |
| raw_fields | jsonb NOT NULL CHECK (jsonb_typeof(raw_fields) = 'object') | 必填 |
| normalized_fields | jsonb NOT NULL CHECK (jsonb_typeof(normalized_fields) = 'object') | 必填 |
| field_provenance | jsonb NOT NULL CHECK ((jsonb_typeof(field_provenance) = 'object' AND field_provenance->'schema_version' = '1'::jsonb AND jsonb_typeof(field_provenance->'fields') = 'object') IS TRUE) | 必填 |

```sql
UNIQUE (batch_id, source_file_sha256, sheet, row_no)
UNIQUE (batch_id, id)
```

## import_sku_alias - 旧规格身份到正式SKU映射

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0011_history_storage.sql`
- 主键: PRIMARY KEY (batch_id, old_source_sku_id)

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| old_source_sku_id | text NOT NULL | 必填 |
| canonical_sku_id | uuid NOT NULL REFERENCES naijue_erp.sku(id) | 必填 |
| source_row_id | uuid NOT NULL | 必填 |
| canonical_source_key | text NOT NULL | 必填 |
| mapping_basis | text NOT NULL | 必填 |

```sql
PRIMARY KEY (batch_id, old_source_sku_id)
UNIQUE (batch_id, source_row_id)
FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id)
```

## history_sales_header - 历史销货/退换单头原始快照

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0011_history_storage.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| source_row_id | uuid NOT NULL UNIQUE | 必填 |
| batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |
| number | text NOT NULL | 必填 |
| business_date | date | 可空 |
| source_status | text NOT NULL CHECK (source_status IN ('DRAFT', 'APPROVED', 'VOID')) | 必填 |
| note | text | 可空 |
| created_by_source_key | text | 可空 |
| approved_by_source_key | text | 可空 |
| created_hall_id | uuid REFERENCES naijue_erp.hall(id) | 可空 |
| created_hall_provenance | text NOT NULL CHECK (created_hall_provenance IN ('ORIGINAL', 'MIGRATION_DERIVED', 'UNKNOWN')) | 必填 |
| created_hall_reason | text NOT NULL CHECK (length(btrim(created_hall_reason)) > 0) | 必填 |
| created_local_at | timestamp without time zone | 可空 |
| updated_local_at | timestamp without time zone | 可空 |
| approved_local_at | timestamp without time zone | 可空 |
| created_instant | timestamptz | 可空 |
| updated_instant | timestamptz | 可空 |
| approved_instant | timestamptz | 可空 |
| business_type | text NOT NULL CHECK (business_type IN ('SALE', 'RETURN', 'EXCHANGE')) | 必填 |
| hall_id | uuid NOT NULL REFERENCES naijue_erp.hall(id) | 必填 |
| customer_id | uuid NOT NULL REFERENCES naijue_erp.customer(id) | 必填 |
| warehouse_id | uuid NOT NULL REFERENCES naijue_erp.warehouse(id) | 必填 |
| salesperson_id | uuid REFERENCES naijue_erp.staff(id) | 可空 |
| gross_amount | numeric(18,2) NOT NULL | 必填 |
| order_discount | numeric(18,2) NOT NULL | 必填 |
| net_due | numeric(18,2) NOT NULL | 必填 |

```sql
FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id)
CHECK ((created_hall_provenance = 'UNKNOWN') = (created_hall_id IS NULL))
UNIQUE (batch_id, id)
```

## history_transfer_header - 历史调拨单头原始快照

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0011_history_storage.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| source_row_id | uuid NOT NULL UNIQUE | 必填 |
| batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| version | integer NOT NULL CHECK (version > 0) | 必填 |
| number | text NOT NULL | 必填 |
| business_date | date | 可空 |
| source_status | text NOT NULL CHECK (source_status IN ('DRAFT', 'APPROVED', 'VOID')) | 必填 |
| note | text | 可空 |
| created_by_source_key | text | 可空 |
| approved_by_source_key | text | 可空 |
| created_hall_id | uuid REFERENCES naijue_erp.hall(id) | 可空 |
| created_hall_provenance | text NOT NULL CHECK (created_hall_provenance IN ('ORIGINAL', 'MIGRATION_DERIVED', 'UNKNOWN')) | 必填 |
| created_hall_reason | text NOT NULL CHECK (length(btrim(created_hall_reason)) > 0) | 必填 |
| created_local_at | timestamp without time zone | 可空 |
| updated_local_at | timestamp without time zone | 可空 |
| approved_local_at | timestamp without time zone | 可空 |
| created_instant | timestamptz | 可空 |
| updated_instant | timestamptz | 可空 |
| approved_instant | timestamptz | 可空 |
| from_warehouse_id | uuid NOT NULL REFERENCES naijue_erp.warehouse(id) | 必填 |
| to_warehouse_id | uuid NOT NULL REFERENCES naijue_erp.warehouse(id) | 必填 |
| created_role_source | text | 可空 |

```sql
FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id)
CHECK ((created_hall_provenance = 'UNKNOWN') = (created_hall_id IS NULL))
UNIQUE (batch_id, id)
CHECK (from_warehouse_id <> to_warehouse_id)
```

## history_sales_line - 历史销货规格行原始快照

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0011_history_storage.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| source_row_id | uuid NOT NULL UNIQUE | 必填 |
| batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| header_id | uuid NOT NULL | 必填 |
| line_no | integer NOT NULL CHECK (line_no > 0) | 必填 |
| sku_id | uuid NOT NULL REFERENCES naijue_erp.sku(id) | 必填 |
| quantity | bigint NOT NULL | 必填 |
| product_code_snapshot | text | 可空 |
| product_name_snapshot | text | 可空 |
| color_name_snapshot | text | 可空 |
| fit_name_snapshot | text | 可空 |
| size_name_snapshot | text | 可空 |
| barcode_snapshot | text | 可空 |
| reference_price | numeric(18,2) | 可空 |
| deal_price | numeric(18,2) NOT NULL | 必填 |
| line_amount | numeric(18,2) NOT NULL | 必填 |
| allocated_discount | numeric(18,2) | 可空 |
| is_gift | boolean | 可空 |
| pricing_method_source | text | 可空 |
| discount_tenths | integer | 可空 |
| ordinary_zero_confirmed | boolean | 可空 |

```sql
FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id)
FOREIGN KEY (batch_id, header_id) REFERENCES naijue_erp.history_sales_header(batch_id, id)
UNIQUE (header_id, line_no)
```

## history_transfer_line - 历史调拨规格行原始快照

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0011_history_storage.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| source_row_id | uuid NOT NULL UNIQUE | 必填 |
| batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| header_id | uuid NOT NULL | 必填 |
| line_no | integer NOT NULL CHECK (line_no > 0) | 必填 |
| sku_id | uuid NOT NULL REFERENCES naijue_erp.sku(id) | 必填 |
| quantity | bigint NOT NULL | 必填 |
| product_code_snapshot | text | 可空 |
| product_name_snapshot | text | 可空 |
| color_name_snapshot | text | 可空 |
| fit_name_snapshot | text | 可空 |
| size_name_snapshot | text | 可空 |
| barcode_snapshot | text | 可空 |

```sql
FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id)
FOREIGN KEY (batch_id, header_id) REFERENCES naijue_erp.history_transfer_header(batch_id, id)
UNIQUE (header_id, line_no)
```

## history_sales_settlement - 历史收退款原始快照

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0011_history_storage.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| source_row_id | uuid NOT NULL UNIQUE | 必填 |
| batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| header_id | uuid NOT NULL | 必填 |
| line_no | integer NOT NULL CHECK (line_no > 0) | 必填 |
| payment_account_id | uuid NOT NULL REFERENCES naijue_erp.payment_account(id) | 必填 |
| direction | text NOT NULL CHECK (direction IN ('RECEIVE', 'REFUND')) | 必填 |
| amount | numeric(18,2) NOT NULL CHECK (amount >= 0) | 必填 |
| account_name_snapshot | text | 可空 |
| method_name_snapshot | text | 可空 |
| payment_method_id_snapshot | uuid REFERENCES naijue_erp.payment_method(id) | 可空 |

```sql
FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id)
FOREIGN KEY (batch_id, header_id) REFERENCES naijue_erp.history_sales_header(batch_id, id)
UNIQUE (header_id, line_no)
```

## import_stock_contributor - 来源行对切换库存的贡献

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0011_history_storage.sql`
- 主键: PRIMARY KEY (batch_id, source_row_id)

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| source_row_id | uuid NOT NULL | 必填 |
| warehouse_id | uuid NOT NULL REFERENCES naijue_erp.warehouse(id) | 必填 |
| canonical_sku_id | uuid NOT NULL REFERENCES naijue_erp.sku(id) | 必填 |
| old_source_sku_id | text NOT NULL | 必填 |
| canonical_stock_source_key | text NOT NULL | 必填 |
| source_unit | text NOT NULL | 必填 |
| signed_quantity | bigint NOT NULL | 必填 |
| baseline_ledger_id | uuid REFERENCES naijue_erp.inventory_ledger(id) | 可空 |

```sql
PRIMARY KEY (batch_id, source_row_id)
FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id)
FOREIGN KEY (batch_id, old_source_sku_id) REFERENCES naijue_erp.import_sku_alias(batch_id, old_source_sku_id)
```

## history_revision - 历史单据受控修订记录（当前写入关闭）

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0011_history_storage.sql`
- 主键: id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| id | uuid PRIMARY KEY | 必填 |
| document_kind | text NOT NULL CHECK (document_kind IN ('SALES', 'TRANSFER')) | 必填 |
| sales_id | uuid REFERENCES naijue_erp.history_sales_header(id) | 可空 |
| transfer_id | uuid REFERENCES naijue_erp.history_transfer_header(id) | 可空 |
| from_version | integer NOT NULL CHECK (from_version > 0) | 必填 |
| to_version | integer NOT NULL CHECK (to_version = from_version + 1) | 必填 |
| actor_account_id | uuid NOT NULL REFERENCES naijue_erp.user_account(id) | 必填 |
| request_key | text NOT NULL | 必填 |
| reason | text NOT NULL CHECK (length(btrim(reason)) > 0) | 必填 |
| changed_at | timestamptz NOT NULL | 必填 |
| before_facts | jsonb NOT NULL CHECK (jsonb_typeof(before_facts) = 'object') | 必填 |
| after_facts | jsonb NOT NULL CHECK (jsonb_typeof(after_facts) = 'object') | 必填 |
| stock_effect_basis | text NOT NULL | 必填 |
| stock_effect_evidence | jsonb NOT NULL CHECK (jsonb_typeof(stock_effect_evidence) = 'object') | 必填 |

```sql
CHECK ((document_kind = 'SALES' AND sales_id IS NOT NULL AND transfer_id IS NULL)
    OR (document_kind = 'TRANSFER' AND transfer_id IS NOT NULL AND sales_id IS NULL))
UNIQUE (actor_account_id, request_key)
```

## import_header_native_reference - 历史表头与正式实体的明确引用

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0012_history_header_native_reference.sql`
- 主键: PRIMARY KEY (batch_id, entity_type, source_key)

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| entity_type | text NOT NULL CHECK (entity_type IN ('HALL', 'CUSTOMER', 'STAFF')) | 必填 |
| source_key | text NOT NULL CHECK (length(btrim(source_key)) > 0) | 必填 |
| source_row_id | uuid NOT NULL | 必填 |
| native_hall_id | uuid REFERENCES naijue_erp.hall(id) | 可空 |
| native_customer_id | uuid REFERENCES naijue_erp.customer(id) | 可空 |
| native_staff_id | uuid REFERENCES naijue_erp.staff(id) | 可空 |
| native_version | integer NOT NULL CHECK (native_version > 0) | 必填 |
| native_snapshot | jsonb NOT NULL CHECK (jsonb_typeof(native_snapshot) = 'object') | 必填 |
| validator_version | text NOT NULL CHECK (validator_version = 'V3_HISTORY_HEADER_NATIVE_REFERENCE_1') | 必填 |

```sql
PRIMARY KEY (batch_id, entity_type, source_key)
UNIQUE (batch_id, source_row_id)
UNIQUE (batch_id, entity_type, native_hall_id)
UNIQUE (batch_id, entity_type, native_customer_id)
UNIQUE (batch_id, entity_type, native_staff_id)
FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id)
CHECK ((entity_type = 'HALL' AND native_hall_id IS NOT NULL AND native_customer_id IS NULL AND native_staff_id IS NULL)
    OR (entity_type = 'CUSTOMER' AND native_customer_id IS NOT NULL AND native_hall_id IS NULL AND native_staff_id IS NULL)
    OR (entity_type = 'STAFF' AND native_staff_id IS NOT NULL AND native_hall_id IS NULL AND native_customer_id IS NULL))
```

## native_party_import_evidence - 客户供应商导入证据

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0013_native_party_import.sql`
- 主键: source_row_id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| source_row_id | uuid PRIMARY KEY | 必填 |
| entity_type | text NOT NULL CHECK (entity_type IN ('HALL','CUSTOMER','SUPPLIER','STAFF','WAREHOUSE')) | 必填 |
| source_key | text NOT NULL CHECK (length(btrim(source_key))>0) | 必填 |
| native_id | uuid NOT NULL | 必填 |
| native_hall_id | uuid GENERATED ALWAYS AS (CASE WHEN entity_type='HALL' THEN native_id END) STORED REFERENCES naijue_erp.hall(id) DEFERRABLE INITIALLY DEFERRED | 可空 |
| native_customer_id | uuid GENERATED ALWAYS AS (CASE WHEN entity_type='CUSTOMER' THEN native_id END) STORED REFERENCES naijue_erp.customer(id) DEFERRABLE INITIALLY DEFERRED | 可空 |
| native_supplier_id | uuid GENERATED ALWAYS AS (CASE WHEN entity_type='SUPPLIER' THEN native_id END) STORED REFERENCES naijue_erp.supplier(id) DEFERRABLE INITIALLY DEFERRED | 可空 |
| native_staff_id | uuid GENERATED ALWAYS AS (CASE WHEN entity_type='STAFF' THEN native_id END) STORED REFERENCES naijue_erp.staff(id) DEFERRABLE INITIALLY DEFERRED | 可空 |
| native_warehouse_id | uuid GENERATED ALWAYS AS (CASE WHEN entity_type='WAREHOUSE' THEN native_id END) STORED REFERENCES naijue_erp.warehouse(id) DEFERRABLE INITIALLY DEFERRED | 可空 |
| warehouse_record | jsonb CHECK (warehouse_record IS NULL OR jsonb_typeof(warehouse_record)='object') | 可空 |
| native_snapshot | jsonb NOT NULL CHECK (jsonb_typeof(native_snapshot)='object') | 必填 |
| source_snapshot | jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot)='object') | 必填 |
| selection | jsonb NOT NULL CHECK (jsonb_typeof(selection)='object') | 必填 |
| authorization | jsonb NOT NULL CHECK (jsonb_typeof("authorization")='object') | 必填 |
| row_fingerprint | text NOT NULL CHECK (row_fingerprint ~ '^[0-9a-f]{64}$') | 必填 |
| validator_version | text NOT NULL CHECK (validator_version='NATIVE_PARTY_IMPORT_V1') | 必填 |
| creation_xid | xid8 NOT NULL DEFAULT pg_current_xact_id() | 必填 |
| imported_at | timestamptz NOT NULL DEFAULT transaction_timestamp() | 必填 |

```sql
UNIQUE (batch_id,entity_type,source_key)
UNIQUE (entity_type,native_id)
FOREIGN KEY (batch_id,source_row_id) REFERENCES naijue_erp.import_source_row(batch_id,id) DEFERRABLE INITIALLY DEFERRED
```

## import_native_catalogue_binding - 商品/规格/条码等导入绑定

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0014_native_catalogue_import.sql`
- 主键: PRIMARY KEY (batch_id,entity_type,source_key)

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| entity_type | text NOT NULL CHECK (entity_type IN ('CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SEASON','SIZE_GROUP_MEMBER')) | 必填 |
| source_key | text NOT NULL CHECK (length(btrim(source_key)) > 0) | 必填 |
| source_row_id | uuid NOT NULL | 必填 |
| category_id | uuid REFERENCES naijue_erp.product_category(id) | 可空 |
| color_id | uuid REFERENCES naijue_erp.color(id) | 可空 |
| fit_id | uuid REFERENCES naijue_erp.fit(id) | 可空 |
| size_id | uuid REFERENCES naijue_erp.size(id) | 可空 |
| size_group_id | uuid REFERENCES naijue_erp.size_group(id) | 可空 |
| season_id | uuid REFERENCES naijue_erp.season(id) | 可空 |
| member_group_id | uuid | 可空 |
| member_size_id | uuid | 可空 |
| native_snapshot | jsonb NOT NULL CHECK (jsonb_typeof(native_snapshot)='object') | 必填 |
| evidence_fingerprint | text NOT NULL CHECK (evidence_fingerprint ~ '^[a-f0-9]{64}$') | 必填 |
| validator_version | text NOT NULL CHECK (validator_version='NATIVE_CATALOGUE_IMPORT_V1') | 必填 |

```sql
PRIMARY KEY (batch_id,entity_type,source_key)
UNIQUE (batch_id,source_row_id)
UNIQUE (batch_id,category_id)
UNIQUE (batch_id,color_id)
UNIQUE (batch_id,fit_id)
UNIQUE (batch_id,size_id)
UNIQUE (batch_id,size_group_id)
UNIQUE (batch_id,season_id)
UNIQUE (batch_id,member_group_id,member_size_id)
FOREIGN KEY (batch_id,source_row_id) REFERENCES naijue_erp.import_source_row(batch_id,id)
FOREIGN KEY (member_group_id,member_size_id) REFERENCES naijue_erp.size_group_member(size_group_id,size_id)
CHECK ((entity_type='CATEGORY' AND category_id IS NOT NULL AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=1)
    OR (entity_type='COLOR' AND color_id IS NOT NULL AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=1)
    OR (entity_type='FIT' AND fit_id IS NOT NULL AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=1)
    OR (entity_type='SIZE' AND size_id IS NOT NULL AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=1)
    OR (entity_type='SIZE_GROUP' AND size_group_id IS NOT NULL AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=1)
    OR (entity_type='SEASON' AND season_id IS NOT NULL AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=1)
    OR (entity_type='SIZE_GROUP_MEMBER' AND member_group_id IS NOT NULL AND member_size_id IS NOT NULL
      AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=2))
```

## import_record_accounting_claim - 导入记录与记账声明关联

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0015_native_import_record_accounting.sql`
- 主键: PRIMARY KEY (import_batch_id,import_record_id)

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| import_batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| import_record_id | uuid NOT NULL | 必填 |
| target_type | text NOT NULL CHECK (target_type IN ('WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH')) | 必填 |
| target_id | uuid NOT NULL | 必填 |
| operation_id | uuid NOT NULL REFERENCES naijue_erp.operation_receipt(id) DEFERRABLE INITIALLY DEFERRED | 必填 |
| checkpoint_sequence | integer NOT NULL CHECK (checkpoint_sequence > 0 AND checkpoint_sequence < 2147483646) | 必填 |
| claimed_at | timestamptz NOT NULL | 必填 |
| validator_version | text NOT NULL CHECK (validator_version='NATIVE_IMPORT_RECORD_ACCOUNTING_V1') | 必填 |

```sql
PRIMARY KEY (import_batch_id,import_record_id)
FOREIGN KEY (import_batch_id,import_record_id,target_type,target_id)
    REFERENCES naijue_erp.import_record(import_batch_id,id,target_type,target_id)
```

## import_native_payment_binding - 收款方式/账户/厅关系导入绑定

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0017_native_payment_import.sql`
- 主键: PRIMARY KEY(batch_id,entity_type,source_key)

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| batch_id | uuid NOT NULL REFERENCES naijue_erp.import_batch(id) | 必填 |
| entity_type | text NOT NULL CHECK(entity_type IN ('PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL')) | 必填 |
| source_key | text NOT NULL CHECK(length(btrim(source_key))>0) | 必填 |
| source_row_id | uuid NOT NULL | 必填 |
| native_payment_method_id | uuid REFERENCES naijue_erp.payment_method(id) | 可空 |
| native_payment_account_id | uuid REFERENCES naijue_erp.payment_account(id) | 可空 |
| native_hall_id | uuid REFERENCES naijue_erp.hall(id) | 可空 |
| native_snapshot | jsonb NOT NULL CHECK(jsonb_typeof(native_snapshot)='object') | 必填 |
| evidence_fingerprint | text NOT NULL CHECK(evidence_fingerprint ~ '^[a-f0-9]{64}$') | 必填 |
| validator_version | text NOT NULL CHECK(validator_version='NATIVE_PAYMENT_IMPORT_V1') | 必填 |

```sql
PRIMARY KEY(batch_id,entity_type,source_key)
UNIQUE(batch_id,source_row_id)
FOREIGN KEY(batch_id,source_row_id) REFERENCES naijue_erp.import_source_row(batch_id,id)
CHECK((entity_type='PAYMENT_METHOD' AND native_payment_method_id IS NOT NULL AND native_payment_account_id IS NULL AND native_hall_id IS NULL)
    OR (entity_type='PAYMENT_ACCOUNT' AND native_payment_method_id IS NOT NULL AND native_payment_account_id IS NOT NULL AND native_hall_id IS NULL)
    OR (entity_type='PAYMENT_ACCOUNT_HALL' AND native_payment_method_id IS NULL AND native_payment_account_id IS NOT NULL AND native_hall_id IS NOT NULL))
```

## import_history_closure_manifest - 历史批次发布闭合清单

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0018_history_typed_publication.sql`
- 主键: batch_id

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| batch_id | uuid PRIMARY KEY REFERENCES naijue_erp.import_batch(id) | 必填 |
| validator_version | text NOT NULL CHECK(validator_version='HISTORY_TYPED_CLOSURE_V1') | 必填 |
| selection_sha256 | text NOT NULL CHECK(selection_sha256~'^[0-9a-f]{64}$') | 必填 |
| authorized_payload_hash | text NOT NULL CHECK(authorized_payload_hash~'^[0-9a-f]{64}$') | 必填 |
| source_manifest_sha256 | text NOT NULL CHECK(source_manifest_sha256~'^[0-9a-f]{64}$') | 必填 |
| typed_manifest_sha256 | text NOT NULL CHECK(typed_manifest_sha256~'^[0-9a-f]{64}$') | 必填 |
| document_manifest_sha256 | text NOT NULL CHECK(document_manifest_sha256~'^[0-9a-f]{64}$') | 必填 |
| expected_counts | jsonb NOT NULL CHECK(naijue_erp.history_closure_count_map(expected_counts,ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','import_source_row','import_sku_alias','import_stock_contributor','barcodes'])) | 必填 |
| source_entity_counts | jsonb NOT NULL CHECK(naijue_erp.history_closure_count_map(source_entity_counts,ARRAY['HALL','WAREHOUSE','STAFF','CUSTOMER','SUPPLIER','CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE','INVENTORY_BASELINE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'])) | 必填 |
| document_count | integer NOT NULL CHECK(document_count BETWEEN 0 AND 100000) | 必填 |

## import_history_document_manifest - 历史逐单发布清单

- 原创建与后续 ALTER 来源: `adapters/postgres/migrations/0018_history_typed_publication.sql`
- 主键: PRIMARY KEY(batch_id,document_kind,source_key)

| 表.字段 | 列声明 | 可空含义 |
| --- | --- | --- |
| batch_id | uuid NOT NULL REFERENCES naijue_erp.import_history_closure_manifest(batch_id) | 必填 |
| document_kind | text NOT NULL CHECK(document_kind IN('SALES','TRANSFER')) | 必填 |
| source_key | text NOT NULL CHECK(length(btrim(source_key))>0) | 必填 |
| header_source_row_id | uuid NOT NULL | 必填 |
| sales_header_id | uuid | 可空 |
| transfer_header_id | uuid | 可空 |
| header_source_sha256 | text NOT NULL CHECK(header_source_sha256~'^[0-9a-f]{64}$') | 必填 |
| line_count | integer NOT NULL CHECK(line_count>0) | 必填 |
| settlement_count | integer NOT NULL CHECK(settlement_count>=0) | 必填 |
| source_document_sha256 | text NOT NULL CHECK(source_document_sha256~'^[0-9a-f]{64}$') | 必填 |
| typed_document_sha256 | text NOT NULL CHECK(typed_document_sha256~'^[0-9a-f]{64}$') | 必填 |

```sql
PRIMARY KEY(batch_id,document_kind,source_key)
UNIQUE(batch_id,header_source_row_id)
UNIQUE(batch_id,sales_header_id)
UNIQUE(batch_id,transfer_header_id)
FOREIGN KEY(batch_id,header_source_row_id) REFERENCES naijue_erp.import_source_row(batch_id,id)
FOREIGN KEY(batch_id,sales_header_id) REFERENCES naijue_erp.history_sales_header(batch_id,id)
FOREIGN KEY(batch_id,transfer_header_id) REFERENCES naijue_erp.history_transfer_header(batch_id,id)
CHECK((document_kind='SALES' AND sales_header_id IS NOT NULL AND transfer_header_id IS NULL)
  OR(document_kind='TRANSFER' AND sales_header_id IS NULL AND transfer_header_id IS NOT NULL AND settlement_count=0))
```

## 原创建与后续 ALTER 来源

```sql
-- adapters/postgres/migrations/0001_runtime_sales.sql
ALTER TABLE naijue_erp.hall ADD FOREIGN KEY (default_sales_warehouse_id) REFERENCES naijue_erp.warehouse(id);
-- adapters/postgres/migrations/0001_runtime_sales.sql
ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_requires_audit
  FOREIGN KEY (id, target_id) REFERENCES naijue_erp.audit_change (operation_id, object_id) DEFERRABLE INITIALLY DEFERRED;
-- adapters/postgres/migrations/0002_sales_pricing_facts.sql
ALTER TABLE naijue_erp.sales_line
  ADD COLUMN pricing_rule text,
  ADD COLUMN discount_tenths integer,
  ADD COLUMN zero_confirmed boolean;
-- adapters/postgres/migrations/0002_sales_pricing_facts.sql
ALTER TABLE naijue_erp.sales_line ADD CONSTRAINT sales_line_pricing_facts CHECK (
  (pricing_rule IS NULL AND discount_tenths IS NULL AND zero_confirmed IS NULL)
  OR (pricing_rule IS NOT NULL AND zero_confirmed IS NOT NULL
    AND ((pricing_rule = 'UNIT_PRICE' AND discount_tenths IS NULL)
      OR (pricing_rule = 'DISCOUNT' AND discount_tenths IS NOT NULL AND discount_tenths BETWEEN 0 AND 100)))
);
-- adapters/postgres/migrations/0004_transfer_runtime.sql
ALTER TABLE naijue_erp.operation_receipt
  DROP CONSTRAINT operation_receipt_target_type_check,
  DROP CONSTRAINT operation_receipt_target_id_fkey,
  ADD CONSTRAINT receipt_target_kind CHECK (target_type IN ('SALES', 'TRANSFER')),
  ADD COLUMN target_sales_id uuid GENERATED ALWAYS AS (CASE WHEN target_type = 'SALES' THEN target_id END) STORED REFERENCES naijue_erp.sales_header(id),
  ADD COLUMN target_transfer_id uuid GENERATED ALWAYS AS (CASE WHEN target_type = 'TRANSFER' THEN target_id END) STORED REFERENCES naijue_erp.transfer_header(id),
  ADD CONSTRAINT receipt_kind_identity UNIQUE (id, actor_account_id, target_type, target_id, action);
-- adapters/postgres/migrations/0004_transfer_runtime.sql
ALTER TABLE naijue_erp.audit_change
  DROP CONSTRAINT audit_change_object_type_check,
  DROP CONSTRAINT audit_change_object_id_fkey,
  ADD CONSTRAINT audit_object_kind CHECK (object_type IN ('SALES', 'TRANSFER')),
  ADD COLUMN object_sales_id uuid GENERATED ALWAYS AS (CASE WHEN object_type = 'SALES' THEN object_id END) STORED REFERENCES naijue_erp.sales_header(id),
  ADD COLUMN object_transfer_id uuid GENERATED ALWAYS AS (CASE WHEN object_type = 'TRANSFER' THEN object_id END) STORED REFERENCES naijue_erp.transfer_header(id),
  ADD CONSTRAINT audit_kind_identity UNIQUE (operation_id, object_type, object_id),
  ADD CONSTRAINT audit_receipt_kind_coherence FOREIGN KEY (operation_id, actor_account_id, object_type, object_id, action)
    REFERENCES naijue_erp.operation_receipt (id, actor_account_id, target_type, target_id, action) DEFERRABLE INITIALLY DEFERRED;
-- adapters/postgres/migrations/0004_transfer_runtime.sql
ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_requires_same_kind_audit
  FOREIGN KEY (id, target_type, target_id) REFERENCES naijue_erp.audit_change (operation_id, object_type, object_id) DEFERRABLE INITIALLY DEFERRED;
-- adapters/postgres/migrations/0004_transfer_runtime.sql
ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK (
  jsonb_typeof(result_data) = 'object' AND result_data ?& ARRAY['operationId', 'version', 'status', 'ledgerEntryIds']
  AND jsonb_typeof(result_data->'operationId') = 'string'
  AND (result_data->>'operationId') IS NOT DISTINCT FROM id::text
  AND jsonb_typeof(result_data->'version') = 'number' AND result_data->>'version' ~ '^[1-9][0-9]*$'
  AND jsonb_typeof(result_data->'status') = 'string' AND result_data->>'status' IN ('DRAFT', 'APPROVED', 'VOID')
  AND jsonb_typeof(result_data->'ledgerEntryIds') = 'array'
  AND CASE target_type
    WHEN 'SALES' THEN result_data ? 'salesId' AND NOT (result_data ? 'transferId')
      AND jsonb_typeof(result_data->'salesId') = 'string' AND (result_data->>'salesId') IS NOT DISTINCT FROM target_id::text
    WHEN 'TRANSFER' THEN result_data ? 'transferId' AND NOT (result_data ? 'salesId')
      AND jsonb_typeof(result_data->'transferId') = 'string' AND (result_data->>'transferId') IS NOT DISTINCT FROM target_id::text
    ELSE false END
);
-- adapters/postgres/migrations/0004_transfer_runtime.sql
ALTER TABLE naijue_erp.inventory_ledger
  ALTER COLUMN source_sales_line_id DROP NOT NULL,
  ADD COLUMN source_transfer_line_id uuid REFERENCES naijue_erp.transfer_line(id),
  DROP CONSTRAINT inventory_ledger_endpoint_check,
  ADD CONSTRAINT ledger_exactly_one_native_source CHECK (
    (source_sales_line_id IS NOT NULL AND source_transfer_line_id IS NULL AND endpoint = 'SALES_WAREHOUSE')
    OR (source_sales_line_id IS NULL AND source_transfer_line_id IS NOT NULL AND endpoint IN ('FROM', 'TO'))
  ),
  ADD CONSTRAINT ledger_transfer_operation_endpoint UNIQUE (operation_id, source_transfer_line_id, endpoint);
-- adapters/postgres/migrations/0005_product_read_fields.sql
ALTER TABLE naijue_erp.product
  ADD COLUMN year integer,
  ADD COLUMN system_item_code text,
  ADD COLUMN thickness text,
  ADD COLUMN collar_pants_type text;
-- adapters/postgres/migrations/0006_party_maintenance.sql
ALTER TABLE naijue_erp.operation_receipt
  DROP CONSTRAINT receipt_target_kind,
  DROP CONSTRAINT operation_receipt_action_check,
  ADD CONSTRAINT receipt_target_kind CHECK (target_type IN ('SALES', 'TRANSFER', 'CUSTOMER', 'SUPPLIER')),
  ADD CONSTRAINT receipt_action_by_kind CHECK (
    (target_type IN ('SALES', 'TRANSFER') AND action IN ('SAVE', 'APPROVE', 'UNAPPROVE', 'VOID'))
    OR (target_type IN ('CUSTOMER', 'SUPPLIER') AND action IN ('CREATE', 'EDIT', 'DISABLE', 'RESTORE'))),
  ADD COLUMN target_customer_id uuid GENERATED ALWAYS AS (CASE WHEN target_type = 'CUSTOMER' THEN target_id END) STORED REFERENCES naijue_erp.customer(id),
  ADD COLUMN target_supplier_id uuid GENERATED ALWAYS AS (CASE WHEN target_type = 'SUPPLIER' THEN target_id END) STORED REFERENCES naijue_erp.supplier(id);
-- adapters/postgres/migrations/0006_party_maintenance.sql
ALTER TABLE naijue_erp.audit_change
  DROP CONSTRAINT audit_object_kind,
  DROP CONSTRAINT audit_change_action_check,
  ADD CONSTRAINT audit_object_kind CHECK (object_type IN ('SALES', 'TRANSFER', 'CUSTOMER', 'SUPPLIER')),
  ADD CONSTRAINT audit_action_by_kind CHECK (
    (object_type IN ('SALES', 'TRANSFER') AND action IN ('SAVE', 'APPROVE', 'UNAPPROVE', 'VOID'))
    OR (object_type IN ('CUSTOMER', 'SUPPLIER') AND action IN ('CREATE', 'EDIT', 'DISABLE', 'RESTORE'))),
  ADD COLUMN object_customer_id uuid GENERATED ALWAYS AS (CASE WHEN object_type = 'CUSTOMER' THEN object_id END) STORED REFERENCES naijue_erp.customer(id),
  ADD COLUMN object_supplier_id uuid GENERATED ALWAYS AS (CASE WHEN object_type = 'SUPPLIER' THEN object_id END) STORED REFERENCES naijue_erp.supplier(id);
-- adapters/postgres/migrations/0006_party_maintenance.sql
ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind;
-- adapters/postgres/migrations/0006_party_maintenance.sql
ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK ((
  jsonb_typeof(result_data) = 'object'
  AND CASE WHEN target_type IN ('SALES', 'TRANSFER') THEN
    result_data ?& ARRAY['operationId', 'version', 'status', 'ledgerEntryIds']
    AND jsonb_typeof(result_data->'operationId') = 'string' AND (result_data->>'operationId') IS NOT DISTINCT FROM id::text
    AND jsonb_typeof(result_data->'version') = 'number' AND result_data->>'version' ~ '^[1-9][0-9]*$'
    AND jsonb_typeof(result_data->'status') = 'string' AND result_data->>'status' IN ('DRAFT', 'APPROVED', 'VOID')
    AND jsonb_typeof(result_data->'ledgerEntryIds') = 'array'
    AND CASE target_type
      WHEN 'SALES' THEN result_data ? 'salesId' AND NOT (result_data ? 'transferId')
        AND jsonb_typeof(result_data->'salesId') = 'string' AND (result_data->>'salesId') IS NOT DISTINCT FROM target_id::text
      WHEN 'TRANSFER' THEN result_data ? 'transferId' AND NOT (result_data ? 'salesId')
        AND jsonb_typeof(result_data->'transferId') = 'string' AND (result_data->>'transferId') IS NOT DISTINCT FROM target_id::text
      ELSE false END
  ELSE
    result_data ?& ARRAY['operationId', 'kind', 'partyId', 'version', 'code', 'enabled']
    AND (result_data - ARRAY['operationId', 'kind', 'partyId', 'version', 'code', 'enabled']) = '{}'::jsonb
    AND jsonb_typeof(result_data->'operationId') = 'string' AND result_data->>'operationId' = id::text
    AND jsonb_typeof(result_data->'kind') = 'string' AND result_data->>'kind' = target_type
    AND jsonb_typeof(result_data->'partyId') = 'string' AND result_data->>'partyId' = target_id::text
    AND jsonb_typeof(result_data->'version') = 'number' AND result_data->>'version' ~ '^[1-9][0-9]*$'
    AND jsonb_typeof(result_data->'code') = 'string' AND length(btrim(result_data->>'code')) > 0
    AND jsonb_typeof(result_data->'enabled') = 'boolean'
  END
) IS TRUE);
-- adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql
ALTER TABLE naijue_erp.sales_header ADD COLUMN import_batch_id uuid REFERENCES naijue_erp.import_batch(id);
-- adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql
ALTER TABLE naijue_erp.transfer_header ADD COLUMN import_batch_id uuid REFERENCES naijue_erp.import_batch(id);
-- adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql
ALTER TABLE naijue_erp.inventory_ledger ADD COLUMN source_import_batch_id uuid REFERENCES naijue_erp.import_batch(id),
  ALTER COLUMN source_document_version DROP NOT NULL,
  DROP CONSTRAINT inventory_ledger_event_kind_check,
  DROP CONSTRAINT ledger_exactly_one_native_source,
  ADD CONSTRAINT ledger_event_kind CHECK (event_kind IN ('APPROVE', 'UNAPPROVE', 'CUTOFF_BASELINE')),
  ADD CONSTRAINT ledger_closed_source CHECK ((
    (event_kind = 'CUTOFF_BASELINE' AND source_import_batch_id IS NOT NULL AND source_sales_line_id IS NULL
      AND source_transfer_line_id IS NULL AND source_document_version IS NULL AND endpoint = 'IMPORT_BASELINE' AND reverses_entry_id IS NULL)
    OR (event_kind IN ('APPROVE', 'UNAPPROVE') AND source_import_batch_id IS NULL AND source_document_version IS NOT NULL
      AND ((source_sales_line_id IS NOT NULL AND source_transfer_line_id IS NULL AND endpoint = 'SALES_WAREHOUSE')
        OR (source_sales_line_id IS NULL AND source_transfer_line_id IS NOT NULL AND endpoint IN ('FROM', 'TO'))))
  ) IS TRUE),
  ADD CONSTRAINT ledger_retains_balance FOREIGN KEY (warehouse_id, sku_id)
    REFERENCES naijue_erp.inventory_balance (warehouse_id, sku_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
-- adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql
ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_target_kind, DROP CONSTRAINT receipt_action_by_kind,
  ADD CONSTRAINT receipt_target_kind CHECK (target_type IN ('SALES', 'TRANSFER', 'CUSTOMER', 'SUPPLIER', 'IMPORT')),
  ADD CONSTRAINT receipt_action_by_kind CHECK (
    (target_type IN ('SALES', 'TRANSFER') AND action IN ('SAVE', 'APPROVE', 'UNAPPROVE', 'VOID'))
    OR (target_type IN ('CUSTOMER', 'SUPPLIER') AND action IN ('CREATE', 'EDIT', 'DISABLE', 'RESTORE'))
    OR (target_type = 'IMPORT' AND action IN ('IMPORT_STAGE', 'IMPORT_CHUNK', 'IMPORT_PUBLISH')));
-- adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql
ALTER TABLE naijue_erp.audit_change DROP CONSTRAINT audit_object_kind, DROP CONSTRAINT audit_action_by_kind,
  ADD CONSTRAINT audit_object_kind CHECK (object_type IN ('SALES', 'TRANSFER', 'CUSTOMER', 'SUPPLIER', 'IMPORT')),
  ADD CONSTRAINT audit_action_by_kind CHECK (
    (object_type IN ('SALES', 'TRANSFER') AND action IN ('SAVE', 'APPROVE', 'UNAPPROVE', 'VOID'))
    OR (object_type IN ('CUSTOMER', 'SUPPLIER') AND action IN ('CREATE', 'EDIT', 'DISABLE', 'RESTORE'))
    OR (object_type = 'IMPORT' AND action IN ('IMPORT_STAGE', 'IMPORT_CHUNK', 'IMPORT_PUBLISH')));
-- adapters/postgres/migrations/0009_catalogue_prices_barcodes.sql
ALTER TABLE naijue_erp.product
  ADD COLUMN purchase_price decimal(18,2) CHECK (purchase_price >= 0),
  ADD COLUMN wholesale5_price decimal(18,2) CHECK (wholesale5_price >= 0),
  ADD COLUMN wholesale6_price decimal(18,2) CHECK (wholesale6_price >= 0),
  ADD COLUMN wholesale7_price decimal(18,2) CHECK (wholesale7_price >= 0),
  ADD COLUMN wholesale8_price decimal(18,2) CHECK (wholesale8_price >= 0),
  ADD COLUMN wholesale9_price decimal(18,2) CHECK (wholesale9_price >= 0),
  ADD COLUMN wholesale10_price decimal(18,2) CHECK (wholesale10_price >= 0),
  ADD COLUMN minimum_price decimal(18,2) CHECK (minimum_price >= 0);
-- adapters/postgres/migrations/0010_sales_settlement_method_snapshot.sql
ALTER TABLE naijue_erp.sales_settlement
  ADD COLUMN payment_method_id_snapshot uuid REFERENCES naijue_erp.payment_method(id);
-- adapters/postgres/migrations/0011_history_storage.sql
ALTER TABLE naijue_erp.import_batch
  ADD COLUMN history_expected_counts jsonb CHECK (history_expected_counts IS NULL OR naijue_erp.valid_history_counts(history_expected_counts)),
  ADD COLUMN history_actual_counts jsonb CHECK (history_actual_counts IS NULL OR naijue_erp.valid_history_counts(history_actual_counts)),
  ADD COLUMN history_payload_hash text CHECK (history_payload_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN history_validation_passed boolean NOT NULL DEFAULT false;
-- adapters/postgres/migrations/0015_native_import_record_accounting.sql
ALTER TABLE naijue_erp.import_record ADD CONSTRAINT import_record_accounting_identity
  UNIQUE (import_batch_id,id,target_type,target_id);
-- adapters/postgres/migrations/0017_native_payment_import.sql
ALTER TABLE naijue_erp.import_native_payment_binding ADD CONSTRAINT native_payment_relation_fk
  FOREIGN KEY(native_payment_account_id,native_hall_id) REFERENCES naijue_erp.payment_account_hall(payment_account_id,hall_id);
```
