"""Keep synchronous Playwright routes alive while a human uses the visible page.
Never block the Playwright thread in input()/sleep(): intercepted assets/API need its event pump.
"""
import select
import sys

def keep_visible(page, stdin=None, tick=None):
    stream = sys.stdin if stdin is None else stdin
    while not page.is_closed():
        if select.select([stream], [], [], 0)[0]:
            stream.readline()
            return
        page.wait_for_timeout(100)
        if tick:
            tick()
