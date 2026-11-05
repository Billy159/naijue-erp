/** Synthetic-harness-only adapter: the real AuthenticationPanel remains intact.
 * This local transport has no credential/password endpoints, so do not invite
 * users to enter secrets into a visual acceptance fixture. */
export function installSyntheticAuthNotice(root: HTMLElement): () => void {
  const update = () => {
    const form = root.querySelector<HTMLFormElement>('.auth-form[aria-label="账号登录"]');
    if (form && !form.dataset.syntheticNotice) {
      form.dataset.syntheticNotice = 'true';
      const heading = form.querySelector('h2'); if (heading) heading.textContent = '合成验收 · 无需账号密码';
      form.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.placeholder = '无真实账号，请使用上方“模拟进入”'; input.autocomplete = 'off'; });
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submit) { submit.disabled = true; submit.textContent = '此页不支持真实账号登录'; }
      const hint = form.querySelector('.auth-hint'); if (hint) hint.textContent = '仅用于合成页面验收。点击上方“模拟进入”，请勿输入真实账号或密码。';
    }
    form?.querySelectorAll<HTMLInputElement>('input').forEach(input => { if (!input.disabled) input.disabled = true; });
    const login = form?.querySelector<HTMLButtonElement>('button[type="submit"]'); if (login && !login.disabled) login.disabled = true;
    const accountItems = root.querySelector('.auth-account-trigger[aria-expanded="true"]')
      ? Array.from(root.ownerDocument.querySelectorAll<HTMLElement>('.auth-account-options [role=menuitem]')) : [];
    [...Array.from(root.querySelectorAll<HTMLElement>('.auth-session button')), ...accountItems].forEach(button => {
      if (button.textContent === '修改密码' || button.dataset.syntheticPassword === 'true') {
        button.dataset.syntheticPassword = 'true';
        if (button.textContent !== '无真实密码（合成验收）') button.textContent = '无真实密码（合成验收）';
        if (button instanceof HTMLButtonElement && !button.disabled) button.disabled = true;
        if (button.getAttribute('role') === 'menuitem') {
          if (button.getAttribute('aria-disabled') !== 'true') button.setAttribute('aria-disabled', 'true');
          button.tabIndex = -1; button.classList.add('arco-menu-disabled');
        }
        button.title = '合成验收没有真实账号或密码；正式认证功能未改动。';
      }
    });
  };
  // The real account menu uses an Arco portal outside root. Only the exact
  // synthetic-marked password item is inert; every other account action and
  // all production AuthenticationAccountMenu code retain their native behavior.
  const blockSyntheticPassword = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-synthetic-password="true"]') : null;
    if (!target || !(root.contains(target) || root.querySelector('.auth-account-trigger[aria-expanded="true"]') && target.closest('.auth-account-options'))) return;
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault(); event.stopImmediatePropagation();
  };
  const body = root.ownerDocument.body, observer = new MutationObserver(update);
  body.addEventListener('click', blockSyntheticPassword, true); body.addEventListener('keydown', blockSyntheticPassword, true);
  observer.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled'] }); update();
  return () => { observer.disconnect(); body.removeEventListener('click', blockSyntheticPassword, true); body.removeEventListener('keydown', blockSyntheticPassword, true); };
}
