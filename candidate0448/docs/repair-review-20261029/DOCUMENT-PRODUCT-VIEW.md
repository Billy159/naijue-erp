# Document line product inspection

Latest user direction supersedes the previous new-tab behavior only for sales/transfer detail-line product “查看”. Their shared activation now opens the same readonly three-tab product drawer as inventory, without changing the document route or disposing its draft. Nearest clicked line viewport is retained (including the second sales history exchange section); close restores focus/scroll. Product identity and authentication guards remain, as do historical unbound/unknown controls. Document-number navigation is untouched.

Shared drawer styles are imported through existing sales/transfer authoritative style compositions; no override stylesheet or page-style swap. Dot-native RED captured the old window.open; GREEN covers same route/no new tab/real ID/dirty input/nearest viewport and existing drawer lifecycle checks. Visible fixed-build verification follows separately.

追加实际前台验收：固定 2195ab69 生产产物，dot headed Chromium、sandbox 开启、封闭合成只读桥。销货和调拨详情实际点击商品查看，切换三页签并关闭，原 URL/页数保持、焦点回到原查看按钮；无页面异常。非法商品 UUID 实际打开局部提示后返回商品列表成功。`ui-controls-20261029/browser-green2/result.json` 与对应截图。首次脚本误用关闭选择器失败，修正为实际 Arco close-icon 后重跑通过；不计为业务失败或首次通过。
