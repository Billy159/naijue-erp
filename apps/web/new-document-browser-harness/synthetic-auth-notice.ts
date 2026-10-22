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
    root.querySelectorAll<HTMLButtonElement>('.auth-session button').forEach(button => {
      if (button.textContent === '修改密码' || button.dataset.syntheticPassword === 'true') {
        button.dataset.syntheticPassword = 'true';
        if (button.textContent !== '无真实密码（合成验收）') button.textContent = '无真实密码（合成验收）';
        if (!button.disabled) button.disabled = true;
        button.title = '合成验收没有真实账号或密码；正式认证功能未改动。';
      }
    });
  };
  const observer = new MutationObserver(update);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] }); update();
  return () => observer.disconnect();
}
