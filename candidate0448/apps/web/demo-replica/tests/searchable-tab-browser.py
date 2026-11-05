"""Prepared, NOT RUN: two bounded native searchable-single reverse-Tab probes.

Uses exact production bytes and the repository's unchanged standard read-only
production-browser-fixture.mjs. Native headed Chromium with sandbox enabled.
No source patch, PG fixture, state injection, JS focus, force click or sleeps.
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
    args = parser.parse_args()
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
                             'Other searchable/multiple/TreeSelect controls are not tested.']}
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
        if name == 'transfer-warehouse':
            return None if routes.get('transfers') and routes.get('transferManualCreate') else 'transfers + transferManualCreate must already be enabled'
        stores = routes.get('storeSettings') or {}
        return None if 'warehouses' in stores.get('allowedTabs', []) and stores.get('allowHallDirectoryRead') else 'warehouses tab + allowHallDirectoryRead must already be enabled'

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
                for name in ['transfer-warehouse', 'settings-hall-filter']:
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
                        if name == 'transfer-warehouse':
                            page.goto(origin + '/#transfer/new')
                            page.locator('#page .transfer-editor').wait_for()
                            page.get_by_label('备注', exact=True).fill('SYNTHETIC reverse-Tab draft stays intact')
                            previous = page.get_by_role('combobox', name='调出仓库', exact=True)
                            target = page.get_by_role('combobox', name='调入仓库', exact=True)
                            expect(previous).to_have_attribute('aria-disabled', 'false')
                            expect(target).to_have_attribute('aria-disabled', 'false')
                            previous.click()  # actual pointer focus; opens only the read-only warehouse picker
                            expect(previous.locator('input')).to_be_focused()
                            page.keyboard.press('Tab')  # closes picker and moves forward to next known field
                            expect(previous).to_have_attribute('aria-expanded', 'false')

                            def draft():
                                return {'note': page.get_by_label('备注', exact=True).input_value(),
                                        'saveState': page.locator('#tc-save-state').inner_text(),
                                        'totals': page.locator('#tc-totals').inner_text(),
                                        'quantities': page.locator('[data-transfer-quantity]').evaluate_all('els=>els.map(el=>el.value)'),
                                        'fromLabel': previous.locator('.arco-select-view-value').all_text_contents(),
                                        'toLabel': target.locator('.arco-select-view-value').all_text_contents()}
                            previous_input = previous.locator('input')
                        else:
                            page.goto(origin + '/#settings/warehouses')
                            previous_input = page.get_by_role('textbox', name='搜索仓库名称', exact=True)
                            previous_input.wait_for()
                            expect(page.get_by_role('tab', name='仓库', exact=True)).to_have_attribute('aria-selected', 'true')
                            target = page.get_by_role('combobox', name='全部营业厅', exact=True)
                            expect(target).to_have_attribute('aria-disabled', 'false')
                            previous_input.fill('SYNTHETIC-TAB-PROBE')  # filter draft only; never press 查询
                            page.wait_for_load_state('networkidle')
                            previous_input.press('Tab')

                            def draft():
                                return {'searchDraft': previous_input.input_value(),
                                        'hallLabel': target.locator('.ui-single-tag').all_text_contents(),
                                        'rows': page.locator('#page .bs-table-wrap tbody').all_text_contents(),
                                        'queryNote': page.locator('#page .runtime-settings-note').all_text_contents()}
                        case['stage'] = 'forward-focus'
                        expect(target.locator('input')).to_be_focused()
                        expect(target).to_have_attribute('aria-expanded', 'false')
                        page.wait_for_load_state('networkidle')
                        failed_reads = [row for row in result['requests'][request_start:] if row.get('status', 200) >= 400]
                        if failed_reads:
                            case['status'] = 'BLOCKED_FIXTURE'
                            raise RuntimeError('Read fixture failed before reverse-Tab proof: ' + repr(failed_reads))
                        url = page.url
                        before = draft()
                        case['before'] = before
                        observe('before reverse Tab', target)
                        shot('before-reverse')
                        for repeat in range(2):
                            case['stage'] = f'reverse-tab-{repeat + 1}'
                            page.keyboard.press('Shift+Tab')
                            observe(f'immediately after reverse Tab {repeat + 1}', target)
                            expect(previous_input).to_be_focused()
                            assert page.url == url, 'Tab navigation changed route'
                            assert draft() == before, 'Tab navigation changed the visible draft/filter/list state'
                            shot(f'after-reverse-{repeat + 1}')
                            if repeat == 0:
                                case['stage'] = 'repeat-forward-focus'
                                page.keyboard.press('Tab')
                                expect(target.locator('input')).to_be_focused()
                                expect(target).to_have_attribute('aria-expanded', 'false')
                                observe('second forward Tab', target)
                        assert not [error for error in result['pageErrors'] if error['case'] == name]
                        case.update(status='PASS', stage='complete', after=draft(), routeUnchanged=True, draftUnchanged=True)
                    except Exception as error:
                        if case['status'] != 'BLOCKED_FIXTURE':
                            case['status'] = 'FAIL'
                        case['reason'] = f'{type(error).__name__}: {error}'
                        case['traceback'] = traceback.format_exc()
                        try:
                            if target is not None:
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
                elif len(result['cases']) == 2 and all(case['status'] == 'PASS' for case in result['cases']):
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
