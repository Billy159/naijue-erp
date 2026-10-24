import Avatar from '@arco-design/web-react/es/Avatar';
import Button from '@arco-design/web-react/es/Button';
import Divider from '@arco-design/web-react/es/Divider';
import Dropdown from '@arco-design/web-react/es/Dropdown';
import Input from '@arco-design/web-react/es/Input';
import Menu from '@arco-design/web-react/es/Menu';
import Modal from '@arco-design/web-react/es/Modal';
import Space from '@arco-design/web-react/es/Space';
import Typography from '@arco-design/web-react/es/Typography';
import { IconDown } from '@arco-design/web-react/icon';
import './account-password.css';

export interface ReplicaAccountEmployee {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

const roleLabel = (role: string) => ({ ADMIN: '管理员', WAREHOUSE: '仓库人员', SALESPERSON: '营业员' })[role] ?? role;

/** Arco-owned popup and menu; the host supplies the password and logout actions. */
export function AccountMenuView({ employee, onChangePassword, onLogout }: { readonly employee: ReplicaAccountEmployee; readonly onChangePassword: () => void; readonly onLogout: () => void }) {
  const name = employee.name.trim();
  const role = roleLabel(employee.role);
  const menu = <Menu onClickMenuItem={key => {
    if (key === 'password') onChangePassword();
    else if (key === 'logout') onLogout();
  }}>
    <Menu.ItemGroup title={<Space direction="vertical" size="mini">
      <Typography.Text bold>{name}</Typography.Text>
      <Typography.Text type="secondary">{role}</Typography.Text>
    </Space>}>
      <Divider style={{ margin: '8px 0' }} />
      <Menu.Item key="password">修改密码</Menu.Item>
      <Menu.Item key="logout"><Typography.Text type="error">退出登录</Typography.Text></Menu.Item>
    </Menu.ItemGroup>
  </Menu>;
  return <Dropdown trigger="click" position="br" triggerProps={{ escToClose: true, autoAlignPopupWidth: true }} droplist={menu}>
    <Button type="text" aria-label={`当前员工：${name} · ${role}`}>
      <Space align="center"><Avatar size={24}>{Array.from(name)[0]}</Avatar><Typography.Text>{name} · {role}</Typography.Text><IconDown /></Space>
    </Button>
  </Dropdown>;
}

export type OwnPasswordField = 'currentPassword' | 'newPassword' | 'confirmation';

export interface OwnPasswordFields {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly confirmation: string;
}

export type OwnPasswordErrors = Partial<Record<OwnPasswordField, string>> & { readonly form?: string };

/** T38 approved Arco modal presentation. Validation and authenticated submit stay with the host. */
export function ChangeOwnPasswordDialogView({ visible, submitting, fields, errors, onCancel, onSubmit, onFieldChange, onAfterOpen }: {
  readonly visible: boolean;
  readonly submitting: boolean;
  readonly fields: OwnPasswordFields;
  readonly errors: OwnPasswordErrors;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
  readonly onFieldChange: (field: OwnPasswordField, value: string) => void;
  readonly onAfterOpen: () => void;
}) {
  const field = (key: OwnPasswordField, label: string, autoComplete: string, hint?: string) => {
    const error = errors[key];
    const description = error ? `account-${key}-error` : hint ? `account-${key}-hint` : undefined;
    return <div className="account-password-field" key={key}>
      <label htmlFor={`account-${key}`}>{label}</label>
      <Input.Password id={`account-${key}`} data-account-password={key} value={fields[key]}
        onChange={value => onFieldChange(key, value)} placeholder={`请输入${label}`} autoComplete={autoComplete}
        visibilityToggle disabled={submitting} {...(error ? { status: 'error' as const } : {})}
        aria-invalid={!!error} aria-describedby={description} />
      {error ? <span id={description} className="account-password-error" role="alert">{error}</span>
        : hint ? <span id={description} className="account-password-hint">{hint}</span> : null}
    </div>;
  };
  return <Modal className="account-password-modal iw-arco-modal iw-arco-controls" visible={visible} title="修改密码"
    onCancel={onCancel} onOk={onSubmit} confirmLoading={submitting}
    okText={submitting ? '修改中…' : '确认修改'} cancelText="取消" closable={!submitting} escToExit={!submitting}
    cancelButtonProps={{ disabled: submitting }} maskClosable={false} unmountOnExit
    afterOpen={onAfterOpen}>
    <div className="account-password-fields">
      {field('currentPassword', '原密码', 'current-password')}
      {field('newPassword', '新密码', 'new-password', '至少 8 位')}
      {field('confirmation', '确认新密码', 'new-password')}
    </div>
    {errors.form && <p className="account-password-error" role="alert">{errors.form}</p>}
  </Modal>;
}
