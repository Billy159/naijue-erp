"""Five bounded native product single-choice keyboard regressions.

Exact committed production bytes, unchanged read-only synthetic transport,
headed sandboxed Chromium. Real pointer/input focus and two Shift+Tab exits.
No source/fixture mutation, business write, JS focus, force click or sleeps.

Other controls are deliberately outside this suite: category Cascader, multiple
season, shape (candidate501), ResponsibleSelect (capability absent), ledger
(unsupported read500), editable-history warehouses (configuration disabled).
Their prior blocked/failing receipts remain separate and are not marked passed.
"""
import argparse
import json
import mimetypes
import re
import subprocess
import sys
import traceback
from pathlib import Path
from urllib.parse import unquote, urlsplit


FOCUS_READ = """el => {
  let active=document.activeElement;
  while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;
  const input=el.querySelector('input');
  return {label:el.getAttribute('aria-label'),wrapperTabIndex:el.tabIndex,
    inputTabIndex:input?.tabIndex,inputDisabled:input?.disabled,inputReadOnly:input?.readOnly,
    focusedInput:active===input,expanded:el.getAttribute('aria-expanded'),
    active:active?{tag:active.tagName,label:active.getAttribute('aria-label'),
      placeholder:active.getAttribute('placeholder'),value:active.value??null}:null};
}"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('repo')
    parser.add_argument('build')
    parser.add_argument('out')
    parser.add_argument('--source-checkpoint', required=True)
    parser.add_argument('--node', default='node')
    parser.add_argument('--chromium', default='/usr/bin/chromium')
    parser.add_argument('--cases', default='product-year,product-supplier,product-thickness,product-group,product-scheme')
    args = parser.parse_args()
    names = args.cases.split(',')
    supported = {'product-year','product-supplier','product-thickness','product-group','product-scheme'}
    if not names or len(set(names)) != len(names) or not set(names) <= supported:
        raise SystemExit('Unsupported or duplicate case names')
    repo, build, out = (Path(value).resolve() for value in (args.repo, args.build, args.out))
    if not re.fullmatch(r'[0-9a-f]{40}', args.source_checkpoint):
        raise SystemExit('Require the exact full committed checkpoint SHA')
    manifest = json.loads((build / 'production-build.json').read_text())
    if manifest['sourceCheckpoint'] != args.source_checkpoint:
        raise SystemExit('Build manifest does not match requested checkpoint')
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=repo, check=True, capture_output=True, text=True).stdout.strip()
    clean = subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--'], cwd=repo).returncode
    if head != args.source_checkpoint or clean != 0:
        raise SystemExit('Require a clean tracked repository matching the build/fixture checkpoint')
    config = manifest['configuration']
    origin, base = config['http']['origin'], config['assets']['basePath']
    if origin != 'https://synthetic-management.invalid':
        raise SystemExit('Only the declared closed synthetic build is permitted')
    allowed = {item['path'] for item in manifest['outputs']} | {'index.html'}
    out.mkdir(parents=True, exist_ok=False)
    result = {'status': 'BLOCKED_ENV', 'sourceCheckpoint': head, 'syntheticOnly': True,
              'cases': [], 'requests': [], 'blockedRequests': [], 'pageErrors': [], 'cleanupErrors': [],
              'notClaimed': ['No SAVE, preparation, business write, PG, production or whole-page acceptance.',
                             'No PASS claim for shape/501, responsible/capability, ledger/500, history/config, category Cascader, or multiple season.']}
    bridge = browser = stderr = None

    def save():
        (out / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')

    def respond(route):
        request = route.request
        url = urlsplit(request.url)
        row = {'method': request.method, 'url': request.url, 'body': request.post_data}
        result['requests'].append(row)
        if f'{url.scheme}://{url.netloc}' != origin:
            result['blockedRequests'].append(row)
            route.abort()
            return
        if url.path.startswith('/api/'):
            if not (request.method == 'GET' and url.path == '/api/auth/session' or
                    request.method == 'POST' and url.path.endswith('/query')):
                result['blockedRequests'].append(row)
                route.abort()
                return
            bridge.stdin.write(json.dumps({'url': request.url, 'method': request.method,
                                          'headers': request.headers, 'body': request.post_data}) + '\n')
            bridge.stdin.flush()
            line = bridge.stdout.readline()
            if not line:
                raise RuntimeError('Unchanged standard fixture ended before responding')
            response = json.loads(line)
            row['status'] = response['status']
            if url.path in ['/api/dictionary-read/barcode-scheme/query', '/api/products/maintenance/candidates/query']:
                row['responseData'] = json.loads(response['body'])
            route.fulfill(status=response['status'], headers=response['headers'], body=response['body'])
            return
        relative = 'index.html' if url.path == '/' else unquote(url.path[len(base):]) if url.path.startswith(base) else ''
        if relative not in allowed:
            route.fulfill(status=404, body='Not in exact production manifest')
            return
        mime = 'application/javascript' if relative.endswith('.js') else mimetypes.guess_type(relative)[0] or 'application/octet-stream'
        route.fulfill(status=200, content_type=mime, body=(build / relative).read_bytes())

    def config_block(name):
        routes = config['routes']
        return None if routes.get('products') and routes.get('productFullPage') else 'products + productFullPage required'

    save()
    try:
        from playwright.sync_api import expect, sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=args.chromium, headless=False, chromium_sandbox=True)
            result['status'] = 'RUNNING'
            try:
                stderr = (out / 'fixture-stderr.log').open('w')
                fixture = repo / 'apps/web/demo-replica/tests/production-browser-fixture.mjs'
                bridge = subprocess.Popen([args.node, '--experimental-transform-types', str(fixture)], cwd=repo,
                                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr, text=True, bufsize=1)
                for name in names:
                    case = {'name': name, 'status': 'RUNNING', 'stage': 'config', 'observations': []}
                    result['cases'].append(case)
                    blocked = config_block(name)
                    if blocked:
                        case.update(status='BLOCKED_CONFIG', reason=blocked)
                        save()
                        continue
                    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
                    context.tracing.start(screenshots=True, snapshots=True, sources=True)
                    context.route('**/*', respond)
                    page = context.new_page()
                    page.on('pageerror', lambda error, name=name: result['pageErrors'].append({'case': name, 'error': str(error)}))
                    request_start = len(result['requests'])
                    target = None

                    def observe(label, view):
                        case['observations'].append({'step': label, 'url': page.url, 'focus': view.evaluate(FOCUS_READ)})

                    def shot(label):
                        page.screenshot(path=str(out / f'{name}-{label}.png'), full_page=True, animations='disabled')

                    try:
                        case['stage'] = 'setup'
                        page.bring_to_front()
                        page.goto(origin + '/#products/new')
                        page.get_by_label('商品名称', exact=True).wait_for()
                        page.get_by_label('款号', exact=True).fill('SYNTHETIC-TAB-ONLY')
                        page.get_by_label('商品名称', exact=True).fill('合成焦点草稿不保存')
                        tab, label = {'product-year': ('基础资料','年份'), 'product-supplier': ('基础资料','供应商'),
                                      'product-thickness': ('基础资料','厚薄'),
                                      'product-group': ('规格','尺码组'), 'product-scheme': ('条码','主条码默认方案')}[name]
                        if tab != '基础资料':
                            page.get_by_role('tab', name=tab, exact=True).click()
                        target = page.get_by_role('combobox', name=label, exact=True)
                        def draft():
                            if name == 'product-scheme':
                                # Arco swaps selected text between placeholder (focused) and span (blurred).
                                # Keep raw representation as evidence; compare stable user-visible semantics.
                                raw = page.locator('.pc-editor-body .arco-select-view-value,.pc-editor-body .arco-tag-content,.pc-spec-values').all_text_contents()
                                case.setdefault('rawValueRepresentations', []).append({'stage': case['stage'], 'values': raw})
                                scheme = target.evaluate('''el=>{const input=el.querySelector('input'),text=el.querySelector('.arco-select-view-value')?.textContent?.trim()??'',label=input?.placeholder??'';if(text&&text!==label)throw Error('Rendered scheme label differs from input selected-label placeholder');return {label,search:input?.value??null};}''')
                                return {'heading': page.locator('.pc-detail-workbench h1').inner_text(),
                                        'scheme': scheme,
                                        'barcodeRows': page.locator('.pc-barcode-table').inner_text(),
                                        'pageSize': page.get_by_role('combobox', name='每页条数', exact=True).locator('.arco-select-view-value').all_text_contents(),
                                        'error': page.locator('#pc-editor-error').inner_text()}
                            return {'heading': page.locator('.pc-detail-workbench h1').inner_text(),
                                    'inputs': page.locator('.pc-editor-body input:not(.arco-select-view-input):not(.arco-input-tag-input)').evaluate_all('els=>els.map(el=>({label:el.getAttribute("aria-label"),value:el.value}))'),
                                    'values': page.locator('.pc-editor-body .arco-select-view-value,.pc-editor-body .arco-tag-content,.pc-spec-values').all_text_contents(),
                                    'error': page.locator('#pc-editor-error').inner_text()}
                        target.wait_for()
                        expect(target).to_have_attribute('aria-disabled', 'false')
                        target.click()  # actual pointer opens only read candidates; never choose an option
                        expect(target.locator('input')).to_be_focused()
                        target.locator('input').click()  # pointer at the visible real input; no Escape/blur precondition
                        case['stage'] = 'open-input-focus'
                        expect(target.locator('input')).to_be_focused()
                        expect(target).to_have_attribute('aria-expanded', 'true')
                        page.wait_for_load_state('networkidle')
                        failed_reads = [row for row in result['requests'][request_start:] if row.get('status', 200) >= 400]
                        if failed_reads:
                            case['status'] = 'BLOCKED_FIXTURE'
                            raise RuntimeError('Read fixture failed before reverse-Tab proof: ' + repr(failed_reads))
                        if name == 'product-scheme':
                            case['stage'] = 'scheme-read-precondition'
                            expected_id = '0e70e45e-1a51-4d44-afe8-0002cf3fb7ef'  # currentSchemeId in matching editor source
                            reads = result['requests'][request_start:]
                            schemes = [row for row in reads if urlsplit(row['url']).path == '/api/dictionary-read/barcode-scheme/query']
                            candidates = [row for row in reads if urlsplit(row['url']).path == '/api/products/maintenance/candidates/query' and json.loads(row['body'])['kind'] == 'barcode-schemes']
                            assert schemes and candidates, 'Both exact default-scheme and candidate reads must complete'
                            for row in schemes:
                                assert json.loads(row['body']) == {'schemeId': expected_id}
                                data = row['responseData']
                                assert row['status'] == 200 and data['id'] == expected_id and data['status'] == 'CURRENT'
                                assert data['name'] == '2026年条码方案'
                            for row in candidates:
                                assert json.loads(row['body']) == {'kind':'barcode-schemes','search':'','page':1,'pageSize':20}
                                data = row['responseData']
                                assert row['status'] == 200 and data['kind'] == 'barcode-schemes' and data['page'] == 1 and data['pageSize'] == 20
                                same_name = [item for item in data['items'] if item['name'] == '2026年条码方案']
                                assert len(same_name) == 1 and same_name[0]['id'] == expected_id, 'Observed label must uniquely resolve to exact current scheme ID'
                            expect(target.locator('input')).to_have_attribute('placeholder', '2026年条码方案')
                            case['schemeReadEvidence'] = {'default': schemes, 'candidates': candidates}
                        url = page.url
                        before = draft()
                        case['before'] = before
                        observe('before reverse Tab', target)
                        shot('before-reverse')
                        for repeat in range(2):
                            case['stage'] = f'reverse-tab-{repeat + 1}'
                            page.keyboard.press('Shift+Tab')
                            observe(f'immediately after reverse Tab {repeat + 1}', target)
                            expect(target.locator('input')).not_to_be_focused()
                            assert target.evaluate('el=>{let active=document.activeElement;while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;return !!active && active.isConnected && active!==document.body && active!==document.documentElement && !el.contains(active); }'), 'reverse Tab did not reach a real control outside the same Select'
                            expect(target).to_have_attribute('aria-expanded', 'false')
                            assert page.url == url, 'Tab navigation changed route'
                            after = draft()
                            case.setdefault('afterSnapshots', []).append({'repeat':repeat + 1,'draft':after})
                            assert after == before, 'Tab navigation changed the semantic draft/filter/list state'
                            shot(f'after-reverse-{repeat + 1}')
                            if repeat == 0:
                                case['stage'] = 'repeat-open-input-focus'
                                target.click()
                                target.locator('input').click()
                                expect(target.locator('input')).to_be_focused()
                                expect(target).to_have_attribute('aria-expanded', 'true')
                                observe('second pointer focus on actual input', target)
                        assert not [error for error in result['pageErrors'] if error['case'] == name]
                        case.update(status='PASS', stage='complete', after=draft(), routeUnchanged=True, draftUnchanged=True)
                    except Exception as error:
                        if case['status'] != 'BLOCKED_FIXTURE':
                            case['status'] = 'FAIL'
                        case['reason'] = f'{type(error).__name__}: {error}'
                        case['traceback'] = traceback.format_exc()
                        try:
                            if target is not None and target.count():
                                observe('failure focus', target)
                            shot('failure')
                            (out / f'{name}-failure.html').write_text(page.content())
                            (out / f'{name}-failure.txt').write_text(page.locator('body').inner_text())
                        except Exception as capture_error:
                            case['captureError'] = str(capture_error)
                    finally:
                        save()
                        try:
                            context.tracing.stop(path=str(out / f'{name}-trace.zip'))
                            context.close()
                        except Exception as cleanup_error:
                            result['cleanupErrors'].append(f'{name}: {cleanup_error}')
                if result['blockedRequests'] or result['pageErrors'] or result['cleanupErrors']:
                    result['status'] = 'FAIL'
                elif len(result['cases']) == len(names) and all(case['status'] == 'PASS' for case in result['cases']):
                    result['status'] = 'PASS'
                elif any(case['status'] == 'FAIL' for case in result['cases']):
                    result['status'] = 'FAIL'
                else:
                    result['status'] = 'PARTIAL_BLOCKED'
            finally:
                try:
                    browser.close()
                except Exception as cleanup_error:
                    result['cleanupErrors'].append(f'browser close: {cleanup_error}')
                browser = None
    except Exception as error:
        result['reason'] = f'{type(error).__name__}: {error}'
        if result['status'] != 'BLOCKED_ENV':
            result['status'] = 'FAIL'
    finally:
        if bridge is not None:
            try:
                if bridge.poll() is None:
                    bridge.terminate()
                try:
                    bridge.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    bridge.kill()
                    bridge.wait(timeout=5)
            except Exception as cleanup_error:
                result['cleanupErrors'].append(f'fixture close: {cleanup_error}')
        if stderr is not None:
            stderr.close()
        if result['cleanupErrors'] and result['status'] == 'PASS':
            result['status'] = 'FAIL_CLEANUP'
        save()
    print(json.dumps({'status': result['status'], 'sourceCheckpoint': head,
                      'cases': [{'name': case['name'], 'status': case['status'], 'stage': case['stage']} for case in result['cases']]}, ensure_ascii=False))
    return 0 if result['status'] == 'PASS' else 1 if result['status'].startswith('FAIL') else 2


if __name__ == '__main__':
    raise SystemExit(main())
