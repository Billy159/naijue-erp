"""Two finite normal-menu cases over the frozen original --unified-service host.
No setup API calls, response substitution, approvals, database or user browser session.
"""
import argparse
import base64
import hashlib
import json
import mimetypes
import re
import subprocess
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import unquote, urlsplit

p = argparse.ArgumentParser()
p.add_argument('build'); p.add_argument('out')
p.add_argument('--case', choices=['data-linkage', 'document-linkage'], action='append', required=True)
p.add_argument('--fixture-tests', required=True)
p.add_argument('--source-checkpoint', required=True)
p.add_argument('--manifest-sha256', required=True)
p.add_argument('--config-sha256', required=True)
p.add_argument('--node', default='node')
p.add_argument('--chromium', default='/usr/bin/chromium')
args = p.parse_args()
if len(args.case) != 1:
    p.error('Choose exactly one fresh-store case; never combine data and document cases')
case = args.case[0]
build = Path(args.build).resolve(); out = Path(args.out).resolve(); fixtures = Path(args.fixture_tests).resolve()
manifest_bytes = (build / 'production-build.json').read_bytes()
assert hashlib.sha256(manifest_bytes).hexdigest() == args.manifest_sha256, 'Fixed build manifest mismatch'
manifest = json.loads(manifest_bytes); config = manifest['configuration']
assert manifest['sourceCheckpoint'] == args.source_checkpoint, 'Wrong application checkpoint'
config_file = fixtures / 'unified-service-public-config.json'
assert hashlib.sha256(config_file.read_bytes()).hexdigest() == args.config_sha256, 'Wrong frozen public config'
origin = config['http']['origin']; asset_base = config['assets']['basePath']; routes = config['routes']
assert origin == 'https://synthetic-management.invalid'
assert routes.get('products') and routes.get('salesManualCreate') and routes.get('transferManualCreate')
assert routes.get('maintenance', {}).get('products') and routes['maintenance'].get('paymentSettings')
assert routes['maintenance'].get('staffSettings') is False, 'This case does not exercise staff maintenance'
bridge_file = fixtures / 'production-browser-fixture.mjs'
for name in ['production-browser-fixture.mjs', 'unified-service-fixture.mjs', 'sales-chain-fixture.mjs', 'transfer-chain-fixture.mjs']:
    assert (fixtures / name).is_file(), name
out.mkdir(parents=True, exist_ok=False)
result = {
    'taskId': 'F1-UNIFIED-CROSSPAGE-01', 'case': case, 'status': 'RUNNING',
    'sourceCheckpoint': args.source_checkpoint, 'manifestSHA256': args.manifest_sha256,
    'configurationSHA256': args.config_sha256, 'fixtureTests': str(fixtures),
    'fixtureProfile': '--unified-service', 'origin': origin, 'syntheticOnly': True,
    'driverSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'fixtureSHA256': {name: hashlib.sha256((fixtures / name).read_bytes()).hexdigest() for name in
                      ['production-browser-fixture.mjs', 'unified-service-fixture.mjs', 'sales-chain-fixture.mjs', 'transfer-chain-fixture.mjs']},
    'responses': [], 'screens': [], 'checks': [], 'errors': [],
    'notTested': ['PG', 'production', 'real permissions', 'hardware scanner', 'approval',
                  'staff maintenance disabled by configuration', 'full SKU/media/pagination/recovery regression'],
}
bridge = browser = page = None

def persist():
    (out / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))

@contextmanager
def failure_evidence():
    try:
        yield
    except Exception as error:
        result['status'] = 'FAIL'; result['reason'] = str(error)
        result['failureCapture'] = {}
        for key, action in [('screenshot', lambda: page.screenshot(path=str(out / 'failure.png'), full_page=True)),
                            ('dom', lambda: (out / 'failure-dom.txt').write_text(page.locator('body').inner_text()))]:
            try:
                if page is None or page.is_closed():
                    raise RuntimeError('Page unavailable')
                action(); result['failureCapture'][key] = 'CAPTURED'
            except Exception as capture_error:
                result['failureCapture'][key] = type(capture_error).__name__
        persist()
        raise

try:
    from playwright.sync_api import sync_playwright, expect
    with sync_playwright() as pw, failure_evidence():
        browser = pw.chromium.launch(executable_path=args.chromium, headless=False, chromium_sandbox=True)
        bridge = subprocess.Popen([args.node, '--experimental-transform-types', str(bridge_file), '--unified-service'],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=(out / 'fixture-stderr.log').open('w'), text=True, bufsize=1)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
        page = context.new_page(); page.on('pageerror', lambda error: result['errors'].append(str(error)))
        allowed = {item['path'] for item in manifest['outputs']} | {'index.html'}

        def respond(route):
            request = route.request; url = urlsplit(request.url)
            if f'{url.scheme}://{url.netloc}' != origin:
                route.abort(); return
            if url.path.startswith('/api/'):
                wire = {'url': request.url, 'method': request.method, 'headers': request.headers}
                if request.post_data is not None:
                    wire['body'] = request.post_data
                bridge.stdin.write(json.dumps(wire) + '\n'); bridge.stdin.flush()
                line = bridge.stdout.readline()
                assert line, 'Original unified service exited without a response'
                response = json.loads(line)
                record = {'path': url.path, 'method': request.method,
                          'request': json.loads(request.post_data) if request.post_data else None,
                          'status': response['status']}
                if 'binaryBase64' in response:
                    body = base64.b64decode(response['binaryBase64']); record['binaryBytes'] = len(body)
                else:
                    body = response['body']
                    try:
                        record['body'] = json.loads(body)
                    except (ValueError, TypeError):
                        record['body'] = body
                result['responses'].append(record)
                print(json.dumps({'path': url.path, 'status': response['status']}, ensure_ascii=False), flush=True)
                route.fulfill(status=response['status'], headers=response['headers'], body=body)
                return
            relative = 'index.html' if url.path == '/' else unquote(url.path[len(asset_base):]) if url.path.startswith(asset_base) else ''
            if relative not in allowed:
                route.fulfill(status=404, body='Outside the fixed manifest'); return
            mime = 'application/javascript' if relative.endswith('.js') else mimetypes.guess_type(relative)[0] or 'application/octet-stream'
            route.fulfill(status=200, content_type=mime, body=(build / relative).read_bytes())

        context.route('**/*', respond)
        page.goto(origin + '/#products'); page.locator('.pc-products').wait_for(); page.bring_to_front()
        page.evaluate('(text)=>document.title=text', '候选统一版 · ' + case + ' · 合成服务 非正式业务')

        def shot(name):
            page.wait_for_function("!document.querySelector('#page')?.innerText.includes('正在加载页面')")
            page.screenshot(path=str(out / (name + '.png')), full_page=True, animations='disabled')
            result['screens'].append(name + '.png'); persist()

        def latest(path, predicate=lambda value: True):
            deadline = time.monotonic() + 5
            while True:
                matches = [r for r in result['responses'] if r['path'] == path and predicate(r)]
                if matches:
                    return matches[-1]
                assert time.monotonic() < deadline, 'Missing actual response ' + path
                page.wait_for_timeout(50)  # Pump original lazy-page request/response events; never synthesize data.

        def menu(route):
            page.locator('.sidebar a[data-route=' + json.dumps(route) + ']').click()
            page.wait_for_function("!document.querySelector('#page')?.innerText.includes('正在加载页面')")

        def choose_product(label, text, cascader=False):
            page.get_by_label(label, exact=True).click()
            option = page.locator('.arco-cascader-list-item' if cascader else '.arco-select-option').filter(has_text=re.compile('^' + re.escape(text) + '$'))
            option.first.wait_for(); assert option.count() == 1, text
            option.click(); page.locator('#page h1').click()

        def choose_document(label, text):
            page.get_by_role('combobox', name=label, exact=True).click()
            page.get_by_role('option', name=text, exact=True).click()
            page.locator('#page h1').click(); page.wait_for_load_state('networkidle')

        def check_no_approval():
            assert not [r for r in result['responses'] if r['path'].endswith('/commands') and
                        (r['request'] or {}).get('action') in ['APPROVE', 'UNAPPROVE']], 'No inventory admission or posting in this case'
            assert not [r for r in result['responses'] if r['path'] == '/api/staff/commands'], 'Do not bypass disabled staff maintenance'
            assert not result['errors'], result['errors']

        def create_product():
            code = 'SYN-UNIFIED-55-' + ('DATA' if case == 'data-linkage' else 'DOCS')
            name = 'SYN UNIFIED 商品 ' + case
            menu('products'); page.locator('.pc-products').wait_for()
            page.get_by_role('button', name='新增商品', exact=True).click(); page.get_by_label('商品名称', exact=True).wait_for()
            page.get_by_label('款号', exact=True).fill(code); page.get_by_label('商品名称', exact=True).fill(name)
            page.get_by_label('系统货号', exact=True).fill('9000055' if case == 'data-linkage' else '9000056')
            choose_product('商品分类', 'SYNTHETIC 西服', True); choose_product('年份', '2026')
            choose_product('季节', '秋'); choose_product('供应商', 'SYNTHETIC 供应商')
            page.get_by_role('tab', name='规格', exact=True).click()
            fit = page.locator('.pc-spec-section').filter(has=page.get_by_role('heading', name='版型', exact=True))
            expect(fit.locator('.pc-spec-values')).to_contain_text('A版（标准）')
            page.get_by_role('button', name='编辑颜色', exact=True).click(); dialog = page.get_by_role('dialog').last
            color = dialog.locator('.arco-transfer-view-item').filter(has_text='上青色')
            expect(color).to_have_count(1); color.locator('label.arco-checkbox').click(); expect(color.get_by_role('checkbox')).to_be_checked()
            dialog.get_by_role('button', name='move selected right', exact=True).click()
            dialog.get_by_role('button', name='确定', exact=True).click(); expect(dialog).to_have_count(0)
            choose_product('尺码组', 'SYNTHETIC 男装上衣尺码')
            page.get_by_role('tab', name='价格', exact=True).click(); page.get_by_label('零售价', exact=True).fill('568.00')
            page.get_by_role('tab', name='条码', exact=True).click()
            expect(page.get_by_label('主条码默认方案', exact=True)).to_contain_text('2026年条码方案')
            page.get_by_role('button', name='保存', exact=True).click()
            page.wait_for_url(re.compile(re.escape(origin) + r'/#products/view/[0-9a-f-]+$'))
            product_id = page.url.rsplit('/', 1)[-1]
            command = latest('/api/products/v2/commands', lambda r: r['request']['action'] == 'CREATE')
            assert command['status'] == 200 and command['body']['targetId'] == product_id
            assert command['request']['values']['productCode'] == code and command['request']['values']['prices']['retail_price'] == '568.00'
            assert len(command['request']['skuSelection']['colorIds']) == len(command['request']['skuSelection']['fitIds']) == 1
            page.get_by_role('tab', name='条码', exact=True).click(); page.locator('.pc-barcode-table tbody tr').first.wait_for(); page.wait_for_load_state('networkidle')
            barcode_page = latest('/api/products/barcodes/query', lambda r: r['status'] == 200 and r['request']['productId'] == product_id and r['body'] and r['body'].get('kind') == 'SKU_PAGE')['body']
            main = next(item for item in barcode_page['items'] if item.get('main') and item['main']['enabled'])
            assert main['main']['barcode'] and main['skuId']
            product = {'id': product_id, 'code': code, 'name': name, 'skuId': main['skuId'], 'barcode': main['main']['barcode'], 'barcodeRow': main}
            result['product'] = product; shot('01-product-created-minimal')
            if case == 'data-linkage':
                page.get_by_role('tab', name='库存', exact=True).click(); page.wait_for_load_state('networkidle')
                stock = latest('/api/products/stock-overview/query', lambda r: r['request']['productId'] == product_id)
                assert stock['status'] == 200 and stock['body']['total']['state'] == 'UNKNOWN' and stock['body']['total']['quantity'] is None, stock
                result['stockTotal'] = stock['body']['total']; shot('01-new-stock-remains-unknown')
            menu('products'); created_row = page.locator('.pc-data-table tbody tr').filter(has_text=code); created_row.wait_for(); expect(created_row.locator('td').nth(8)).to_have_text('未知')
            result['checks'].append({'name': 'normal product CREATE and list; required real SKU/MAIN read only', 'productId': product_id})
            return product

        def create_account():
            name = 'SYN UNIFIED CASH ' + case
            menu('settings/payments'); page.get_by_role('tab', name='资金账户', exact=True).click()
            page.get_by_role('button', name='新增资金账户', exact=True).click(); dialog = page.get_by_role('dialog')
            expect(dialog.get_by_role('group', name='适用营业厅', exact=True)).to_have_count(0)
            dialog.get_by_role('textbox', name='账户名称', exact=True).fill(name)
            select = dialog.locator('.runtime-settings-select').filter(has=page.locator('.arco-select[aria-label="所属收款方式"]'))
            select.locator('.arco-select-view').click(); select.locator('.arco-select-option').filter(has_text=re.compile('^现金$')).click()
            dialog.get_by_role('button', name='确定', exact=True).click(); expect(dialog).to_have_count(0); page.wait_for_load_state('networkidle')
            write = latest('/api/payment/accounts/commands', lambda r: r['request']['action'] == 'CREATE')
            assert write['status'] == 200 and write['request']['values']['hallIds'] == [], write
            target = write['body']['targetId']; detail = latest('/api/payment/accounts/detail/query', lambda r: r['request']['id'] == target)
            assert detail['status'] == 200 and detail['body']['id'] == target and detail['body']['halls'] == []
            account = {'id': target, 'name': name, 'methodId': write['request']['values']['paymentMethodId']}
            result['account'] = account; shot('02-account-created-empty-halls')
            result['checks'].append({'name': 'normal payment account CREATE/readback; empty halls preserved', 'accountId': target})
            return account

        product = create_product(); account = create_account()
        if case == 'data-linkage':
            menu('settings/staff'); page.get_by_role('heading', name='员工与账号', exact=True).wait_for(); page.wait_for_load_state('networkidle')
            staff = latest('/api/staff/query'); assert staff['status'] == 200 and staff['body']['items']
            for name in ['新增员工', '编辑']:
                for button in page.get_by_role('button', name=name, exact=True).all():
                    assert button.is_disabled(), 'Staff read-only configuration must be honored'
            shot('04-staff-directory-readonly')
            result['checks'].append({'name': 'new stock UNKNOWN and normal staff directory read only', 'stock': result['stockTotal']})
        else:
            menu('sales/new'); page.get_by_role('textbox', name='整单优惠 / 抹零', exact=True).wait_for()
            choose_document('业务类型', '销售'); choose_document('营业厅', '网点营业厅')
            choose_document('客户', '零售客户'); choose_document('出库仓', '备货仓')
            search = page.get_by_role('combobox', name='商品款号 / 名称 / 条码', exact=True); expect(search).to_have_count(1)
            search_key = search.locator('xpath=ancestor::tr').get_attribute('data-entry-row')
            assert search_key, 'Bind original sales entry before candidate reads can append another blank row'
            search = page.locator('tr[data-entry-row=' + json.dumps(search_key) + ']').get_by_role('combobox', name='商品款号 / 名称 / 条码', exact=True); search.fill(product['code'])
            candidate = page.locator('[data-sale-candidate][data-finder-option]').filter(has_text=product['code']); candidate.wait_for(); expect(candidate).to_have_count(1)
            products = latest('/api/current-form/products/query', lambda r: r['request'].get('search') == product['code'])
            assert any(item['id'] == product['id'] for item in products['body']['items'])
            shot('03-sales-picker-new-product'); search.fill(''); page.locator('#page h1').click()
            page.get_by_role('button', name='扫码录入', exact=True).click(); scan = page.locator('.document-scan-input input'); expect(scan).to_be_focused()
            scan.fill(product['barcode']); scan.press('Enter'); expect(page.locator('.document-scan-grid input')).to_have_value('1')
            barcode = latest('/api/current-form/barcode/query'); assert barcode['status'] == 200 and barcode['body']['state'] == 'FOUND'
            assert barcode['body']['sku']['id'] == product['skuId'] and barcode['body']['sku']['productId'] == product['id']
            page.get_by_role('button', name='关闭扫码抽屉', exact=True).click(); expect(scan).to_have_count(0)
            line = page.locator('tr[data-entry-row]').filter(has=page.locator('.sale-product-identity')); expect(line).to_have_count(1)
            price = line.get_by_role('textbox', name='本行成交单价', exact=True); expect(price).to_have_value(''); price.fill('568')
            choose_document('第1笔支付方式', '现金'); choose_document('第1笔资金账户', account['name'])
            accounts = latest('/api/current-form/sales-references/query', lambda r: r['request']['kind'] == 'paymentAccount' and r['request']['paymentMethodId'] == account['methodId'])
            assert any(item['id'] == account['id'] for item in accounts['body']['items']), 'Normal empty-hall account must be a real candidate'
            page.get_by_role('textbox', name='第1笔收款金额', exact=True).fill('568'); page.get_by_role('button', name='保存', exact=True).click()
            page.wait_for_url(re.compile(r'.*#sales/view/')); page.get_by_role('heading', name='查看销货单', exact=True).wait_for(); page.wait_for_load_state('networkidle')
            sale = latest('/api/sales/detail/query')['body']['document']
            assert sale['header']['status'] == 'DRAFT' and sale['header']['version'] == 1 and sale['header']['netDue'] == '56800'
            assert len(sale['lines']) == 1 and sale['lines'][0]['skuId'] == product['skuId'] and sale['lines'][0]['quantity'] == '1' and sale['lines'][0]['dealPrice'] == '56800'
            assert len(sale['settlements']) == 1 and sale['settlements'][0]['paymentAccountId'] == account['id'] and sale['settlements'][0]['amount'] == '56800'
            result['salesReadback'] = sale; shot('04-sales-new-product-and-account-saved')
            menu('transfer/new'); page.get_by_role('heading', name='新增调拨单', exact=True).wait_for()
            choose_document('调出仓库', '备货仓'); choose_document('调入仓库', '温州仓')
            search = page.get_by_role('combobox', name='商品款号 / 名称 / 条码', exact=True); search.fill(product['code'])
            candidate = page.locator('[data-transfer-candidate]').filter(has_text=product['code']); candidate.wait_for(); expect(candidate).to_have_count(1)
            products = latest('/api/current-form/products/query', lambda r: r['request'].get('search') == product['code'])
            assert any(item['id'] == product['id'] for item in products['body']['items'])
            shot('05-transfer-picker-new-product'); search.fill(''); page.locator('#page h1').click()
            page.get_by_role('button', name='扫码录入', exact=True).click(); scan = page.locator('#transfer-scan-input'); expect(scan).to_be_focused(); scan.fill(product['barcode']); scan.press('Enter')
            expect(page.locator('[data-transfer-sku] input[data-transfer-qty]')).to_have_value('1')
            barcode = latest('/api/current-form/barcode/query'); assert barcode['body']['sku']['id'] == product['skuId'] and barcode['body']['sku']['productId'] == product['id']
            page.get_by_role('button', name='关闭扫码抽屉', exact=True).click(); expect(scan).to_have_count(0)
            expect(page.locator('input[data-transfer-quantity][data-transfer-size=' + json.dumps(barcode['body']['sku']['sizeId']) + ']')).to_have_value('1')
            page.get_by_role('button', name='保存', exact=True).click(); page.get_by_role('heading', name='查看调拨单', exact=True).wait_for(); page.wait_for_load_state('networkidle')
            transfer = latest('/api/transfers/detail/query')['body']['document']
            assert transfer['header']['status'] == 'DRAFT' and transfer['header']['version'] == 1
            assert len(transfer['lines']) == 1 and transfer['lines'][0]['skuId'] == product['skuId'] and transfer['lines'][0]['quantity'] == '1'
            result['transferReadback'] = transfer; shot('06-transfer-new-product-saved')
            result['checks'].append({'name': 'same-store created product and account feed normal proposals/scans and original DRAFT saves', 'productId': product['id'], 'accountId': account['id']})
        check_no_approval()
        creates = [r for r in result['responses'] if r['path'] == '/api/products/v2/commands' and r['request']['action'] == 'CREATE']
        assert len(creates) == 1 and creates[0]['status'] == 200, 'Exactly one necessary normal product setup per fresh case'
        result['status'] = 'PASS_LISTED_UNIFIED_' + case.upper().replace('-', '_') + '_STEPS'; persist()
        browser.close(); browser = None
except Exception as error:
    result['status'] = 'FAIL'; result['reason'] = str(error); persist()
    raise
finally:
    if bridge:
        bridge.terminate(); bridge.wait(timeout=5)
