"""Prepared, NOT RUN: native S13/S03 display regression with failure diagnostics.

Usage: python3 sales-display-browser-diagnostic.py REPO BUILD FRESH_OUT \
    --node NODE --chromium CHROMIUM

Use the root owner's sandboxed native headed Chromium workflow only. Serves the
fixed synthetic production build and existing --sales-chain fixture unchanged.
No sleeps, app-state injection, SAVE, preparation, PostgreSQL, or production host.
Original sales-display-browser.py and actual-first evidence remain untouched.
"""

import argparse
import json
import mimetypes
import subprocess
import sys
import traceback
from pathlib import Path
from urllib.parse import unquote, urlsplit


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("repo")
    parser.add_argument("build")
    parser.add_argument("out")
    parser.add_argument("--node", default="node")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    repo = Path(args.repo).resolve()
    build = Path(args.build).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=False)
    manifest = json.loads((build / "production-build.json").read_text())
    origin = manifest["configuration"]["http"]["origin"]
    base = manifest["configuration"]["assets"]["basePath"]
    if origin != "https://synthetic-management.invalid":
        raise SystemExit("This regression accepts the closed synthetic build only")
    allowed = {item["path"] for item in manifest["outputs"]} | {"index.html"}
    result = {
        "status": "BLOCKED_ENV",
        "sourceCheckpoint": manifest["sourceCheckpoint"],
        "syntheticOnly": True,
        "checks": [],
        "assertions": [],
        "requests": [],
        "screens": [],
        "observations": [],
        "stateHistory": [],
        "cleanupErrors": [],
        "notApplicable": [
            "Pure EXCHANGE with no selected lines is unreachable: combined empty mode derives RETURN."
        ],
        "notClaimed": [
            "S03 universal row count or Tab timing: original Demo can add a blank row after a later reference-field redraw.",
            "Real production/PG correctness, SAVE validation, deployment, or whole-page parity.",
        ],
    }
    bridge = browser = page = None
    contexts = []
    errors = []
    step = "initialization"
    expected = None

    def write_result():
        (out / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))

    def state():
        # Read-only DOM inspection; never access or modify React/session state.
        return page.evaluate("""() => {
          let active = document.activeElement;
          while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
          const field = label => [...document.querySelectorAll('input')]
            .filter(el => el.getAttribute('aria-label') === label)
            .map(el => ({value: el.value, focused: el === active, disabled: el.disabled,
                         connected: el.isConnected, outerHTML: el.outerHTML}));
          return {
            url: location.href,
            summary: document.querySelector('#sale-summary')?.innerText ?? null,
            discount: field('整单优惠 / 抹零'),
            quantities: field('本行数量'), dealPrices: field('本行成交单价'),
            productQueries: field('商品款号 / 名称 / 条码'),
            rowCount: document.querySelectorAll('tr[data-entry-row]').length,
            active: active ? {tag: active.tagName, label: active.getAttribute('aria-label'),
                             value: 'value' in active ? active.value : null,
                             outerHTML: active.outerHTML} : null,
            alerts: [...document.querySelectorAll('[role="alert"]')].map(el => el.innerText)
          };
        }""")

    def record(name):
        result["stateHistory"].append({"step": name, "state": state()})

    def begin(name):
        nonlocal step, expected
        step, expected = name, None
        result["activeStep"] = name

    def expect_value(control, value, label):
        nonlocal expected
        expected = {"control": label, "value": value}
        expect(control).to_have_value(value)
        result["assertions"].append({"step": step, "expected": expected})

    def expect_selection(control, start, end, label):
        nonlocal expected
        expected = {"control": label, "selection": [start, end]}
        actual = control.evaluate("el => [el.selectionStart, el.selectionEnd]")
        assert actual == [start, end], f"{label}: expected {[start, end]}, got {actual}"
        result["assertions"].append({"step": step, "expected": expected, "actual": actual})

    def expect_summary(*parts):
        nonlocal expected
        expected = {"summaryContains": list(parts)}
        for part in parts:
            expect(page.locator("#sale-summary")).to_contain_text(part)
        result["assertions"].append({"step": step, "expected": expected})

    def shot(name):
        page.screenshot(path=str(out / (name + ".png")), full_page=True)
        result["screens"].append(name)

    def pick(label, name, *, dismiss_heading=True):
        page.get_by_role("combobox", name=label, exact=True).click()
        page.get_by_role("option", name=name, exact=True).click()
        if dismiss_heading:
            page.locator("#page h1").click()
        page.wait_for_load_state("networkidle")

    def fresh(mode):
        nonlocal page
        context = browser.new_context(
            viewport={"width": 1440, "height": 1000}, device_scale_factor=1
        )
        contexts.append(context)
        context.tracing.start(screenshots=True, snapshots=True, sources=True)
        context.route("**/*", respond)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(origin + "/#inventory")
        page.locator(".basic-account button").first.wait_for()
        page.locator("#page .iw-workbench, #page .iw-query").first.wait_for()
        page.locator('.sidebar a[data-route="sales/new"]').click()
        page.get_by_role("textbox", name="整单优惠 / 抹零", exact=True).wait_for()
        pick("业务类型", "销售" if mode == "SALE" else "退货/换货")
        pick("营业厅", "网点营业厅")
        pick("客户", "零售客户")
        pick("出库仓", "备货仓")

    def respond(route):
        request = route.request
        url = urlsplit(request.url)
        result["requests"].append(
            {"method": request.method, "url": request.url, "body": request.post_data}
        )
        if f"{url.scheme}://{url.netloc}" != origin:
            route.abort()
            return
        if url.path.startswith("/api/"):
            bridge.stdin.write(json.dumps({
                "url": request.url, "method": request.method,
                "headers": request.headers, "body": request.post_data,
            }) + "\n")
            bridge.stdin.flush()
            line = bridge.stdout.readline()
            if not line:
                raise RuntimeError("Existing sales-chain fixture ended before its response")
            response = json.loads(line)
            route.fulfill(status=response["status"], headers=response["headers"], body=response["body"])
            return
        relative = "index.html" if url.path == "/" else (
            unquote(url.path[len(base):]) if url.path.startswith(base) else ""
        )
        if relative not in allowed:
            route.fulfill(status=404, body="Not in fixed build manifest")
            return
        mime = "application/javascript" if relative.endswith(".js") else (
            mimetypes.guess_type(relative)[0] or "application/octet-stream"
        )
        route.fulfill(status=200, content_type=mime, body=(build / relative).read_bytes())

    def original_no_match(mode, raw):
        begin(mode + " no-match/Esc/Tab")
        fresh(mode)
        search = page.get_by_role("combobox", name="商品款号 / 名称 / 条码", exact=True).first
        search.fill(raw)
        page.get_by_role("dialog", name="商品候选", exact=True).get_by_text(
            "没有匹配结果，请继续输入", exact=True
        ).wait_for()
        page.wait_for_load_state("networkidle")
        if mode == "SALE":
            expect_summary("0款 0件", "销售金额 ¥0.00", "优惠 ¥0.00", "应结 ¥0.00")
        else:
            expect_summary("退回 0件", "换出 0件", "差额 ¥0.00")
        expect(page.locator("#sale-summary")).not_to_contain_text("—")
        text = page.locator("#sale-summary").inner_text()
        count = page.get_by_role("combobox", name="商品款号 / 名称 / 条码", exact=True).count()
        shot(mode.lower() + "-no-match")
        search.press("Escape")
        page.get_by_role("dialog", name="商品候选", exact=True).wait_for(state="detached")
        expect_value(search, raw, "product query after Escape")
        expect(page.locator("#sale-summary")).to_have_text(text, use_inner_text=True)
        shot(mode.lower() + "-no-match-escape")
        search.press("Tab")
        result["observations"].append({
            "case": mode + " exact original input/Esc/Tab",
            "visibleSearchInputs": count,
            "rowCount": page.locator("tr[data-entry-row]").count(),
            "activeAfterTab": state()["active"],
            "candidateAfterTab": page.get_by_role("dialog", name="商品候选", exact=True).count(),
            "summary": text,
        })
        shot(mode.lower() + "-no-match-tab")
        result["checks"].append(mode + " empty no-match/Esc preserves raw query and exact zero summary")

    def edit_discount(control, previous_raw, raw, blurred, summary):
        # Focus is its own action and must commit its raw presentation BEFORE
        # fill. Each expectation polls the actual DOM; no value retries or sleeps.
        control.focus()
        expect(control).to_be_focused()
        expect_value(control, previous_raw, "discount raw after explicit focus")
        record(step + " / focused raw")
        control.fill(raw)
        expect_value(control, raw, "discount raw after fill")
        record(step + " / filled raw")
        control.press("Tab")
        expect(control).not_to_be_focused()
        record(step + " / immediately after Tab")
        expect_value(control, blurred, "discount formatted after Tab")
        expect_summary(*summary)
        record(step + " / settled blur")

    try:
        from playwright.sync_api import expect, sync_playwright
    except Exception as error:
        result["reason"] = f"{type(error).__name__}: {error}"
        write_result()
        return 2

    with sync_playwright() as pw:
        # Capture and cleanup are INSIDE this lifetime. No Playwright call may
        # run after __exit__; cleanup errors never replace the primary failure.
        stderr = None
        exit_code = 1
        try:
            begin("launch sandboxed native headed Chromium")
            browser = pw.chromium.launch(
                executable_path=args.chromium, headless=False, chromium_sandbox=True
            )
            stderr = (out / "fixture-stderr.log").open("w")
            fixture = repo / "apps/web/demo-replica/tests/production-browser-fixture.mjs"
            bridge = subprocess.Popen(
                [args.node, "--experimental-transform-types", str(fixture), "--sales-chain"],
                cwd=repo, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=stderr, text=True, bufsize=1,
            )
            original_no_match("SALE", "ZZZ-NO-PRODUCT")
            original_no_match("RETURN_EXCHANGE", "ZZZ-RETURN")

            begin("selected complete SKU with unknown user deal price")
            fresh("SALE")
            search = page.get_by_role("combobox", name="商品款号 / 名称 / 条码", exact=True).first
            search.fill("M26001")
            page.locator("[data-sale-candidate][data-finder-option]").filter(has_text="M26001").click()
            page.wait_for_load_state("networkidle")
            row = page.locator("tr[data-entry-row]").first
            for index in range(3):
                row.locator(".mx-spec-picker").nth(index).click()
                page.locator(".mx-spec-menu-options button").first.wait_for()
                page.locator(".mx-spec-menu-options button").first.click()
                page.wait_for_load_state("networkidle")
            quantity = row.get_by_role("textbox", name="本行数量", exact=True)
            quantity.fill("1")
            expect_value(quantity, "1", "selected SKU quantity")
            price = row.get_by_role("textbox", name="本行成交单价", exact=True)
            expect_value(price, "", "missing user deal price")
            expect_summary("1款 1件", "销售金额 ¥—")
            shot("selected-complete-sku-price-unknown")
            result["checks"].append("Selected complete SKU with missing deal price remains unknown, not zero")

            begin("S13 original 100 minus10 net90")
            price.fill("100")
            expect_value(price, "100", "user deal price")
            discount = page.get_by_role("textbox", name="整单优惠 / 抹零", exact=True)
            # Initial raw amount is observed, not rewritten or assumed to be a
            # particular zero spelling. The original flow's fill remains intact.
            discount.fill("10")
            expect_value(discount, "10", "initial typed discount")
            discount.press("Tab")
            expect(discount).not_to_be_focused()
            expect_value(discount, "-10.00", "initial blurred discount")
            expect_summary("销售金额 ¥100.00", "优惠 ¥10.00", "应结 ¥90.00")
            text = page.locator("#sale-summary").inner_text()
            shot("s13-original-100-minus10-net90")
            result["checks"].append("S13 original 100/10/90 display")

            for index in range(2):
                begin(f"S13 repeated focus/Tab {index + 1}")
                discount.focus()
                expect(discount).to_be_focused()
                expect_value(discount, "10", "raw discount after repeated focus")
                discount.press("Tab")
                expect(discount).not_to_be_focused()
                expect_value(discount, "-10.00", "discount after repeated blur")
                expect(page.locator("#sale-summary")).to_have_text(text, use_inner_text=True)
                record(step)
            result["checks"].append("S13 repeated focus/blur preserves raw10 and net90")

            begin("S13 explicit-focus reedit20 net80")
            edit_discount(discount, "10", "20", "-20.00", ("优惠 ¥20.00", "应结 ¥80.00"))
            shot("s13-reedit-minus20-net80")
            result["checks"].append("S13 explicit-focus reedit20 net80")

            begin("S13 original implicit-focus zero unsigned")
            # Keep the original failing action sequence first. The additional
            # DOM observations and expect reveal eventual vs persistent failure.
            # A failing action is NEVER repeated or replaced with a passing path.
            record(step + " / before fill")
            discount.fill("0")
            record(step + " / immediately after fill")
            expect_value(discount, "0", "original zero fill must retain raw zero")
            discount.press("Tab")
            record(step + " / immediately after Tab")
            expect(discount).not_to_be_focused()
            expect_value(discount, "0.00", "original zero blur must be unsigned exact cents")
            expect_summary("销售金额 ¥100.00", "优惠 ¥0.00", "应结 ¥100.00")
            record(step + " / settled blur")
            shot("s13-zero-unsigned")
            result["checks"].append("S13 original implicit-focus zero remains unsigned and net100")

            begin("S13 explicit-focus 20 then zero")
            edit_discount(discount, "0", "20", "-20.00", ("优惠 ¥20.00", "应结 ¥80.00"))
            edit_discount(discount, "20", "0", "0.00", ("优惠 ¥0.00", "应结 ¥100.00"))
            shot("s13-explicit-focus-zero-unsigned")
            result["checks"].append("S13 explicit-focus reedit20 then unsigned zero preserves net100")

            begin("S13 typed negative stays invalid")
            edit_discount(discount, "0", "-10", "-10", ("应结 ¥—",))
            discount.focus()
            expect(discount).to_be_focused()
            expect_value(discount, "-10", "invalid negative after focus")
            shot("s13-typed-negative-stays-invalid")
            result["checks"].append("S13 typed negative remains raw and summary unknown")

            begin("reachable EXCHANGE selected known row plus no-match query")
            edit_discount(discount, "-10", "0", "0.00", ("应结 ¥100.00",))
            # Existing lines open a real confirmation modal; do not dismiss
            # via the blocked page heading. The caller handles this dialog below.
            pick("业务类型", "退货/换货", dismiss_heading=False)
            dialog = page.get_by_role("dialog", name="切换业务类型", exact=True)
            dialog.wait_for()
            dialog.get_by_role("button", name="确定", exact=True).click()
            dialog.wait_for(state="detached")
            row = page.locator("tr[data-entry-row]").first
            row.get_by_role("combobox", name="本行方向", exact=True).click()
            page.get_by_role("option", name="换出 ＋", exact=True).click()
            page.locator("#page h1").click()
            expect_value(row.get_by_role("textbox", name="本行数量", exact=True), "1", "exchange outgoing quantity")
            pending = page.get_by_role("combobox", name="商品款号 / 名称 / 条码", exact=True).last
            entry_key = pending.evaluate("el => el.closest('tr[data-entry-row]').getAttribute('data-entry-row')")
            search = page.locator("tr[data-entry-row=" + json.dumps(entry_key) + "]").get_by_role("combobox", name="商品款号 / 名称 / 条码", exact=True)
            search.fill("ZZZ-EXCHANGE")
            page.get_by_role("dialog", name="商品候选", exact=True).get_by_text(
                "没有匹配结果，请继续输入", exact=True
            ).wait_for()
            search.press("Escape")
            page.get_by_role("dialog", name="商品候选", exact=True).wait_for(state="detached")
            expect_summary("退回 0件", "换出 1件", "应收 ¥100.00")
            expect_value(search, "ZZZ-EXCHANGE", "exchange no-match raw query after Escape")
            shot("exchange-known-row-plus-unselected-query")
            result["checks"].append("Reachable EXCHANGE known positive row plus no-match search retains known summary")

            # Separate context and late case ordering keep original discount
            # zero/negative and EXCHANGE checks observable even if reverse Tab fails.
            begin("S13 isolated pointer and keyboard case setup")
            fresh("SALE")
            search = page.get_by_role("combobox", name="商品款号 / 名称 / 条码", exact=True).first
            search.fill("M26001")
            page.locator("[data-sale-candidate][data-finder-option]").filter(has_text="M26001").click()
            page.wait_for_load_state("networkidle")
            row = page.locator("tr[data-entry-row]").first
            for index in range(3):
                row.locator(".mx-spec-picker").nth(index).click()
                page.locator(".mx-spec-menu-options button").first.wait_for()
                page.locator(".mx-spec-menu-options button").first.click()
                page.wait_for_load_state("networkidle")
            row.get_by_role("textbox", name="本行数量", exact=True).fill("1")
            expect_value(row.get_by_role("textbox", name="本行数量", exact=True), "1", "isolated keyboard case quantity")
            price = row.get_by_role("textbox", name="本行成交单价", exact=True)
            price.fill("100")
            expect_value(price, "100", "isolated keyboard case price")
            discount = page.get_by_role("textbox", name="整单优惠 / 抹零", exact=True)
            discount.fill("20")
            expect_value(discount, "20", "isolated keyboard case raw discount")
            discount.press("Tab")
            expect(discount).not_to_be_focused()
            expect_value(discount, "-20.00", "isolated keyboard case formatted discount")
            expect_summary("销售金额 ¥100.00", "优惠 ¥20.00", "应结 ¥80.00")

            begin("S13 pointer partial edit and keyboard focus policy")
            # Intentional formatted-to-raw focus policy, not exact frozen Demo
            # caret parity. Real pointer/keys only; selection inspection is read-only.
            discount.click()
            expect(discount).to_be_focused()
            expect_value(discount, "20", "raw discount after pointer focus")
            expect_selection(discount, 0, 2, "changed projection selects raw20 after pointer click")
            shot("s13-pointer-focus-raw20")
            discount.press("Home")
            discount.press("ArrowRight")
            discount.press("Shift+ArrowRight")
            expect_selection(discount, 1, 2, "keyboard partial selection after pointer focus")
            discount.press("5")
            expect_value(discount, "25", "partial replacement changes only the selected raw digit")
            expect_summary("销售金额 ¥100.00", "优惠 ¥25.00", "应结 ¥75.00")
            shot("s13-pointer-partial-raw25")
            discount.press("Tab")
            expect(discount).not_to_be_focused()
            expect_value(discount, "-25.00", "partial edit formatted after Tab")
            page.keyboard.press("Shift+Tab")
            expect(discount).to_be_focused()
            expect_value(discount, "25", "raw discount after keyboard refocus")
            expect_selection(discount, 0, 2, "changed projection selects raw25 after ShiftTab")
            shot("s13-keyboard-refocus-raw25")
            page.keyboard.press("Control+A")
            page.keyboard.type("20")
            expect_value(discount, "20", "keyboard whole replacement restores raw20")
            expect_summary("销售金额 ¥100.00", "优惠 ¥20.00", "应结 ¥80.00")
            discount.press("Tab")
            expect(discount).not_to_be_focused()
            expect_value(discount, "-20.00", "keyboard replacement formatted before original implicit zero fill")
            expect_summary("销售金额 ¥100.00", "优惠 ¥20.00", "应结 ¥80.00")
            record(step)
            shot("s13-keyboard-replace20-net80")
            result["checks"].append("S13 real pointer focus/partial25, Tab/ShiftTab select-all and keyboard20 preserve exact raw/summary")

            begin("display-only safety invariants")
            assert not errors, errors
            forbidden = [request for request in result["requests"] if urlsplit(request["url"]).path in {
                "/api/sales/commands", "/api/sales/prepare-create", "/api/sales/prepare-existing"
            }]
            assert not forbidden, "Display-only regression must not save or prepare business writes: " + repr(forbidden)
            result["checks"].append("No page errors or SAVE/prepare requests")
            result["status"] = "PASS"
            exit_code = 0
        except Exception as error:
            result["status"] = "FAIL" if browser else "BLOCKED_ENV"
            result["reason"] = f"{type(error).__name__}: {error}"
            result["failure"] = {
                "step": step, "expected": expected,
                "exceptionType": type(error).__name__, "exceptionRepr": repr(error),
                "traceback": traceback.format_exc(),
            }
            (out / "failure-traceback.txt").write_text(traceback.format_exc())
            if page is not None and not page.is_closed():
                for name, capture in [
                    ("state", lambda: result["failure"].update({"actual": state()})),
                    ("screenshot", lambda: page.screenshot(path=str(out / "failure.png"), full_page=True)),
                    ("DOM text", lambda: (out / "failure-dom.txt").write_text(page.locator("body").inner_text())),
                    ("DOM HTML", lambda: (out / "failure-dom.html").write_text(page.content())),
                ]:
                    try:
                        capture()
                    except Exception as capture_error:
                        result["failure"].setdefault("captureErrors", []).append(f"{name}: {capture_error}")
            print(result["failure"]["traceback"], file=sys.stderr)
            exit_code = 1 if browser else 2
        finally:
            result["errors"] = errors
            # Save primary evidence before any cleanup, while Playwright lives.
            write_result()
            for index, context in enumerate(contexts):
                for name, cleanup in [
                    (f"context {index} trace", lambda context=context, index=index: context.tracing.stop(path=str(out / f"trace-{index}.zip"))),
                    (f"context {index} close", context.close),
                ]:
                    try:
                        cleanup()
                    except Exception as cleanup_error:
                        result["cleanupErrors"].append(f"{name}: {cleanup_error}")
            if browser is not None:
                try:
                    browser.close()
                except Exception as cleanup_error:
                    result["cleanupErrors"].append(f"browser close: {cleanup_error}")
            if bridge is not None:
                try:
                    if bridge.poll() is None:
                        bridge.terminate()
                    try:
                        bridge.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        bridge.kill()
                        bridge.wait(timeout=5)
                    result["fixtureExitCode"] = bridge.returncode
                except Exception as cleanup_error:
                    result["cleanupErrors"].append(f"fixture cleanup: {cleanup_error}")
            if stderr is not None:
                stderr.close()
            if result["cleanupErrors"] and result["status"] == "PASS":
                result["status"] = "FAIL_CLEANUP"
                result["reason"] = "Assertions passed, but cleanup failed; see cleanupErrors"
                exit_code = 1
            write_result()
        if exit_code == 0:
            print("PASS exact S13 and display-only S03; row timing recorded, not universally accepted")
        return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
