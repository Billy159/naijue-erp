# User-requested fixed operation columns

All existing sales/transfer list operation headers and cells, sales readonly and editable line action headers/cells, and every transfer matrix group reuse the existing ui-action-cell class. No new columns or CSS override layer. Current document/product identities and drawer navigation unchanged.

Dot headed d579 transfer detail: 8/8 PASS after real RED (33px header/body mismatch at1440, narrow view also failed). Dot headed f073 sales/transfer lists and sales detail/edit:26/26 PASS after real RED; typecheck0. At1440/900 start/middle/end scroll, sticky geometry and buttons are checked; read/edit drawers retain document/focus. Screens inspected. Ledger holds exact case/evidenceSHA.

Follow-on d26c87e7 fixes separately observed900 filter overflow in the existing final rules: at≤1100 use three columns, at≤750 two, query actions get their own row. Real RED at1100/900/750 both lists; final30/30 headed checks PASS at1440/1280/1100/900/750, closed/open advanced filters and actual query. Normal1440/1280 layout preserved. Screenshot inspected; ledger holds exact evidenceSHA. Edited restored-line category can explicitly display 待确认分类 rather than infer a label; further read-contract comparison pending.
