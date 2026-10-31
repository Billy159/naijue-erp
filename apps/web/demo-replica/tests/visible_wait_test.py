import os
import unittest
from pathlib import Path
from visible_wait import keep_visible
class VisibleWait(unittest.TestCase):
    def test_idle_host_pumps_events_and_nonblocking_enter_exits(self):
        read,write=os.pipe()
        class Page:
            calls=0
            def is_closed(self):return False
            def wait_for_timeout(self,ms):
                self.calls+=1
                if self.calls==3:os.write(write,b'\n')
        page=Page()
        with os.fdopen(read)as stream:keep_visible(page,stream)
        os.close(write);self.assertEqual(page.calls,3)
    def test_all_retained_browser_harnesses_use_event_pump(self):
        for name in ['category-browser-regression.py','category-overflow-browser.py','main-pages-browser-regression.py','production-browser-smoke.py']:
            source=Path(__file__).with_name(name).read_text();self.assertNotIn('input()',source);self.assertIn('keep_visible(page)',source)
if __name__=='__main__':unittest.main()
