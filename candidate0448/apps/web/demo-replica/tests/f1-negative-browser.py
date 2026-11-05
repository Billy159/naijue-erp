"""PREPARED ONLY. Original FULLSTACK F1 six malformed deep-link browser cases.
Unchanged native build + production-browser-fixture, no fixture flags or writes.
Only real browser navigation/clicks and read-only DOM observations; no JS state
injection, successful response rewriting, invalid-ID API probes or forced clicks.
"""
import argparse
import hashlib
import json
import mimetypes
import select
import subprocess
import traceback
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROUTES = ['products/view/not-a-uuid', 'products/view/%', 'products/view/',
          'products/edit/not-a-uuid', 'products/edit/%',
          'products/view/00000000-0000-4000-8000-000000000001/extra']
p = argparse.ArgumentParser()
p.add_argument('repo'); p.add_argument('build'); p.add_argument('out')
p.add_argument('--expected-checkpoint', required=True)
p.add_argument('--node', default='node'); p.add_argument('--chromium', default='/usr/bin/chromium')
p.add_argument('--headed', action='store_true')
a = p.parse_args()
if not a.headed: p.error('Root-owned headed execution with Chromium sandbox required')
repo, build, out = [Path(value).resolve() for value in (a.repo, a.build, a.out)]
out.mkdir(parents=True, exist_ok=False)
bridge_file = repo / 'apps/web/demo-replica/tests/production-browser-fixture.mjs'
result = {'originalFindingId': 'F1', 'status': 'RUNNING', 'wholePass': False,
          'syntheticOnly': True, 'routes': ROUTES, 'cases': [], 'screens': [],
          'requests': [], 'readResponses': [], 'forbiddenCommands': [],
          'invalidRouteBusinessAttempts': [], 'externalRequests': [],
          'pageErrors': [], 'consoleErrors': [], 'cleanupErrors': [],
          'limits': ['Six original malformed routes and local recovery only; no whole-report/page or CSS/pixel acceptance.',
                     'Defensive React leaf render-error boundary remains unit/DOM-only: no natural leaf exception is injected.',
                     'No canonical-but-nonexistent product case or six valid-detail tabs in this invocation.',
                     'Unchanged finite synthetic transport; not real authentication/authorization, PostgreSQL or production.',
                     'Invalid page has no cancel dialog/form; Escape is checked as non-mutating, not fabricated as a Cancel action.']}
phase, step, route_name = 'preflight', 'manifest', None
bridge = browser = page = None
contexts = []
origin = base = ''

def sha(file): return hashlib.sha256(file.read_bytes()).hexdigest()
def persist():
    (out / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
def read(path, body=None, method='POST', headers=None, source='preflight'):
    packet = {'url': origin + path, 'method': method, 'headers': headers or {},
              'body': None if body is None else json.dumps(body)}
    bridge.stdin.write(json.dumps(packet) + '\n'); bridge.stdin.flush()
    if not select.select([bridge.stdout], [], [], 45)[0]: raise TimeoutError('Original fixture timed out: ' + path)
    line = bridge.stdout.readline()
    if not line: raise RuntimeError('Original fixture stopped: ' + path)
    response = json.loads(line)
    result['readResponses'].append({'source': source, 'route': route_name, 'phase': phase,
                                   'path': path, 'method': method, 'request': body,
                                   'status': response['status'], 'body': json.loads(response['body'])})
    return response
def respond(intercept):
    req = intercept.request; url = urlsplit(req.url)
    body = json.loads(req.post_data) if req.post_data else None
    event = {'route': route_name, 'phase': phase, 'step': step, 'url': req.url,
             'method': req.method, 'body': body}
    result['requests'].append(event)
    if f'{url.scheme}://{url.netloc}' != origin:
        result['externalRequests'].append(event); intercept.abort(); return
    if url.path.startswith('/api/'):
        auth = req.method == 'GET' and url.path == '/api/auth/session'
        readonly = auth or req.method == 'POST' and url.path.endswith('/query')
        if not readonly:
            result['forbiddenCommands'].append(event); intercept.abort(); return
        if phase == 'invalid' and not auth:
            result['invalidRouteBusinessAttempts'].append(event); intercept.abort(); return
        response = read(url.path, body, req.method, req.headers, source='browser')
        intercept.fulfill(status=response['status'], headers=response['headers'], body=response['body']); return
    relative = 'index.html' if url.path == '/' else unquote(url.path[len(base):]) if url.path.startswith(base) else ''
    if relative not in assets:
        intercept.fulfill(status=404, body='Not a fixed native build output'); return
    mime = 'application/javascript' if relative.endswith('.js') else mimetypes.guess_type(relative)[0] or 'application/octet-stream'
    intercept.fulfill(status=200, content_type=mime, body=(build / relative).read_bytes())
def shot(label):
    file = f'{len(result["screens"]):02d}-{label}.png'
    page.screenshot(path=str(out / file), full_page=True, animations='disabled')
    result['screens'].append({'path': file, 'route': route_name, 'step': step, 'url': page.url,
                              'viewport': page.viewport_size, 'sourceCheckpoint': a.expected_checkpoint})
def healthy():
    for key in ['forbiddenCommands', 'invalidRouteBusinessAttempts', 'externalRequests', 'pageErrors', 'consoleErrors']:
        assert not result[key], {key: result[key]}
def bad_page():
    expect(page.locator('.sidebar')).to_be_visible()
    expect(page.locator('.basic-account')).to_be_visible()
    alert = page.locator('#page > .iw-state[role="alert"]')
    expect(alert).to_have_count(1); expect(alert).to_be_visible()
    expect(alert).to_have_text('商品链接无效，请返回商品列表。 返回商品列表')
    expect(alert.get_by_role('button', name='返回商品列表', exact=True)).to_be_enabled()
    expect(page.locator('#page')).not_to_contain_text('DomainError')
    expect(page.locator('#page')).not_to_contain_text('INVALID_ID')
    expect(page.locator('#page .pc-detail-workbench, #page .pc-products')).to_have_count(0)
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert page.evaluate('location.hash.slice(1)') == route_name
    assert len(page.context.pages) == 1
    healthy()
    return alert
def product_list():
    expect(page.get_by_role('heading', name='商品信息', exact=True)).to_be_visible()
    expect(page.locator('#page .pc-products .pc-data-table tbody tr')).to_have_count(6)
    expect(page.locator('#page > .iw-state[role="alert"]')).to_have_count(0)
    expect(page.locator('#page [role="alert"]')).to_have_count(0)
    assert page.evaluate('location.hash') == '#products'
    successful = [r for r in result['readResponses'] if r['source'] == 'browser' and r['phase'] == 'valid'
                  and r['path'] == '/api/product-management/query' and r['status'] == 200]
    assert successful and len(successful[-1]['body']['items']) == 6, 'No genuine original fixture list response'
    expect(page.locator('.sidebar a[data-route="products"]')).to_have_attribute('aria-current', 'page')
    healthy()

def run_cases(pw):
    global browser, page, phase, step, route_name
    try: browser = pw.chromium.launch(executable_path=a.chromium, headless=False, chromium_sandbox=True)
    except Exception as error: raise BrowserLaunchBlocked(str(error)) from error
    for index, bad_route in enumerate(ROUTES):
        route_name, phase, step = bad_route, 'invalid', f'route-{index+1}-first-invalid'
        ctx = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
        contexts.append(ctx); ctx.tracing.start(screenshots=True, snapshots=True, sources=True)
        ctx.route('**/*', respond); page = ctx.new_page()
        page.on('pageerror', lambda error: result['pageErrors'].append({'route': route_name, 'step': step, 'error': str(error)}))
        page.on('console', lambda msg: result['consoleErrors'].append({'route': route_name, 'step': step, 'error': msg.text}) if msg.type == 'error' else None)
        page.goto(origin + '/#' + bad_route); page.bring_to_front()
        alert = bad_page(); shell = page.locator('.sidebar').element_handle()
        account = page.locator('.basic-account').inner_text()
        shot(f'route-{index+1}-local-invalid')
        # There is no Cancel dialog here. Escape must not erase the local error.
        page.keyboard.press('Escape'); bad_page()
        phase, step = 'valid', f'route-{index+1}-return-list'
        alert.get_by_role('button', name='返回商品列表', exact=True).click()
        product_list(); assert shell.evaluate('el=>el.isConnected&&el===document.querySelector(".sidebar")')
        assert page.locator('.basic-account').inner_text() == account
        shot(f'route-{index+1}-returned-list')
        # Re-enter the same malformed leaf using actual browser hash navigation.
        phase, step = 'invalid', f'route-{index+1}-repeat-invalid'
        page.goto(origin + '/#' + bad_route); bad_page()
        assert shell.evaluate('el=>el.isConnected&&el===document.querySelector(".sidebar")')
        phase, step = 'valid', f'route-{index+1}-sidebar-recovery'
        page.locator('.sidebar a[data-route="inventory"]').click()
        expect(page.get_by_role('heading', name='库存状况表', exact=True)).to_be_visible()
        expect(page.locator('#iw-results').get_by_text('等待查询', exact=True)).to_be_visible()
        expect(page.locator('#page > .iw-state[role="alert"]')).to_have_count(0)
        page.locator('.sidebar a[data-route="products"]').click(); product_list()
        assert shell.evaluate('el=>el.isConnected&&el===document.querySelector(".sidebar")')
        assert page.locator('.basic-account').inner_text() == account
        healthy(); shot(f'route-{index+1}-repeat-shell-usable')
        invalid_api = [r for r in result['requests'] if r['route'] == bad_route and r['phase'] == 'invalid'
                       and urlsplit(r['url']).path.startswith('/api/') and urlsplit(r['url']).path != '/api/auth/session']
        assert not invalid_api
        result['cases'].append({'originalFindingId': 'F1', 'malformedRoute': bad_route,
                                'status': 'PASS_LISTED_STEPS_ONLY', 'wholePass': False,
                                'invalidBusinessReadWriteCount': 0, 'repetitions': 2,
                                'checks': ['exact local error and list action; no raw exception',
                                           'Escape preserves local status; no fabricated cancel dialog',
                                           'return action reaches genuine six-row product list',
                                           'repeat invalid then actual sidebar inventory/products recovery',
                                           'same shell/account remains usable; no extra tab or business command']})
        persist()
    result.update(status='PASS_LISTED_STEPS_ONLY', activeStep='finished'); persist()

class BrowserLaunchBlocked(Exception): pass
def failure(error, capture):
    if result.get('reason'):
        result['cleanupErrors'].append({'stage': 'secondary', 'error': str(error)}); return
    result.update(status='BLOCKED_ENV' if isinstance(error, BrowserLaunchBlocked) else 'FAIL',
                  reason=str(error), failureRoute=route_name, failureStep=step, traceback=traceback.format_exc())
    if capture and page:
        for label, fn in [('failure.png', lambda: page.screenshot(path=str(out / 'failure.png'), full_page=True, animations='disabled')),
                          ('failure.html', lambda: (out / 'failure.html').write_text(page.content())),
                          ('failure.txt', lambda: (out / 'failure.txt').write_text(page.locator('body').inner_text()))]:
            try:
                if not page.is_closed(): fn()
            except Exception as extra: result['cleanupErrors'].append({'stage': label, 'error': str(extra)})
    persist()
def close_ui():
    for index, ctx in enumerate(contexts):
        try: ctx.tracing.stop(path=str(out / f'trace-{index:02d}.zip'))
        except Exception as error: result['cleanupErrors'].append({'stage': f'trace-{index}', 'error': str(error)})
        try: ctx.close()
        except Exception as error: result['cleanupErrors'].append({'stage': f'context-{index}', 'error': str(error)})
    if browser:
        try: browser.close()
        except Exception as error: result['cleanupErrors'].append({'stage': 'browser-close', 'error': str(error)})

try:
    manifest = json.loads((build / 'production-build.json').read_text())
    assert manifest['sourceCheckpoint'] == a.expected_checkpoint
    assert subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip() == a.expected_checkpoint
    for item in manifest['inputs']:
        file = repo / item['path']; assert file.is_file() and sha(file) == item['sha256'], 'Native input drift: ' + item['path']
    for item in manifest['outputs']:
        file = build / item['path']; assert file.is_file() and sha(file) == item['sha256'], 'Native output drift: ' + item['path']
    cfg = manifest['configuration']; origin = cfg['http']['origin']; base = cfg['assets']['basePath']
    assert origin == 'https://synthetic-management.invalid' and cfg['routes']['products'] and cfg['routes']['productFullPage']
    assert not any(cfg['routes'].get('maintenance', {}).values()), 'Existing no-maintenance profile required'
    assets = {item['path'] for item in manifest['outputs']} | {'index.html'}
    bound = ['apps/web/demo-replica/frontend/runtime/products/feature.ts',
             'apps/web/demo-replica/frontend/runtime/products/detail-entry.tsx',
             'apps/web/demo-replica/frontend/runtime/products/deep-link-boundary.test.mjs',
             'docs/repair-review-20261029/F1.md', 'apps/web/demo-replica/tests/production-browser-fixture.mjs']
    result.update(sourceCheckpoint=a.expected_checkpoint, buildManifestSha256=sha(build / 'production-build.json'),
                  scriptSha256=sha(Path(__file__)), configuration=cfg,
                  sourceHashes=[{'path': file, 'sha256': sha(repo / file)} for file in bound])
    bridge = subprocess.Popen([a.node, '--experimental-transform-types', str(bridge_file)],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1,
                              stderr=(out / 'fixture-stderr.log').open('w'))
    response = read('/api/auth/session', method='GET')
    assert response['status'] == 200 and json.loads(response['body'])['principal']['role'] == 'ADMIN'
    from playwright.sync_api import sync_playwright, expect
    with sync_playwright() as pw:
        try: run_cases(pw)
        except Exception as error: failure(error, True)
        finally: close_ui()
except Exception as error:
    failure(error, False)  # No UI calls after Playwright's context has exited.
finally:
    if bridge:
        try: bridge.terminate(); bridge.wait(timeout=5)
        except Exception as error: result['cleanupErrors'].append({'stage': 'bridge-close', 'error': str(error)})
    result['cleanupStatus'] = 'FAIL' if result['cleanupErrors'] else 'PASS'
    result['executionStatus'] = ('BLOCKED_ENV' if result['status'] == 'BLOCKED_ENV' else
                                 'PASS' if result['status'] == 'PASS_LISTED_STEPS_ONLY' and not result['cleanupErrors'] else 'FAIL')
    persist()
    print(json.dumps({'status': result['status'], 'executionStatus': result['executionStatus'],
                      'passedCases': len(result['cases']), 'reason': result.get('reason'), 'wholePass': False}, ensure_ascii=False), flush=True)
raise SystemExit(2 if result['executionStatus'] == 'BLOCKED_ENV' else 0 if result['executionStatus'] == 'PASS' else 1)
