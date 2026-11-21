import { Modal } from '@arco-design/web-react';
import type { ComponentProps } from 'react';

type SettingsDialogProps = Omit<ComponentProps<typeof Modal>, 'maskClosable' | 'cancelText'>;

/** Preserve each settings editor's submit, close and recovery guards. */
export function SettingsDialog(props: SettingsDialogProps) {
  return <Modal {...props} maskClosable={false} cancelText="取消"/>;
}
