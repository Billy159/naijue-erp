"""PREPARED, NOT EXECUTED. Three original gaps; closed unchanged finite fixture.

Root-only headed Chromium, native production manifest, real UI gestures only.
No command/receipt/prepare requests reach the bridge. No DTO rewrite, JS app-state
mutation, business save, new account, PostgreSQL, external network or forced click.
"""
import argparse
import hashlib
import json
import mimetypes
import re
import select
import subprocess
import sys
import traceback
from pathlib import Path
from urllib.parse import unquote, urlsplit

IDS = ['N34-T08-VOID-CONTEXT-01', 'N34-I04-FIT-SEARCH-TOGGLE-01', 'N34-S10-PAYMENT-KEY-FOCUS-01']
p = argparse.ArgumentParser()
p.add_argument('repo'); p.add_argument('build'); p.add_argument('out')
p.add_argument('--expected-checkpoint', required=True)
p.add_argument('--case', action='append', choices=IDS)
p.add_argument('--i04-kind', action='append', choices=['fit', 'season', 'supplier', 'warehouse'],
               help='Run only these I04 candidate kinds; does not claim skipped kinds')
p.add_argument('--node', default='node'); p.add_argument('--chromium', default='/usr/bin/chromium')
p.add_argument('--headed', action='store_true'); p.add_argument('--keep-open', action='store_true')
a = p.parse_args()
if not a.headed: p.error('Root-owned native headed execution is required')
repo, build, out = [Path(x).resolve() for x in (a.repo, a.build, a.out)]
out.mkdir(parents=True, exist_ok=False)
bridge_path = repo / 'apps/web/demo-replica/tests/foundation-readonly-fixture.mjs'
sys.path.insert(0, str(bridge_path.parent))
result = {'status': 'RUNNING', 'wholePass': False, 'syntheticOnly': True,
          'cases': [], 'checks': [], 'screens': [], 'requests': [], 'readResponses': [],
          'forbiddenCommands': [], 'externalRequests': [], 'errors': [], 'consoleErrors': [], 'cleanupErrors': [],
          'limits': ['Original listed substeps only; no whole finding/page acceptance.',
                     'Unchanged finite synthetic QA fixture; not real login, PostgreSQL or production.',
                     'T08 only displays and dismisses confirmations; no VOID/APPROVE/UNAPPROVE submission.',
                     'Payment is only an unsaved RETURN-mode draft; no claim that it could SAVE or APPROVE.',
                     'I04 selection drafts only; no inventory query or business write.',
                     'No same-state frozen-Demo pixel comparison or cross-version PASS inference.']}
bridge = browser = page = None
contexts = []
current_case = step = 'preflight'
origin = base = ''

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def persist():
    (out / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
def check(name, actual=None):
    result['checks'].append({'caseId': current_case, 'step': step, 'name': name, 'actual': actual})
    persist()
def begin(name):
    global step
    step = name; result['activeCase'] = current_case; result['activeStep'] = name
def read(path, body=None, method='POST', headers=None, source='preflight'):
    packet = {'url': origin + path, 'method': method, 'headers': headers or {},
              'body': None if body is None else json.dumps(body)}
    bridge.stdin.write(json.dumps(packet) + '\n'); bridge.stdin.flush()
    if not select.select([bridge.stdout], [], [], 45)[0]: raise TimeoutError('Unchanged read bridge timed out: ' + path)
    line = bridge.stdout.readline()
    if not line: raise RuntimeError('Unchanged read bridge ended: ' + path)
    response = json.loads(line)
    value = json.loads(response['body'])
    result['readResponses'].append({'caseId': current_case, 'step': step, 'source': source,
                                   'path': path, 'method': method, 'request': body,
                                   'status': response['status'], 'body': value})
    return response, value
def require_read(path, body=None, method='POST'):
    response, value = read(path, body, method)
    assert response['status'] == 200, (path, response['status'], value)
    return value
def api_count(path):
    return sum(q['source'] == 'browser' and q['path'] == path for q in result['readResponses'])
def healthy():
    assert not result['errors'], result['errors']
    assert not result['externalRequests'], result['externalRequests']
    assert not result['forbiddenCommands'], result['forbiddenCommands']
    visible = page.locator('[role="alert"]:visible')
    assert not [x.strip() for x in visible.all_inner_texts() if x.strip()], visible.all_inner_texts()
def respond(route):
    request = route.request; url = urlsplit(request.url)
    body = json.loads(request.post_data) if request.post_data else None
    result['requests'].append({'caseId': current_case, 'step': step, 'method': request.method,
                               'url': request.url, 'body': body})
    if f'{url.scheme}://{url.netloc}' != origin:
        result['externalRequests'].append(request.url); route.abort(); return
    if url.path.startswith('/api/'):
        # Stop BEFORE invoking the bridge, including receipt reads/preparation.
        allowed = request.method == 'GET' and url.path == '/api/auth/session' or request.method == 'POST' and url.path.endswith('/query')
        if not allowed:
            result['forbiddenCommands'].append({'method': request.method, 'path': url.path, 'body': body})
            route.abort(); return
        response, _ = read(url.path, body, request.method, request.headers, 'browser')
        route.fulfill(status=response['status'], headers=response['headers'], body=response['body']); return
    relative = 'index.html' if url.path == '/' else unquote(url.path[len(base):]) if url.path.startswith(base) else ''
    if relative not in allowed_assets:
        route.fulfill(status=404, body='Not a fixed native build output'); return
    mime = 'application/javascript' if relative.endswith('.js') else mimetypes.guess_type(relative)[0] or 'application/octet-stream'
    route.fulfill(status=200, content_type=mime, body=(build / relative).read_bytes())
def fresh(route):
    global page
    ctx = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    contexts.append(ctx); ctx.route('**/*', respond)
    ctx.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = ctx.new_page(); page.on('pageerror', lambda error: result['errors'].append(str(error)))
    page.on('console', lambda msg: result['consoleErrors'].append({'step': step, 'text': msg.text}) if msg.type == 'error' else None)
    page.goto(origin + '/#' + route); page.bring_to_front()
    page.locator('.basic-account button').first.wait_for()
    page.locator('#page h1').wait_for()
    return page
def shot(label):
    filename = f'{len(result["screens"]):02d}-{label}.png'
    page.screenshot(path=str(out / filename), full_page=True, animations='disabled')
    result['screens'].append({'path': filename, 'caseId': current_case, 'step': step,
                              'url': page.url, 'viewport': page.viewport_size,
                              'sourceCheckpoint': a.expected_checkpoint})
def snapshot():
    # Read-only DOM inspection. Application/session/React state is never touched.
    return page.locator('#page').evaluate('''el=>({text:el.innerText,
      values:[...el.querySelectorAll('input,textarea,select')].map(x=>({label:x.getAttribute('aria-label'),value:x.value})),
      top:el.scrollTop,left:el.scrollLeft})''')
def same_focus(control):
    return control.evaluate('el=>el===el.getRootNode().activeElement')
def tab_to(control):
    # Native sequential keyboard traversal, not a JS focus or dispatchEvent.
    for _ in range(8):
        page.keyboard.press('Tab')
        if same_focus(control): break
    expect(control).to_be_focused()

def t08():
    global current_case
    current_case = IDS[0]
    targets = [('transfer', 'transfers', '00000000-0000-4000-8000-000000730000', 'DRAFT', '作废', '确认作废调拨单'),
               ('sales', 'sales', '00000000-0000-4000-8000-000000700000', 'DRAFT', '作废', '确认作废销货单'),
               ('sales', 'sales', '00000000-0000-4000-8000-000000700001', 'APPROVED', '弃审', '确认弃审')]
    for route, endpoint, identity, status, action, title in targets:
        begin(route + '-' + action + '-read-original')
        key = 'transferId' if route == 'transfer' else 'salesId'
        original = require_read('/api/' + endpoint + '/detail/query', {key: identity})
        header = original['document']['header']
        assert header['id'] == identity and header['status'] == status and original['stockBasis'] == 'RUNTIME_LEDGER'
        fresh(route + '/view/' + identity)
        expect(page.get_by_role('heading', name='查看调拨单' if route == 'transfer' else '查看销货单', exact=True)).to_be_visible()
        trigger = page.get_by_role('button', name=action, exact=True)
        expect(trigger).to_be_enabled(); expect(page.locator('#page')).to_contain_text(header['number'])
        healthy(); before = snapshot(); before_url = page.url
        for dismissal in ['取消', 'Escape', '关闭']:
            begin(route + '-' + action + '-' + dismissal)
            trigger.click()
            dialog = page.get_by_role('dialog', name=title, exact=True)
            expect(dialog).to_be_visible()
            expect(dialog.get_by_role('heading', name=title, exact=True)).to_be_visible()
            if action == '作废':
                expect(dialog).to_contain_text(header['number'])
                expect(dialog).to_contain_text('作废后不能再编辑或审核')
                expect(dialog).to_contain_text('操作记录会保留')
                expect(dialog.get_by_role('button', name='确认作废', exact=True)).to_be_enabled()
                expect(dialog.get_by_role('button', name='确定', exact=True)).to_have_count(0)
            else:
                for text in ['撤销本单已生效的库存影响', '结算明细保留', '保留操作历史', '可修改并重新审核']:
                    expect(dialog).to_contain_text(text)
                expect(dialog.get_by_role('button', name='确认弃审', exact=True)).to_be_enabled()
            shot(route + '-' + action + '-' + dismissal + '-confirm')
            if dismissal == 'Escape': page.keyboard.press('Escape')
            else: dialog.get_by_role('button', name=dismissal, exact=True).click()
            expect(dialog).to_have_count(0); expect(trigger).to_be_focused()
            assert page.url == before_url and snapshot() == before
            healthy(); check('native confirmation dismissed with original document/route/DOM/focus intact', {'number': header['number'], 'status': status, 'dismissal': dismissal})
        latest = require_read('/api/' + endpoint + '/detail/query', {key: identity})
        assert latest == original, 'Read-only fixture document changed'
        shot(route + '-' + action + '-unchanged')
    result['cases'].append({'caseId': current_case, 'status': 'PASS_LISTED_STEPS_ONLY', 'wholePass': False,
                            'steps': '3 existing documents × Cancel/Esc/Close; exact copy and action labels; original DOM/focus/route and detail unchanged; zero commands'})

def candidate_body(kind, search=''):
    return {'kind': kind, 'search': search, 'page': 1, 'pageSize': 20, 'selectedIds': [], 'categoryIds': []}
def node(host, label):
    return host.locator('.arco-tree-node').filter(has=page.locator('.arco-tree-node-title').filter(has_text=re.compile('^' + re.escape(label) + '$')))
def inventory_visible_popup(host):
    # Reopen through the original view if a preceding tag/layout transition has
    # actually dismissed the menu. Never click an old hidden portal or input.
    popup = host.locator('.arco-tree-select-popup:visible')
    if popup.count() == 0:
        host.locator('.arco-tree-select-view').click(position={'x': 6, 'y': 16})
    expect(popup).to_have_count(1); expect(popup).to_be_visible()
    expect(host.locator('.arco-tree-select-trigger:visible')).to_have_css('pointer-events', 'auto')
    return popup
def click_inventory_title(host, label):
    popup = inventory_visible_popup(host)
    target = popup.locator('.arco-tree-node:visible').filter(
        has=page.locator('.arco-tree-node-title').filter(has_text=re.compile('^' + re.escape(label) + '$')))
    expect(target).to_have_count(1)
    title = target.locator('.arco-tree-node-title')
    expect(title).to_be_visible(); title.click()
def inventory_open(kind, key, all_label):
    fresh('inventory'); expect(page.get_by_role('heading', name='库存状况表', exact=True)).to_be_visible()
    page.locator('.iw-filter-toggle').click(); host = page.locator('#inventory-arco-' + key)
    host.locator('.arco-tree-select-view').click(position={'x': 6, 'y': 16})
    expect(host.locator('.arco-tree-select-popup')).to_be_visible()
    expect(node(host, all_label).get_by_role('checkbox')).to_be_checked()
    return host
def inventory_set_check(host, rows, selected):
    expect(host.locator('.arco-tree-node-title')).to_have_count(len(rows) + 1)
    for row in rows:
        cb = node(host, row['label']).get_by_role('checkbox')
        if row['id'] in selected: expect(cb).to_be_checked()
        else: expect(cb).not_to_be_checked()
def inventory_search(host, kind, search, target):
    field = host.locator('.arco-tree-select-view input')
    with page.expect_response(lambda r: urlsplit(r.url).path == '/api/inventory/candidates/query' and r.request.post_data_json.get('kind') == kind and r.request.post_data_json.get('search') == search):
        field.fill(search)
    expect(node(host, target['label'])).to_be_visible()
    expect(host.locator('.inv-filter-tools')).to_contain_text('匹配 1 项')
    return field
def i04():
    global current_case
    current_case = IDS[1]
    cases = [('fit', 'fits', '全部版型', 'Y', '00000000-0000-4000-8000-000000002100'),
             ('season', 'seasons', '全部季节', '春', '00000000-0000-4000-8000-000000002200'),
             ('supplier', 'suppliers', '全部供应商', '华成', '00000000-0000-4000-8000-000000003100'),
             ('warehouse', 'warehouses', '全部仓库', '温州', '00000000-0000-4000-8000-000000003302')]
    before_queries = api_count('/api/inventory/query')
    for kind, key, all_label, search, identity in cases:
        if a.i04_kind and kind not in a.i04_kind: continue
        all_data = require_read('/api/inventory/candidates/query', candidate_body(kind))
        rows = all_data['items']; assert all_data['page'] == 1 and all_data['exactTotal'] == len(rows)
        target = next(row for row in rows if row['id'] == identity)
        search_data = require_read('/api/inventory/candidates/query', candidate_body(kind, search))
        assert search_data['exactTotal'] == 1 and search_data['items'] == [target]
        for method in ['mouse', 'Space']:
            begin(kind + '-all-search-remove-' + method)
            host = inventory_open(kind, key, all_label)
            inventory_set_check(host, rows, {r['id'] for r in rows})
            field = inventory_search(host, kind, search, target)
            cb = node(host, target['label']).get_by_role('checkbox'); expect(cb).to_be_checked()
            shot(kind + '-' + method + '-search-before')
            if method == 'mouse': node(host, target['label']).locator('.arco-tree-node-title').click()
            else: tab_to(cb); page.keyboard.press('Space')
            expect(field).to_have_value('')
            expected = {r['id'] for r in rows if r['id'] != identity}
            inventory_set_check(host, rows, expected)
            expect(node(host, all_label).get_by_role('checkbox')).not_to_be_checked()
            expect(host.locator('.inv-filter-tools')).to_contain_text('已选 ' + str(len(expected)) + ' 项')
            shot(kind + '-' + method + '-committed-with-search-cleared')
            page.get_by_role('heading', level=1).click(); expect(host.locator('.arco-tree-select-popup')).not_to_be_visible()
            host.locator('.arco-tree-select-view').click(position={'x': 6, 'y': 16})
            expect(host.locator('.arco-tree-select-popup')).to_be_visible(); inventory_set_check(host, rows, expected)
            if kind == 'fit':
                # Original non-All branch: after removing Y, search A and remove it.
                begin('fit-nonall-search-remove-' + method)
                other = next(r for r in rows if r['id'] == '00000000-0000-4000-8000-000000002101')
                field = inventory_search(host, kind, 'A', other); other_cb = node(host, other['label']).get_by_role('checkbox')
                expect(other_cb).to_be_checked()
                if method == 'mouse': node(host, other['label']).locator('.arco-tree-node-title').click()
                else: tab_to(other_cb); page.keyboard.press('Space')
                expect(field).to_have_value(''); expected.remove(other['id']); inventory_set_check(host, rows, expected)
                shot('fit-nonall-' + method + '-four-remain')
            if kind == 'warehouse':
                # Original I03 merged branch: a zero-selection draft must really add one.
                begin('warehouse-zero-search-add-' + method)
                # Arco's real native input is intentionally 0×0/opacity:0;
                # assertion/Tab-Space may use it, but mouse must use its visible
                # original row title. Resolve the live portal anew each time.
                click_inventory_title(host, all_label)
                expect(node(host, all_label).get_by_role('checkbox')).to_be_checked()
                inventory_set_check(host, rows, {r['id'] for r in rows})
                click_inventory_title(host, all_label)
                expect(node(host, all_label).get_by_role('checkbox')).not_to_be_checked()
                inventory_set_check(host, rows, set())
                shot('warehouse-zero-' + method + '-actual-none-before-search')
                inventory_visible_popup(host)
                field = inventory_search(host, kind, search, target); cb = node(host, target['label']).get_by_role('checkbox')
                expect(cb).not_to_be_checked()
                if method == 'mouse': node(host, target['label']).locator('.arco-tree-node-title').click()
                else: tab_to(cb); page.keyboard.press('Space')
                expect(field).to_have_value(''); inventory_set_check(host, rows, {identity})
                expect(host.locator('.inv-filter-tools')).to_contain_text('已选 1 项')
                shot('warehouse-zero-' + method + '-one-remains')
            page.get_by_role('heading', level=1).click(); healthy()
            assert api_count('/api/inventory/query') == before_queries, 'Draft choice unexpectedly executed inventory query'
            check('search selection committed before automatic clear and retained exact identity set', {'kind': kind, 'method': method})
    result['cases'].append({'caseId': current_case, 'relatedOriginalCaseIds': ['N34-I03-KEYBOARD-SPACE-01'],
                            'status': 'PASS_LISTED_STEPS_ONLY', 'wholePass': False,
                            'candidateKindsRun': a.i04_kind or ['fit', 'season', 'supplier', 'warehouse'],
                            'steps': 'Listed finite candidate kinds only: All→search→remove by mouse and real Tab/Space; fit non-All / warehouse zero→one where selected; reopen exact checks; zero inventory queries',
                            'limits': 'Any omitted candidate kind remains untested by this invocation; prior evidence retains its own result and checkpoint'})

def s10():
    global current_case
    current_case = IDS[2]; begin('new-return-draft-with-existing-references')
    fresh('sales/new'); expect(page.get_by_role('heading', name='新增销货单', exact=True)).to_be_visible()
    def pick(label, option):
        combo = page.get_by_role('combobox', name=label, exact=True); combo.click()
        page.get_by_role('option', name=option, exact=True).click()
        expect(combo).to_contain_text(option)
    pick('业务类型', '退货/换货'); pick('营业厅', '网点营业厅')
    note = page.get_by_role('textbox', name='备注', exact=True); note.fill('原S10第二第三笔键盘焦点保留')
    query = page.get_by_role('combobox', name='商品款号 / 名称 / 条码', exact=True).first
    query.fill('ZZZ_S10_KEEP_QUERY')
    expect(page.get_by_role('dialog', name='商品候选', exact=True)).to_contain_text('没有匹配结果')
    query.press('Escape'); expect(query).to_have_value('ZZZ_S10_KEEP_QUERY')
    refs = require_read('/api/current-form/sales-references/query', {'kind': 'paymentMethod', 'hallId': '00000000-0000-4000-8000-000000003200', 'search': '', 'page': 1, 'pageSize': 20})
    assert {'现金', '微信'}.issubset({r['name'] for r in refs['items']}), refs
    row = lambda index: page.locator('[data-funds-row="' + str(index) + '"]')
    host = lambda index, kind: row(index).locator(':scope > div').nth(0 if kind == '支付方式' else 1)
    amount = lambda index: row(index).get_by_role('textbox', name=f'第{index+1}笔收款金额', exact=True)
    def retained():
        expect(note).to_have_value('原S10第二第三笔键盘焦点保留')
        expect(query).to_have_value('ZZZ_S10_KEEP_QUERY')
        expect(page.get_by_role('combobox', name='业务类型', exact=True)).to_contain_text('退货/换货')
    def keyboard_select(index, kind, name):
        begin(f'row{index+1}-{kind}-search-{name}-ArrowDown-Enter')
        owner = host(index, kind)
        combo = owner.get_by_role('combobox', name=f'第{index+1}笔{kind}', exact=True)
        combo.click(); field = combo.locator('input'); expect(field).to_be_visible(); field.fill(name)
        option = owner.get_by_role('option', name=name, exact=True)
        expect(option).to_be_visible(); expect(owner.get_by_role('option')).to_have_count(1)
        actual_read = next(r for r in reversed(result['readResponses'])
                           if r['source'] == 'browser' and r['path'] == '/api/current-form/sales-references/query'
                           and r['request'].get('kind') == ('paymentMethod' if kind == '支付方式' else 'paymentAccount')
                           and r['request'].get('search') == name)
        assert actual_read['status'] == 200 and len(actual_read['body']['items']) == 1, actual_read
        candidate = actual_read['body']['items'][0]; assert candidate['name'] == name
        if kind == '资金账户':
            method_id = '00000000-0000-4000-8000-000000003400' if name == '现金测试账户' else '00000000-0000-4000-8000-000000003402'
            assert actual_read['request']['paymentMethodId'] == method_id and candidate['paymentMethodId'] == method_id
        field.press('ArrowDown'); field.press('Enter')
        expect(combo).to_contain_text(name); expect(owner.locator('.arco-select-popup')).not_to_be_visible()
        next_field = host(index, '资金账户').locator('.arco-select-view input') if kind == '支付方式' else amount(index)
        expect(next_field).to_be_enabled(); expect(next_field).to_be_focused()
        retained(); shot(f'row{index+1}-{kind}-{name}-focus-next')
        check('keyboard selection moves to exact same-row next input across SourceControl shadow portal', {'row': index + 1, 'kind': kind, 'selected': name, 'actualCandidateId': candidate['id'], 'nextLabel': f'第{index+1}笔' + ('资金账户' if kind == '支付方式' else '收款金额')})
    keyboard_select(0, '支付方式', '现金'); keyboard_select(0, '资金账户', '现金测试账户'); amount(0).fill('0.00')
    row(0).get_by_role('button', name='添加', exact=True).click(); expect(row(1)).to_be_visible()
    keyboard_select(1, '支付方式', '微信'); keyboard_select(1, '资金账户', '微信测试账户'); amount(1).fill('5')
    keyboard_select(1, '支付方式', '现金')
    expect(host(1, '资金账户')).not_to_contain_text('微信测试账户')
    expect(host(1, '资金账户').locator('.arco-select-view input')).to_have_value('')
    expect(amount(1)).to_have_value('5')
    expect(amount(0)).to_have_value('0.00'); expect(host(0, '资金账户')).to_contain_text('现金测试账户')
    keyboard_select(1, '资金账户', '现金测试账户')
    row(1).get_by_role('button', name='添加', exact=True).click(); expect(row(2)).to_be_visible()
    keyboard_select(2, '支付方式', '微信'); keyboard_select(2, '资金账户', '微信测试账户'); amount(2).fill('0.00')
    keyboard_select(2, '支付方式', '现金')
    expect(host(2, '资金账户')).not_to_contain_text('微信测试账户')
    expect(host(2, '资金账户').locator('.arco-select-view input')).to_have_value('')
    expect(amount(2)).to_have_value('0.00')
    expect(amount(1)).to_have_value('5'); expect(host(1, '资金账户')).to_contain_text('现金测试账户')
    expect(amount(0)).to_have_value('0.00'); expect(host(0, '资金账户')).to_contain_text('现金测试账户')
    keyboard_select(2, '资金账户', '现金测试账户'); retained(); healthy()
    begin('payment-picker-Esc-no-change')
    before = snapshot(); control = host(1, '支付方式').get_by_role('combobox', name='第2笔支付方式', exact=True)
    control.click(); expect(host(1, '支付方式').locator('.arco-select-popup')).to_be_visible()
    control.locator('input').press('Escape'); expect(host(1, '支付方式').locator('.arco-select-popup')).not_to_be_visible()
    assert snapshot() == before; retained()
    for index, value in [(0, '0.00'), (1, '5'), (2, '0.00')]:
        expect(amount(index)).to_have_value(value)
        expect(host(index, '支付方式')).to_contain_text('现金')
        expect(host(index, '资金账户')).to_contain_text('现金测试账户')
    healthy(); shot('payment-three-rows-unsaved-intact')
    check('second/third switch clears only same-row old account; all amounts/note/query preserved; Esc no mutation')
    result['cases'].append({'caseId': current_case, 'status': 'PASS_LISTED_STEPS_ONLY', 'wholePass': False,
                            'steps': 'First cash method/account keyboard; second and third WeChat→cash with prior account; exact shadow input focus and per-row clearing; amounts/query/note retained; Esc no change',
                            'limits': 'RETURN-mode unsaved draft only; no selected SKU or save-readiness claim; no EXCHANGE nonempty mode, SALE mode or real login/PG'})

class BrowserLaunchBlocked(Exception):
    pass

def record_failure(error, *, capture_ui):
    """Keep the first failure primary; diagnostics may never replace its reason."""
    if result.get('reason') and result['status'] in ['FAIL', 'BLOCKED_ENV']:
        result['cleanupErrors'].append({'stage': 'later-exception', 'error': str(error),
                                        'traceback': traceback.format_exc()})
        return
    result.update(status='BLOCKED_ENV' if isinstance(error, BrowserLaunchBlocked) else 'FAIL',
                  reason=str(error), failureCase=current_case, failureStep=step,
                  traceback=traceback.format_exc())
    # Called inside the sync_playwright lifetime whenever capture_ui is True.
    if capture_ui and page:
        captures = [('failure.png', lambda: page.screenshot(path=str(out / 'failure.png'), full_page=True, animations='disabled')),
                    ('failure-dom.html', lambda: (out / 'failure-dom.html').write_text(page.content())),
                    ('failure-visible-text.txt', lambda: (out / 'failure-visible-text.txt').write_text(page.locator('body').inner_text()))]
        for label, capture in captures:
            try:
                if not page.is_closed(): capture()
            except Exception as capture_error:
                result['cleanupErrors'].append({'stage': 'capture-' + label, 'error': str(capture_error)})
    persist()
    print(json.dumps({'status': result['status'], 'caseId': current_case, 'step': step,
                      'reason': result['reason']}, ensure_ascii=False), flush=True)

def cleanup_ui():
    """Run before sync_playwright exits; trace and close failures stay secondary."""
    global browser
    for index, ctx in enumerate(contexts):
        try: ctx.tracing.stop(path=str(out / f'trace-{index:02d}.zip'))
        except Exception as error:
            result['cleanupErrors'].append({'stage': f'trace-stop-{index}', 'error': str(error)})
        try: ctx.close()
        except Exception as error:
            result['cleanupErrors'].append({'stage': f'context-close-{index}', 'error': str(error)})
    if browser:
        try: browser.close()
        except Exception as error:
            result['cleanupErrors'].append({'stage': 'browser-close', 'error': str(error)})
        browser = None
    persist()

try:
    manifest = json.loads((build / 'production-build.json').read_text())
    assert manifest['sourceCheckpoint'] == a.expected_checkpoint
    assert subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip() == a.expected_checkpoint
    for item in manifest['inputs']:
        path = repo / item['path']; assert path.is_file() and sha(path) == item['sha256'], 'Native input drift: ' + item['path']
    for item in manifest['outputs']:
        path = build / item['path']; assert path.is_file() and sha(path) == item['sha256'], 'Native output drift: ' + item['path']
    cfg = manifest['configuration']; origin = cfg['http']['origin']; base = cfg['assets']['basePath']
    assert origin == 'https://synthetic-management.invalid'
    for flag in ['inventory', 'sales', 'transfers', 'salesManualCreate', 'salesExistingEdit', 'transferExistingEdit']:
        assert cfg['routes'].get(flag) is True, 'Required existing test-only UI capability missing: ' + flag
    allowed_assets = {item['path'] for item in manifest['outputs']} | {'index.html'}
    bound = ['apps/web/demo-replica/tests/foundation-readonly-fixture.mjs',
             'apps/web/demo-replica/frontend/qa-reference-fixtures.mts',
             'apps/web/demo-replica/frontend/runtime/documents/sales-detail-page.tsx',
             'apps/web/demo-replica/frontend/runtime/documents/transfers-detail-page.tsx',
             'apps/web/demo-replica/frontend/runtime/documents/proposal-form.tsx',
             'apps/web/demo-replica/frontend/runtime/documents/proposal-picker.tsx',
             'apps/web/demo-replica/frontend/runtime/inventory/candidates.tsx']
    result.update(sourceCheckpoint=a.expected_checkpoint, buildManifestSha256=sha(build / 'production-build.json'),
                  configuration=cfg, scriptSha256=sha(Path(__file__)),
                  sourceHashes=[{'path': file, 'sha256': sha(repo / file)} for file in bound])
    bridge = subprocess.Popen([a.node, '--experimental-transform-types', str(bridge_path)],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1,
                              stderr=(out / 'fixture-stderr.log').open('w'))
    auth = require_read('/api/auth/session', method='GET')
    assert auth['principal']['role'] == 'ADMIN', 'Do not rewrite existing finite fixture identity'
    from playwright.sync_api import sync_playwright, expect
    with sync_playwright() as pw:
        try:
            try: browser = pw.chromium.launch(executable_path=a.chromium, headless=False, chromium_sandbox=True)
            except Exception as error: raise BrowserLaunchBlocked(str(error)) from error
            for identity, fn in zip(IDS, [t08, i04, s10]):
                if not a.case or identity in a.case:
                    fn(); healthy(); persist()
            assert not result['consoleErrors'], result['consoleErrors']
            assert all(x['status'] == 'PASS_LISTED_STEPS_ONLY' for x in result['cases'])
            result['status'] = 'PASS_LISTED_STEPS_ONLY'; result['activeStep'] = 'finished'; persist()
            print(json.dumps({'status': result['status'], 'cases': result['cases'], 'wholePass': False}, ensure_ascii=False), flush=True)
            if a.keep_open:
                from visible_wait import keep_visible
                keep_visible(page)
        except Exception as error:
            record_failure(error, capture_ui=True)
        finally:
            cleanup_ui()
except Exception as error:
    # Preflight/import/start/shutdown failures only. Never call UI after __exit__.
    record_failure(error, capture_ui=False)
finally:
    if bridge:
        try: bridge.terminate(); bridge.wait(timeout=5)
        except Exception as error: result['cleanupErrors'].append({'stage': 'bridge-close', 'error': str(error)})
    result['cleanupStatus'] = 'FAIL' if result['cleanupErrors'] else 'PASS'
    result['executionStatus'] = ('BLOCKED_ENV' if result['status'] == 'BLOCKED_ENV' else
                                 'PASS' if result['status'] == 'PASS_LISTED_STEPS_ONLY' and not result['cleanupErrors'] else 'FAIL')
    persist()
sys.exit(2 if result['executionStatus'] == 'BLOCKED_ENV' else 0 if result['executionStatus'] == 'PASS' else 1)
