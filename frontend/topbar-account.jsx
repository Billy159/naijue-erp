/* Shared account menu: Arco owns the popup, menu and dismissal interactions. */
import React from 'react';
import {createRoot} from 'react-dom/client';
import Avatar from '@arco-design/web-react/es/Avatar';
import Dropdown from '@arco-design/web-react/es/Dropdown';
import Menu from '@arco-design/web-react/es/Menu';
import Button from '@arco-design/web-react/es/Button';
import Space from '@arco-design/web-react/es/Space';
import Divider from '@arco-design/web-react/es/Divider';
import Typography from '@arco-design/web-react/es/Typography';
import IconDown from '@arco-design/web-react/icon/react-icon/IconDown';

const roots=new WeakMap();
function AccountMenu({employee}){
 const name=employee.name.trim();
 const menu=<Menu onClickMenuItem={key=>key==='logout'?window.MASTER_DATA.logout():undefined}>
  <Menu.ItemGroup title={<Space direction="vertical" size="mini">
   <Typography.Text bold>{name}</Typography.Text>
   <Typography.Text type="secondary">{employee.role}</Typography.Text>
  </Space>}>
   <Divider style={{margin:'8px 0'}}/>
   <Menu.Item key="logout"><Typography.Text type="error">退出登录</Typography.Text></Menu.Item>
  </Menu.ItemGroup>
 </Menu>;
 return <Dropdown trigger="click" position="br" triggerProps={{escToClose:true,autoAlignPopupWidth:true}} droplist={menu}>
  <Button type="text" aria-label={`当前员工：${name} · ${employee.role}`}>
   <Space align="center"><Avatar size={24}>{Array.from(name)[0]}</Avatar><Typography.Text>{name} · {employee.role}</Typography.Text><IconDown/></Space>
  </Button>
 </Dropdown>;
}

window.TOPBAR_ACCOUNT={mount(host,employee){
 if(!host||!employee)return;
 let root=roots.get(host);
 if(!root){root=createRoot(host);roots.set(host,root)}
 root.render(<AccountMenu key={employee.id} employee={employee}/>);
}};
window.TOPBAR_ACCOUNT.mount(document.querySelector('.basic-account'),window.MASTER_DATA.current());
