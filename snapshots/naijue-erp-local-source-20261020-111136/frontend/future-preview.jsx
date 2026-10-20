import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Alert, Button, Card, Modal, Table, Tabs, Tag } from '@arco-design/web-react';

const PREVIEWS = [
  {
    id: 'purchase',
    tab: '采购',
    title: '采购预览',
    summary: '采购申请、订单和到货流程的界面占位。',
    future: ['供应方与采购申请的管理入口', '采购订单及到货登记的流程展示', '采购与库存变动的授权校验'],
    boundaries: ['当前没有真实采购单、供应方或商品数据', '没有创建、审核、收货或付款入口'],
    columns: [
      { title: '示例单据', dataIndex: 'document' },
      { title: '样例对象', dataIndex: 'party' },
      { title: '示例内容', dataIndex: 'content' },
      { title: '标记', dataIndex: 'status', render: () => <Tag color="arcoblue">预览</Tag> },
    ],
    rows: [
      { key: 'purchase-1', document: '样例采购单-01', party: '样例供应方', content: '到货流程占位', status: '预览' },
      { key: 'purchase-2', document: '样例采购单-02', party: '样例供应方', content: '商品关联占位', status: '预览' },
    ],
  },
  {
    id: 'finance',
    tab: '财务',
    title: '财务预览',
    summary: '收付款、账户和对账信息的页面占位。',
    future: ['收款与付款业务的受权入口', '资金账户和往来核对视图', '单据、结算与资金记录的关联'],
    boundaries: ['不读取真实账户、余额或资金流水', '不展示金额，不执行收款、付款或对账'],
    columns: [
      { title: '样例事项', dataIndex: 'item' },
      { title: '未来区块', dataIndex: 'section' },
      { title: '当前示意', dataIndex: 'display' },
      { title: '标记', dataIndex: 'status', render: () => <Tag color="arcoblue">预览</Tag> },
    ],
    rows: [
      { key: 'finance-1', item: '收款核对', section: '资金往来', display: '未接入', status: '预览' },
      { key: 'finance-2', item: '账户对账', section: '账户管理', display: '未接入', status: '预览' },
    ],
  },
  {
    id: 'cost-profit',
    tab: '成本毛利',
    title: '成本与毛利预览',
    summary: '未来成本口径和毛利结果的展示占位；当前不计算数值。',
    future: ['待明确成本来源、分摊规则和适用单据', '待确认毛利口径及历史数据处理方式', '口径和数据通过后再设计授权分析入口'],
    boundaries: ['不读取实际库存、商品采购价或销售单', '不计算或展示成本、毛利数值', '绝不以实际库存数量乘虚构价格冒充真实成本或毛利'],
    columns: [
      { title: '未来项目', dataIndex: 'item' },
      { title: '当前状态', dataIndex: 'display' },
      { title: '说明', dataIndex: 'note' },
      { title: '标记', dataIndex: 'status', render: () => <Tag color="arcoblue">预览</Tag> },
    ],
    rows: [
      { key: 'cost-1', item: '成本来源', display: '未接入', note: '未来需先确认数据来源与规则', status: '预览' },
      { key: 'cost-2', item: '成本 / 毛利结果', display: '当前不计算', note: '当前没有可供展示的真实口径', status: '预览' },
      { key: 'cost-3', item: '库存关联', display: '未读取', note: '不使用实际库存乘虚构价格', status: '预览' },
    ],
  },
  {
    id: 'analysis',
    tab: '经营分析',
    title: '经营分析预览',
    summary: '经营指标与趋势报告的静态版式占位。',
    future: ['按已确认口径呈现经营趋势', '按角色和对象范围限制报告数据', '解释数据来源、期间与缺失情况'],
    boundaries: ['不读取真实单据或当前库存', '不计算经营指标，不生成真实分析结论'],
    columns: [
      { title: '示例区块', dataIndex: 'item' },
      { title: '输出占位', dataIndex: 'display' },
      { title: '数据状态', dataIndex: 'source' },
      { title: '标记', dataIndex: 'status', render: () => <Tag color="arcoblue">预览</Tag> },
    ],
    rows: [
      { key: 'analysis-1', item: '经营趋势', display: '图表区域占位', source: '未接入真实单据', status: '预览' },
      { key: 'analysis-2', item: '业务结构', display: '分类区域占位', source: '指标口径待定', status: '预览' },
    ],
  },
  {
    id: 'owner-dashboard',
    tab: '老板看板',
    title: '老板看板预览',
    summary: '经营摘要、异常提醒和关键区块的布局占位。',
    future: ['汇总已授权范围内的经营摘要', '展示可回溯的指标定义与更新时间', '提供异常线索并链接到受权业务详情'],
    boundaries: ['不显示经营指标或资金数值', '不聚合真实业务数据，不创建或改变业务事实'],
    columns: [
      { title: '看板区块', dataIndex: 'item' },
      { title: '示例状态', dataIndex: 'display' },
      { title: '后续说明', dataIndex: 'note' },
      { title: '标记', dataIndex: 'status', render: () => <Tag color="arcoblue">预览</Tag> },
    ],
    rows: [
      { key: 'owner-1', item: '经营摘要', display: '区块占位', note: '指标定义尚未接入', status: '预览' },
      { key: 'owner-2', item: '异常提醒', display: '区块占位', note: '不基于真实业务判断', status: '预览' },
    ],
  },
];

function PreviewHub() {
  const [activeId, setActiveId] = useState(PREVIEWS[0].id);
  const [detailVisible, setDetailVisible] = useState(false);
  const active = PREVIEWS.find((item) => item.id === activeId) || PREVIEWS[0];
  const columns = active.columns;

  return (
    <div className="future-preview-page" data-preview-status="isolated">
      <header className="future-preview-heading">
        <div>
          <div className="future-preview-eyebrow">
            <Tag color="arcoblue">隔离预览 · Demo</Tag>
            <span>五类未来模块的静态样例</span>
          </div>
          <h1 tabIndex="-1">五类隔离预览</h1>
          <p>仅展示未来能力的页面结构与示例输出；对应真实业务功能尚未实现。</p>
        </div>
      </header>

      <Alert
        className="future-preview-alert"
        type="warning"
        showIcon
        title="本页为隔离预览"
        content="以下内容是静态示例，不读取真实业务数据，也不调用业务写入接口。五类真实业务能力仍需按计划单独授权和实施。"
      />

      <Card className="future-preview-tabs-card" bordered>
        <Tabs activeTab={activeId} onChange={setActiveId} destroyOnHide>
          {PREVIEWS.map((item) => (
            <Tabs.TabPane key={item.id} title={item.tab} />
          ))}
        </Tabs>
      </Card>

      <Card className="future-preview-module" bordered>
        <div className="future-preview-module-heading">
          <div>
            <div className="future-preview-eyebrow">
              <Tag color="arcoblue">预览详情</Tag>
              <span>静态内容 · 未接真实业务数据</span>
            </div>
            <h2>{active.title} · 隔离预览</h2>
            <p>{active.summary}</p>
          </div>
          <Button type="outline" onClick={() => setDetailVisible(true)}>
            查看功能说明
          </Button>
        </div>

        <div className="future-preview-detail-grid">
          <section className="future-preview-detail">
            <div className="future-preview-section-title">
              <h3>未来功能示意</h3>
              <Tag color="arcoblue">仅预览</Tag>
            </div>
            <ul>{active.future.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section className="future-preview-detail">
            <div className="future-preview-section-title">
              <h3>本次范围边界</h3>
              <Tag color="gray">无真实写入</Tag>
            </div>
            <ul>{active.boundaries.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </div>

        <Card
          className="future-preview-output"
          bordered
          title={<span>示例输出 · 隔离预览</span>}
          extra={<Tag color="arcoblue">静态样例</Tag>}
        >
          <Table
            className="future-preview-table"
            rowKey="key"
            columns={columns}
            data={active.rows}
            pagination={false}
            size="small"
          />
          <div className="future-preview-output-note">
            <Tag color="arcoblue">预览示例</Tag>
            <span>表格内容为静态占位，不代表真实单据、余额、库存、成本、毛利或经营指标。</span>
          </div>
        </Card>
      </Card>

      <Modal
        className="future-preview-detail-modal"
        visible={detailVisible}
        title={active.title + ' · 预览详情'}
        footer={null}
        unmountOnExit
        onCancel={() => setDetailVisible(false)}
      >
        <div className="future-preview-modal-body">
          <div className="future-preview-eyebrow">
            <Tag color="arcoblue">隔离预览 · Demo</Tag>
            <span>当前不是可用业务模块</span>
          </div>
          <Alert
            type="warning"
            showIcon
            title="详情说明仍属于预览"
            content="此说明只介绍未来能力的可能范围；不启用接口，不表示已获准实施真实业务。"
          />
          <section>
            <h3>未来功能示意</h3>
            <ul>{active.future.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section>
            <h3>隔离与授权边界</h3>
            <ul>{active.boundaries.map((item) => <li key={item}>{item}</li>)}</ul>
            <p>真实能力需有独立授权、业务规则和验收证据；本次预览不会代替这些步骤。</p>
          </section>
        </div>
      </Modal>
    </div>
  );
}

const roots = new WeakMap();

window.FUTURE_PREVIEW = {
  mount(host) {
    if (!host || roots.has(host)) return;
    const root = createRoot(host);
    roots.set(host, root);
    flushSync(() => root.render(<PreviewHub />));
  },
  unmount(host = document.getElementById('future-preview-root')) {
    const root = host && roots.get(host);
    if (!root) return;
    root.unmount();
    roots.delete(host);
  },
};

window.dispatchEvent(new Event('erp-future-preview-ready'));
