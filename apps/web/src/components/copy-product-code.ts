export async function copyProductCode(
  code: string,
  notify: (message: string, copied: boolean) => void,
  successMessage = '已复制款号',
): Promise<void> {
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    notify(`复制失败，请手动复制款号 ${code}`, false);
    return;
  }
  notify(successMessage, true);
}
