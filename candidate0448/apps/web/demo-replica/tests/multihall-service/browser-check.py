"""Bounded real-build UI + actual organization read HTTP/service with memory source.
No PG/save, no DTO response overrides, sandbox remains enabled. Root runs on dot.
"""
import argparse
import hashlib
import json
import mimetypes
import re
import selectors
import subprocess
import sys
import traceback
from pathlib import Path
from urllib.parse import unquote, urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('build')
parser.add_argument('out')
parser.add_argument('--repo', required=True)
parser.add_argument('--expected-checkpoint', required=True)
parser.add_argument('--node', required=True)
parser.add_argument('--chromium', default='/usr/bin/chromium')
parser.add_argument('--width', type=int, default=1440)
parser.add_argument('--headed', action='store_true')
parser.add_argument('--keep-open', action='store_true')
parser.add_argument('--case', action='append', choices=['B06-MULTIHALL', 'B02-HALL-RESTRICTION'])
args = parser.parse_args()
repo = Path(args.repo).resolve()
build = Path(args.build).resolve()
out = Path(args.out).resolve()
out.mkdir(parents=True, exist_ok=False)
prep = Path(__file__).resolve().parent
manifest = json.loads((build / 'production-build.json').read_text())
configuration = manifest['configuration']
origin = configuration['http']['origin']
asset_base = configuration['assets']['basePath']
assert manifest['sourceCheckpoint'] == args.expected_checkpoint, 'BUILD_CHECKPOINT_MISMATCH'
assert origin == 'https://synthetic-management.invalid', 'SYNTHETIC_ORIGIN_REQUIRED'
assert configuration['routes'].get('paymentSettings') is True
assert configuration['routes'].get('maintenance', {}).get('paymentSettings') is True, 'DRAFT_TEST_CONFIG_REQUIRED'
sha = lambda filename: hashlib.sha256(filename.read_bytes()).hexdigest()
# Verify exact built bytes and physical production inputs before browser execution.
for item in manifest['outputs']:
    assert sha(build / item['path']) == item['sha256'], 'BUILD_OUTPUT_CHANGED: ' + item['path']
for item in manifest['inputs']:
    assert sha(repo / item['path']) == item['sha256'], 'BUILD_INPUT_CHANGED: ' + item['path']
allowed = {item['path'] for item in manifest['outputs']} | {'index.html'}
ids = {name: '9a110000-0000-4000-8000-' + str(number).zfill(12) for name, number in {'hallA': 1, 'hallB': 2, 'warehouseA': 11, 'warehouseB': 12, 'methodA': 21, 'methodB': 22, 'accountA': 31, 'accountB': 32, 'accountAB': 33}.items()}
names = {'hallA': 'SYNTHETIC 一厅', 'hallB': 'SYNTHETIC 二厅', 'warehouseA': 'SYNTHETIC 一厅仓', 'warehouseB': 'SYNTHETIC 二厅仓', 'methodA': 'SYNTHETIC 现金', 'methodB': 'SYNTHETIC 转账', 'accountAB': 'SYNTHETIC 双厅账户'}
result = {
    'sourceCheckpoint': manifest['sourceCheckpoint'], 'syntheticOnly': True,
    'scope': 'ACTUAL_BUILT_UI_AND_ORGANIZATION_READ_SERVICE_WITH_MEMORY_SOURCE_NOT_PG_NOT_SAVE',
    'status': 'NOT_RUN', 'cases': [], 'requests': [], 'readResponses': [], 'screens': [],
    'prepHashes': {name: sha(prep / name) for name in ['fixture.mjs', 'bridge.mjs', 'browser-check.py', 'public-config.json']},
    'productionBuildManifestSha256': sha(build / 'production-build.json'),
}
bridge = None
browser = None
stderr_handle = None
errors = []

def persist():
    result['errors'] = list(errors)
    (out / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))

def exchange(request):
    bridge.stdin.write(json.dumps(request, ensure_ascii=False) + '\n')
    bridge.stdin.flush()
    selector = selectors.DefaultSelector()
    try:
        selector.register(bridge.stdout, selectors.EVENT_READ)
        assert selector.select(timeout=40), 'FIXTURE_REPLY_TIMEOUT; inspect fixture-stderr.log'
        line = bridge.stdout.readline()
        assert line, 'FIXTURE_CLOSED; inspect fixture-stderr.log'
        return json.loads(line)
    finally:
        selector.close()

try:
    from playwright.sync_api import sync_playwright, expect
    with sync_playwright() as pw:
        # Do not weaken Chromium sandbox or switch executors on launch failure.
        try:
            browser = pw.chromium.launch(executable_path=args.chromium, headless=not args.headed, chromium_sandbox=True)
        except Exception as error:
            result.update(status='BLOCKED_ENV', reason=str(error))
            persist()
            sys.exit(2)
        stderr_handle = (out / 'fixture-stderr.log').open('w')
        bridge = subprocess.Popen([args.node, '--experimental-transform-types', str(prep / 'bridge.mjs'), '--repo', str(repo), '--expected-checkpoint', args.expected_checkpoint], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr_handle, text=True, bufsize=1)
        initial = exchange({'control': 'inspect'})
        assert initial['sourceCheckpoint'] == args.expected_checkpoint
        assert initial['statistics']['writeAttempts'] == 0
        result['initialFixture'] = initial
        context = browser.new_context(viewport={'width': args.width, 'height': 1000}, device_scale_factor=1)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_default_timeout(15000)

        def respond(route):
            request = route.request
            url = urlsplit(request.url)
            request_origin = url.scheme + '://' + url.netloc
            result['requests'].append({'method': request.method, 'url': request.url, 'body': request.post_data})
            if request_origin != origin:
                errors.append('CLOSED_ORIGIN_VIOLATION: ' + request.url)
                route.abort()
                return
            if url.path.startswith('/api/'):
                response = exchange({'url': request.url, 'method': request.method, 'headers': request.headers, 'body': request.post_data})
                value = json.loads(response['body'])
                result['readResponses'].append({'path': url.path, 'request': json.loads(request.post_data or '{}'), 'status': response['status'], 'body': value, 'serviceSource': response['headers'].get('x-synthetic-read-source')})
                if re.search(r'/(commands|receipts)(/|$)', url.path):
                    errors.append('FORBIDDEN_WRITE_OR_RECEIPT_ATTEMPT: ' + request.url)
                # Unmodified real plugin response body; no successful DTO substitutions.
                route.fulfill(status=response['status'], headers=response['headers'], body=response['body'])
                return
            relative = 'index.html' if url.path == '/' else unquote(url.path[len(asset_base):]) if url.path.startswith(asset_base) else ''
            if relative not in allowed:
                route.fulfill(status=404, body='Not in fixed build manifest')
                return
            filename = build / relative
            mime = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
            if relative.endswith('.js'):
                mime = 'application/javascript'
            route.fulfill(status=200, content_type=mime, body=filename.read_bytes())

        context.route('**/*', respond)
        page.bring_to_front()

        def settle():
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(100)

        def current(path):
            return next(item for item in reversed(result['readResponses']) if item['path'] == path)

        def actual(path):
            response = current(path)
            assert response['status'] == 200, response
            assert response['serviceSource'] == 'actual-organization-service-memory', response
            return response

        def healthy(expected_prompt=False):
            alerts = [item.inner_text().strip() for item in page.get_by_role('alert').all() if item.is_visible() and item.inner_text().strip()]
            if expected_prompt:
                assert all('放弃本次填写？' in text for text in alerts), alerts
            else:
                assert not alerts, alerts
            assert not errors, errors
            assert not [r for r in result['requests'] if re.search(r'/(commands|receipts)(/|$)', urlsplit(r['url']).path)], 'UNEXPECTED_COMMAND_OR_RECEIPT'

        def shot(case_id, name):
            filename = case_id + '-' + name
            page.screenshot(path=str(out / (filename + '.png')), full_page=True, animations='disabled')
            (out / (filename + '.txt')).write_text(page.locator('body').inner_text())
            result['screens'].append(filename + '.png')

        def step(item, name, work, expected_prompt=False):
            record = {'name': name, 'status': 'RUNNING'}
            item['steps'].append(record)
            persist()
            try:
                work()
                healthy(expected_prompt)
                record['status'] = 'PASS'
                shot(item['caseId'], str(len(item['steps'])))
            except Exception as error:
                record.update(status='FAIL', reason=str(error))
                raise
            finally:
                persist()

        def run(case_id, work):
            if args.case and case_id not in args.case:
                return
            item = {'caseId': case_id, 'status': 'RUNNING', 'wholePagePass': False, 'steps': []}
            result['cases'].append(item)
            try:
                work(item)
                healthy()
                assert item['steps']
                item['status'] = 'PASS_LISTED_STEPS'
            except Exception as error:
                item.update(status='FAIL', reason=str(error), traceback=traceback.format_exc())
                try:
                    shot(case_id, 'failure')
                except Exception:
                    pass
            persist()

        def visit(route, label):
            page.goto(origin + '/?multihall=' + route.split('/')[-1] + '#' + route)
            page.get_by_label(label, exact=True).wait_for()
            settle()
            page.evaluate('(title) => { document.title = title; }', '测试 ' + manifest['sourceCheckpoint'] + ' · 双厅真实读取服务/内存 · 禁止保存 · 非PG')

        def payment(item):
            dialog = page.get_by_role('dialog')
            box = dialog.get_by_role('textbox', name='账户名称', exact=True)
            host = dialog.locator('.runtime-payment-halls')
            saved = {}

            def selected(expected):
                tags = host.locator('.arco-select-tag:visible')
                expect(tags).to_have_text(expected)

            def open_shared():
                row = page.get_by_role('row').filter(has=page.get_by_role('cell', name=names['accountAB'], exact=True))
                row.get_by_role('button', name='编辑', exact=True).click()
                box.wait_for()
                settle()
                record = actual('/api/payment/accounts/detail/query')['body']
                assert record['id'] == ids['accountAB']
                assert record['halls'] == [{'id': ids['hallA'], 'name': names['hallA'], 'enabled': True}, {'id': ids['hallB'], 'name': names['hallB'], 'enabled': True}]
                selected([names['hallA'], names['hallB']])
                assert box.input_value() == record['name']
                return record

            def listing():
                visit('settings/fundAccounts', '搜索账户名称')
                response = actual('/api/payment/accounts/query')
                assert response['body']['total'] == 3
                assert {row['id'] for row in response['body']['items']} == {ids['accountA'], ids['accountB'], ids['accountAB']}
            step(item, 'actual read service supplies three independent current synthetic accounts', listing)
            step(item, 'actual shared-account detail displays both original hall names', lambda: saved.update(record=open_shared()))

            def remove_b():
                host.locator('.arco-select-view').click()
                settle()
                directory = actual('/api/organization/halls/query')
                assert directory['body']['total'] == 2
                host.locator('.arco-select-option').filter(has_text=re.compile('^' + re.escape(names['hallB']) + '$')).click()
                box.click()
                settle()
                selected([names['hallA']])
            step(item, 'remove hall B from draft using genuine multiple selection', remove_b)

            def cancel_continue():
                dialog.get_by_role('button', name='取消', exact=True).click()
                assert dialog.get_by_role('alert').filter(has_text='放弃本次填写？').is_visible()
                shot(item['caseId'], 'expected-discard-prompt')
                dialog.get_by_role('button', name='继续填写', exact=True).click()
                selected([names['hallA']])
            step(item, 'cancel then continue preserves the one-hall draft', cancel_continue)

            def search_add():
                host.locator('.arco-select-view').click()
                settle()
                search = host.get_by_role('combobox', name='适用营业厅', exact=True).get_by_role('textbox')
                search.fill('ZZZ987-NO-SUCH-HALL')
                settle()
                response = actual('/api/organization/halls/query')
                assert response['request']['search'] == 'ZZZ987-NO-SUCH-HALL'
                assert response['body']['total'] == 0
                selected([names['hallA']])  # Existing selected refs legitimately survive remote no-match.
                search.fill(names['hallB'])
                settle()
                response = actual('/api/organization/halls/query')
                assert response['body']['total'] == 1 and response['body']['items'][0]['id'] == ids['hallB']
                host.locator('.arco-select-option').filter(has_text=re.compile('^' + re.escape(names['hallB']) + '$')).click()
                box.click()
                settle()
                selected([names['hallA'], names['hallB']])
            step(item, 'remote no-match retains selection; matching search adds second hall', search_add)

            def clear_and_discard():
                host.locator('.arco-select-view').hover()
                host.locator('.arco-select-clear-icon').click()
                box.click()
                settle()
                selected([])
                assert dialog.get_by_text('未关联营业厅。', exact=True).is_visible()
                shot(item['caseId'], 'empty-draft-no-command')
                dialog.get_by_role('button', name='取消', exact=True).click()
                assert dialog.get_by_role('alert').filter(has_text='放弃本次填写？').is_visible()
                dialog.get_by_role('button', name='放弃本次填写', exact=True).click()
                dialog.wait_for(state='detached')
                settle()
            step(item, 'clear all draft halls then explicitly discard without sending a command', clear_and_discard)

            def reopen():
                assert open_shared() == saved['record']
                dialog.get_by_role('button', name='取消', exact=True).click()
                dialog.wait_for(state='detached')
                settle()
            step(item, 'reopen reads the unchanged actual two-hall source; clean cancel closes', reopen)

        run('B06-MULTIHALL', payment)

        def warehouse(item):
            assert configuration['routes'].get('storeSettings')
            def choice(label, value):
                control = page.locator('.runtime-settings-select').filter(has=page.locator('.arco-select[aria-label="' + label + '"]'))
                control.locator('.arco-select-view').click()
                settle()
                control.locator('.arco-select-option').filter(has_text=re.compile('^' + re.escape(value) + '$')).click()
                settle()
            def list_halls():
                visit('settings/warehouses', '搜索仓库名称')
                assert actual('/api/organization/warehouses/query')['body']['total'] == 2
                for hall, warehouse_key in [('hallA', 'warehouseA'), ('hallB', 'warehouseB')]:
                    choice('全部营业厅', names[hall])
                    page.get_by_role('button', name='查询', exact=True).click()
                    settle()
                    response = actual('/api/organization/warehouses/query')
                    assert response['request']['hallId'] == ids[hall]
                    assert [row['id'] for row in response['body']['items']] == [ids[warehouse_key]]
                    assert page.get_by_role('cell', name=names[warehouse_key], exact=True).is_visible()
            step(item, 'warehouse hall filter separates two existing warehouses without new permissions', list_halls)
            def defaults():
                visit('settings/stores', '搜索营业厅名称')
                actual('/api/organization/halls/query')
                for hall, mine, other in [('hallA', 'warehouseA', 'warehouseB'), ('hallB', 'warehouseB', 'warehouseA')]:
                    row = page.get_by_role('row').filter(has=page.get_by_role('cell', name=names[hall], exact=True))
                    row.get_by_role('button', name='编辑', exact=True).click()
                    dialog = page.get_by_role('dialog')
                    dialog.get_by_role('textbox', name='名称', exact=True).wait_for()
                    settle()
                    directory = dialog.get_by_role('group', name='默认出库仓', exact=True)
                    directory.locator('.arco-select-view').click()
                    settle()
                    response = actual('/api/organization/warehouses/query')
                    assert response['request']['hallId'] == ids[hall]
                    assert [entry['id'] for entry in response['body']['items']] == [ids[mine]]
                    assert directory.locator('.arco-select-option').filter(has_text=re.compile('^' + re.escape(names[mine]) + '$')).is_visible()
                    assert directory.locator('.arco-select-option').filter(has_text=re.compile('^' + re.escape(names[other]) + '$')).count() == 0
                    dialog.get_by_role('textbox', name='名称', exact=True).click()
                    dialog.get_by_role('button', name='取消', exact=True).click()
                    dialog.wait_for(state='detached')
                    settle()
            step(item, 'each hall default-warehouse candidate excludes the existing other-hall warehouse', defaults)
        # Optional separate case: --case B06-MULTIHALL is the recommended first run.
        run('B02-HALL-RESTRICTION', warehouse)
        assert result['cases'], 'NO_REQUESTED_CASE_EXECUTED'
        terminal = exchange({'control': 'inspect'})
        result['terminalFixture'] = terminal
        assert terminal['source'] == initial['source'], 'READ_OR_DRAFT_CHANGED_SOURCE'
        assert terminal['statistics']['writeAttempts'] == 0, 'NONZERO_WRITE_ATTEMPTS'
        assert terminal['statistics']['sourceReads'] > 0
        assert any(call['source'] == 'ACTUAL_ORGANIZATION_READ_HTTP_SERVICE_MEMORY' for call in terminal['calls'])
        healthy()
        result['status'] = 'FAIL' if any(case['status'] == 'FAIL' for case in result['cases']) else 'PASS_LISTED_STEPS'
        persist()
        if args.keep_open:
            sys.path.insert(0, str(repo / 'apps/web/demo-replica/tests'))
            from visible_wait import keep_visible
            keep_visible(page)
        browser.close()
        browser = None
except Exception as error:
    result.update(status='FAIL', reason=str(error), traceback=traceback.format_exc())
finally:
    if browser:
        browser.close()
    if bridge:
        if bridge.poll() is None:
            bridge.stdin.close()
            try:
                bridge.wait(timeout=5)
            except subprocess.TimeoutExpired:
                bridge.terminate()
                bridge.wait(timeout=5)
        result['fixtureExitCode'] = bridge.returncode
        if bridge.returncode not in (None, 0) and result['status'] == 'PASS_LISTED_STEPS':
            result['status'] = 'FAIL'
            result['reason'] = 'FIXTURE_NONZERO_EXIT'
    if stderr_handle:
        stderr_handle.close()
    persist()
sys.exit(0 if result['status'] == 'PASS_LISTED_STEPS' else 2 if result['status'] == 'BLOCKED_ENV' else 1)
