"""Root-owned headed native-build check for the two original filter-feedback gaps.
The existing foundation readonly bridge supplies every successful response unchanged.
The failure check declares one 503 at the candidate boundary (never a fake zero).
No application hooks, successful DTO edits, live data, commands, or database.
"""
import argparse, hashlib, json, mimetypes, re, select, subprocess, sys, traceback
from pathlib import Path
from urllib.parse import urlsplit, unquote

REPO = Path(__file__).resolve().parents[4]
BRIDGE = REPO / 'apps/web/demo-replica/tests/foundation-readonly-fixture.mjs'
sys.path.insert(0, str(BRIDGE.parent))
from visible_wait import keep_visible
p = argparse.ArgumentParser()
p.add_argument('build'); p.add_argument('out'); p.add_argument('--expected-checkpoint', required=True)
p.add_argument('--case', action='append', choices=['N34-I01-SUPPLIER-EMPTY-01', 'N34-S02-STATUS-ORDER-01'])
p.add_argument('--node', default='node'); p.add_argument('--chromium', default='/usr/bin/chromium')
p.add_argument('--headed', action='store_true'); p.add_argument('--keep-open', action='store_true')
a = p.parse_args()
if not a.headed: p.error('Only the root may execute this headed browser case.')
build = Path(a.build).resolve(); out = Path(a.out).resolve(); out.mkdir(parents=True, exist_ok=False)
result = {'status': 'RUNNING', 'wholePass': False, 'syntheticOnly': True, 'cases': [], 'requests': [], 'readResponses': [], 'screens': [], 'forbiddenCommands': [], 'externalRequests': [], 'faults': [], 'scope': 'Candidate-side built UI only; original zero explanation and local status matched-count/order. Not frozen-Demo pixel parity, native/PG, Mac, or production acceptance.'}
bridge = browser = page = None; errors = []; armed_fault = False

def persist():
    result['errors'] = errors
    (out / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def bridge_read(path, body=None, method='POST', headers=None, source='browser'):
    request = {'url': 'https://synthetic-management.invalid' + path, 'method': method, 'headers': headers or {}, 'body': None if body is None else json.dumps(body)}
    bridge.stdin.write(json.dumps(request) + '\n'); bridge.stdin.flush()
    if not select.select([bridge.stdout], [], [], 45)[0]: raise TimeoutError('Unchanged foundation bridge timed out: ' + path)
    line = bridge.stdout.readline()
    if not line: raise RuntimeError('Unchanged foundation bridge ended: ' + path)
    response = json.loads(line)
    result['readResponses'].append({'source': source, 'path': path, 'method': method, 'request': body, 'status': response['status'], 'body': json.loads(response['body'])})
    return response

def candidate_query(kind, search): return {'kind': kind, 'search': search, 'page': 1, 'pageSize': 20, 'selectedIds': [], 'categoryIds': []}

try:
    manifest = json.loads((build / 'production-build.json').read_text()); cfg = manifest['configuration']; origin = cfg['http']['origin']; base = cfg['assets']['basePath']
    assert origin == 'https://synthetic-management.invalid', 'Closed synthetic build required'
    assert manifest['sourceCheckpoint'] == a.expected_checkpoint
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip() == a.expected_checkpoint
    for item in manifest['inputs']:
        file = REPO / item['path']; assert file.is_file() and sha(file) == item['sha256'], 'Native input mismatch: ' + item['path']
    for item in manifest['outputs']:
        file = build / item['path']; assert file.is_file() and sha(file) == item['sha256'], 'Native output mismatch: ' + item['path']
    assert cfg['routes']['inventory'] and cfg['routes']['sales']
    result.update(sourceCheckpoint=a.expected_checkpoint, buildManifestSha256=sha(build / 'production-build.json'), builtAt=manifest['builtAt'], configuration=cfg)
    result['sourceHashes'] = [{'path': name, 'sha256': sha(REPO / name)} for name in ['apps/web/demo-replica/frontend/runtime/inventory/candidates.tsx', 'apps/web/demo-replica/frontend/runtime/documents/source-controls.tsx', 'apps/web/demo-replica/tests/foundation-readonly-fixture.mjs', 'apps/web/demo-replica/tests/filter-feedback-browser.py']]
    allowed = {item['path'] for item in manifest['outputs']} | {'index.html'}
    bridge = subprocess.Popen([a.node, '--experimental-transform-types', str(BRIDGE)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=(out / 'fixture-stderr.log').open('w'), text=True, bufsize=1)
    auth = bridge_read('/api/auth/session', method='GET', source='preflight'); assert auth['status'] == 200
    assert json.loads(auth['body'])['principal']['role'] == 'ADMIN', 'Do not swap fixture identity'
    zero = bridge_read('/api/inventory/candidates/query', candidate_query('supplier', 'ZZZ_NOT_FOUND_827'), source='preflight')
    assert zero['status'] == 200 and json.loads(zero['body']) == {'page': 1, 'exactTotal': 0, 'items': []}, 'Zero must be a valid unchanged candidate DTO, not an error'
    from playwright.sync_api import sync_playwright, expect
    with sync_playwright() as pw:
        try: browser = pw.chromium.launch(executable_path=a.chromium, headless=False, chromium_sandbox=True)
        except Exception as e:
            result.update(status='BLOCKED_ENV', reason=str(e)); persist(); raise SystemExit(2)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
        context.set_default_timeout(15000); page = context.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
        def respond(route):
            global armed_fault
            request = route.request; u = urlsplit(request.url); body = json.loads(request.post_data or '{}') if request.method == 'POST' else None
            result['requests'].append({'method': request.method, 'url': request.url, 'body': body})
            if f'{u.scheme}://{u.netloc}' != origin:
                result['externalRequests'].append(request.url); route.abort(); return
            if u.path.startswith('/api/'):
                if not (request.method == 'GET' and u.path == '/api/auth/session' or request.method == 'POST' and u.path.endswith('/query')):
                    result['forbiddenCommands'].append({'method': request.method, 'path': u.path}); route.abort(); return
                if armed_fault and u.path == '/api/inventory/candidates/query' and body == candidate_query('supplier', 'ZZZ_READ_FAILURE_827'):
                    armed_fault = False
                    fault = {'path': u.path, 'request': body, 'status': 503, 'declaration': 'One-shot unavailable test boundary; no successful fixture response edited', 'body': {'error': {'code': 'SERVICE_UNAVAILABLE', 'message': 'Explicit synthetic candidate unavailable'}}}
                    result['faults'].append(fault); result['readResponses'].append({'source': 'declared-one-shot-fault', **fault})
                    route.fulfill(status=503, content_type='application/json', body=json.dumps(fault['body'])); return
                r = bridge_read(u.path, body, request.method, request.headers)
                route.fulfill(status=r['status'], headers=r['headers'], body=r['body']); return
            relative = 'index.html' if u.path == '/' else unquote(u.path[len(base):]) if u.path.startswith(base) else ''
            if relative not in allowed: route.fulfill(status=404, body='Not in fixed native manifest'); return
            file = build / relative
            mime = 'application/javascript' if relative.endswith('.js') else mimetypes.guess_type(file)[0] or 'application/octet-stream'
            route.fulfill(status=200, content_type=mime, body=file.read_bytes())
        context.route('**/*', respond)
        def count(path): return sum(row['path'] == path and row['source'] == 'browser' for row in result['readResponses'])
        def current(path): return next(row for row in reversed(result['readResponses']) if row['path'] == path)
        def healthy():
            assert not errors, errors
            assert not result['forbiddenCommands'], result['forbiddenCommands']
            assert not result['externalRequests'], result['externalRequests']
        def shot(case, name):
            filename = case + '-' + name + '.png'; page.screenshot(path=str(out / filename), full_page=True)
            result['screens'].append({'path': filename, 'url': page.url, 'viewport': page.viewport_size, 'sourceCheckpoint': a.expected_checkpoint})
        def tree_node(host, text): return host.locator('.arco-tree-node').filter(has=page.locator('.arco-tree-node-title').filter(has_text=re.compile('^' + re.escape(text) + '$')))
        def close_popup(host):
            page.get_by_role('heading', level=1).click(); expect(host.locator('.arco-tree-select-popup')).not_to_be_visible()
        def inventory_case(case):
            global armed_fault
            page.goto(origin + '/#inventory'); page.bring_to_front()
            expect(page.get_by_role('heading', name='库存状况表', exact=True)).to_be_visible()
            before_inventory = count('/api/inventory/query')
            page.locator('.iw-filter-toggle').click()
            for key, kind, label, all_label in [('suppliers', 'supplier', '供应商', '全部供应商'), ('fits', 'fit', '版型', '全部版型'), ('warehouses', 'warehouse', '仓库', '全部仓库'), ('category', 'category', '商品分类', '全部分类')]:
                host = page.locator('#inventory-arco-' + key)
                with page.expect_response(lambda r: urlsplit(r.url).path == '/api/inventory/candidates/query'):
                    host.locator('.arco-tree-select-view').click(position={'x': 6, 'y': 16})
                expect(host.locator('.arco-tree-select-popup')).to_be_visible()
                expect(tree_node(host, all_label).get_by_role('checkbox')).to_be_checked()
                with page.expect_response(lambda r: urlsplit(r.url).path == '/api/inventory/candidates/query'):
                    host.locator('.arco-tree-select-view input').fill('ZZZ_NOT_FOUND_827')
                row = current('/api/inventory/candidates/query')
                assert row['request'] == candidate_query(kind, 'ZZZ_NOT_FOUND_827') and row['status'] == 200, row
                assert row['body'] == {'page': 1, 'exactTotal': 0, 'items': []}, row
                expect(host.locator('.inv-filter-tools')).to_contain_text('匹配 0 项')
                expect(host.locator('.arco-tree-node-title')).to_have_text([all_label])
                expect(tree_node(host, all_label).get_by_role('checkbox')).to_be_checked()
                message = '暂无数据' if kind == 'category' else '没有匹配的' + label
                expect(host.get_by_text(message, exact=True)).to_be_visible()
                expect(host.get_by_role('alert')).to_have_count(0)
                shot(case, kind + '-valid-zero')
                if kind == 'supplier':
                    # The focused Esc behavior was bilateral in original evidence:
                    # keep popup, query and All; do not "fix" it into a dismissal.
                    host.locator('.arco-tree-select-view input').press('Escape')
                    expect(host.locator('.arco-tree-select-popup')).to_be_visible()
                    expect(host.locator('.arco-tree-select-view input')).to_have_value('ZZZ_NOT_FOUND_827')
                    armed_fault = True
                    with page.expect_response(lambda r: urlsplit(r.url).path == '/api/inventory/candidates/query' and r.status == 503):
                        host.locator('.arco-tree-select-view input').fill('ZZZ_READ_FAILURE_827')
                    expect(host.get_by_role('alert')).to_contain_text('读取失败')
                    expect(host.get_by_text(message, exact=True)).to_have_count(0)
                    expect(tree_node(host, all_label).get_by_role('checkbox')).to_be_checked()
                    shot(case, 'supplier-failure-not-zero')
                    with page.expect_response(lambda r: urlsplit(r.url).path == '/api/inventory/candidates/query' and r.status == 200):
                        host.get_by_role('alert').get_by_role('button', name='重试', exact=True).click()
                    retried = current('/api/inventory/candidates/query')
                    assert retried['request'] == candidate_query('supplier', 'ZZZ_READ_FAILURE_827') and retried['body']['exactTotal'] == 0
                    expect(host.get_by_role('alert')).to_have_count(0)
                    expect(host.get_by_text(message, exact=True)).to_be_visible()
                    shot(case, 'supplier-retry-valid-zero')
                close_popup(host)
                with page.expect_response(lambda r: urlsplit(r.url).path == '/api/inventory/candidates/query'):
                    host.locator('.arco-tree-select-view').click(position={'x': 6, 'y': 16})
                expect(host.locator('.arco-tree-select-view input')).to_have_value('')
                assert current('/api/inventory/candidates/query')['request'] == candidate_query(kind, '')
                expect(tree_node(host, all_label).get_by_role('checkbox')).to_be_checked()
                expect(host.get_by_text(message, exact=True)).to_have_count(0)
                close_popup(host)
            assert count('/api/inventory/query') == before_inventory, 'Candidate feedback must not execute inventory query'
            expect(page.locator('#iw-results').get_by_text('等待查询', exact=True)).to_be_visible()
        def status_case(case):
            page.goto(origin + '/#sales'); page.bring_to_front()
            expect(page.get_by_role('heading', name='销货单列表', exact=True)).to_be_visible()
            expect(page.locator('#sale-list-scroll .iw-loading')).to_have_count(0)
            before_sales = count('/api/sales/query'); before_candidates = count('/api/sales/references/query')
            host = page.locator('.tc-status-field')
            host.locator('.arco-tree-select-view').click(position={'x': 6, 'y': 16})
            expect(host.locator('.arco-tree-select-popup')).to_be_visible()
            expect(tree_node(host, '全部状态').get_by_role('checkbox')).to_be_checked()
            tree_node(host, '未审核').locator('.arco-checkbox').click()
            expect(tree_node(host, '未审核').get_by_role('checkbox')).not_to_be_checked()
            expect(tree_node(host, '已审核').get_by_role('checkbox')).to_be_checked()
            expect(tree_node(host, '已作废').get_by_role('checkbox')).to_be_checked()
            expect(host.locator('.arco-tree-node-title')).to_have_text(['全部状态', '未审核', '已审核', '已作废'])
            expect(host.locator('.inv-filter-tools')).to_have_text('匹配 3 项 · 已选 2 项')
            shot(case, 'canonical-order-matched3-selected2')
            host.locator('.arco-tree-select-view input').fill('已审核')
            expect(host.locator('.inv-filter-tools')).to_have_text('匹配 1 项 · 已选 2 项')
            assert count('/api/sales/query') == before_sales and count('/api/sales/references/query') == before_candidates, 'Local status filtering is not a remote query'
            host.locator('.arco-tree-select-view input').fill('')
            expect(host.locator('.inv-filter-tools')).to_have_text('匹配 3 项 · 已选 2 项')
            close_popup(host)
            expect(page.locator('.ui-query-note[data-pending=true]')).to_be_visible()
            # Read-only query confirms UI edits preserved the original wire semantics.
            with page.expect_response(lambda r: urlsplit(r.url).path == '/api/sales/query'):
                page.get_by_role('button', name='查询', exact=True).click()
            q = current('/api/sales/query')
            assert q['status'] == 200 and q['request']['filter']['statuses'] == ['APPROVED', 'VOID'], q
            assert all(row['status'] in ['APPROVED', 'VOID'] for row in q['body']['items'])
            shot(case, 'unchanged-status-wire-query')
        for case, execute in [('N34-I01-SUPPLIER-EMPTY-01', inventory_case), ('N34-S02-STATUS-ORDER-01', status_case)]:
            if a.case and case not in a.case: continue
            item = {'caseId': case, 'status': 'RUNNING', 'wholePass': False}; result['cases'].append(item); persist()
            try:
                execute(case); healthy(); item['status'] = 'PASS_LISTED_STEPS'
            except Exception as e:
                item.update(status='FAIL', reason=str(e), traceback=traceback.format_exc())
                try: shot(case, 'failure')
                except Exception: pass
            persist()
        healthy(); result['status'] = 'PASS_LISTED_STEPS' if all(item['status'] == 'PASS_LISTED_STEPS' for item in result['cases']) else 'FAIL'; persist()
        if a.keep_open: keep_visible(page)
        browser.close(); browser = None
except BaseException as e:
    if result['status'] == 'RUNNING': result.update(status='FAIL', reason=str(e), traceback=traceback.format_exc())
    persist()
    if isinstance(e, SystemExit): raise
finally:
    if browser: browser.close()
    if bridge:
        bridge.terminate()
        try: bridge.wait(timeout=10)
        except subprocess.TimeoutExpired: bridge.kill(); bridge.wait()
    persist()
if result['status'] != 'PASS_LISTED_STEPS': raise SystemExit(1)
