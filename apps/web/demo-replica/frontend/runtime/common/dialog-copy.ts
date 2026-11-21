/** Use the same copy when different screens ask the same question. */
export const unsavedChanges = {
  leaveTitle: '还没保存，要离开吗？',
  leaveBody: '离开后，这次改的内容不会保留。',
  discardTitle: '放弃这次修改吗？',
  discardBody: '这次改的内容不会保留。',
} as const;

export const uncertainOperation = {
  title: '操作结果还没确认',
  body: '先查结果，查清前别再提交。',
  check: '查结果',
  retry: '重试上次操作',
} as const;
