/** Fixture-only guard. The actual AuthenticationPanel is still composed underneath,
 * but this acceptance page has NO credential endpoints and never invites secret entry. */
export function installManagementSyntheticAuthNotice(root: HTMLElement): () => void {
  const update = () => {
    const form = root.querySelector<HTMLFormElement>('.auth-form[aria-label="账号登录"]');
    if (form) {
      if (!form.hidden) form.hidden = true;
      form.setAttribute('aria-hidden', 'true');
      form.querySelectorAll<HTMLInputElement>('input').forEach(input => { if (!input.disabled) input.disabled = true; input.autocomplete = 'off'; input.value = ''; });
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]'); if (submit && !submit.disabled) submit.disabled = true;
    }
    root.querySelectorAll<HTMLButtonElement>('.auth-session button').forEach(button => {
      if (button.textContent === '修改密码' || button.dataset.managementSyntheticPassword) {
        button.dataset.managementSyntheticPassword = 'true'; if (!button.disabled) button.disabled = true;
        if (button.textContent !== '无真实密码（合成验收）') button.textContent = '无真实密码（合成验收）';
        button.title = '此离线验收页没有真实账号、密码或认证服务。';
      }
    });
  };
  const observer = new MutationObserver(update); observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled','hidden'] }); update();
  return () => observer.disconnect();
}
