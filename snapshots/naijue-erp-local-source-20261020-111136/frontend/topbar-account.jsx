/* Shared account menu. Password changes use the authenticated service, never a client-selected account. */
import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Avatar, Button, Divider, Dropdown, Input, Menu, Modal, Space, Typography} from '@arco-design/web-react';
import {IconDown} from '@arco-design/web-react/icon';

const roots=new WeakMap();
const empty=()=>({currentPassword:'',newPassword:'',confirmation:''});
function AccountMenu({employee}){
 const name=employee.name.trim();
 const trigger=useRef(null), submitting=useRef(false);
 const sessionGeneration=useRef(0);
 const [menuVisible,setMenuVisible]=useState(false);
 const [visible,setVisible]=useState(false);
 const [fields,setFields]=useState(empty);
 const [errors,setErrors]=useState({});
 useEffect(()=>{
  const reset=()=>{
   sessionGeneration.current++;
   setMenuVisible(false);setVisible(false);setFields(empty());setErrors({});
  };
  window.addEventListener('erp-user-cleared',reset);
  return ()=>window.removeEventListener('erp-user-cleared',reset);
 },[]);
 const setField=(key,value)=>{setFields(previous=>({...previous,[key]:value}));setErrors(previous=>({...previous,[key]:undefined,form:undefined}))};
 const clear=()=>{setFields(empty());setErrors({})};
 const close=()=>{if(submitting.current)return;setVisible(false);clear();requestAnimationFrame(()=>trigger.current?.focus())};
 const submit=async()=>{
  if(submitting.current)return;
  const next={};
  if(!fields.currentPassword)next.currentPassword='请输入原密码';
  if(!fields.newPassword)next.newPassword='请输入新密码';
  else if(fields.newPassword.length<8 || new TextEncoder().encode(fields.newPassword).length>1024)next.newPassword='新密码至少 8 位且不超过 1024 字节';
  if(!fields.confirmation)next.confirmation='请再次输入新密码';
  else if(fields.confirmation!==fields.newPassword)next.confirmation='两次新密码不一致';
  if(Object.keys(next).length){setErrors(next);return}
  submitting.current=true;
  const generation=sessionGeneration.current;
  setErrors({});
  try{
   const master=window.MASTER_DATA;
   if(!master.serverAuth)throw Error('正式改密服务暂不可用');
   await master.serverAuth.changeOwnPassword(fields.currentPassword,fields.newPassword);
   if(generation!==sessionGeneration.current)return;
   setVisible(false);clear();
   master.expire('密码已修改，请使用新密码重新登录');
  }catch(error){
   if(generation!==sessionGeneration.current)return;
   if(error.code==='AUTH'){
    setVisible(false);clear();window.MASTER_DATA.expire('登录已失效，请重新登录');
   }else if(error.code==='INVALID_CURRENT_PASSWORD'){
    setErrors({currentPassword:'原密码不正确'});
   }else if(error.code==='PASSWORD_POLICY'||error.code==='PASSWORD_REUSED'){
    setErrors({newPassword:error.message});
   }else if(error.code==='CONNECTION'||error.code==='PENDING_VERIFICATION'){
    setErrors({form:'修改结果未确认，请恢复连接后使用新密码验证登录；请勿立即重复提交。'});
   }else setErrors({form:error.message||'修改未完成，请稍后重试'});
  }finally{submitting.current=false}
 };
 const menu=<Menu onClickMenuItem={key=>{
  setMenuVisible(false);
  if(key==='password'){clear();setVisible(true)}
  else if(key==='logout')window.MASTER_DATA.logout();
 }}>
  <Menu.ItemGroup title={<Space direction="vertical" size="mini">
   <Typography.Text bold>{name}</Typography.Text>
   <Typography.Text type="secondary">{employee.role}</Typography.Text>
  </Space>}>
   <Divider style={{margin:'8px 0'}}/>
   <Menu.Item key="password">修改密码</Menu.Item>
   <Menu.Item key="logout"><Typography.Text type="error">退出登录</Typography.Text></Menu.Item>
  </Menu.ItemGroup>
 </Menu>;
 const field=(key,label,autoComplete,hint)=>{
  const error=errors[key];
  return <div className="account-password-field" key={key}>
   <label htmlFor={'account-'+key}>{label}</label>
   <Input.Password id={'account-'+key} data-account-password={key} value={fields[key]}
    onChange={value=>setField(key,value)} placeholder={'请输入'+label} autoComplete={autoComplete}
    visibilityToggle disabled={submitting.current} status={error?'error':undefined}
    aria-invalid={!!error} aria-describedby={error?'account-'+key+'-error':hint?'account-'+key+'-hint':undefined}/>
   {error?<span id={'account-'+key+'-error'} className="account-password-error" role="alert">{error}</span>
    :hint?<span id={'account-'+key+'-hint'} className="account-password-hint">{hint}</span>:null}
  </div>;
 };
 return <>
  <Dropdown trigger="click" position="br" triggerProps={{escToClose:true,autoAlignPopupWidth:true}}
   popupVisible={menuVisible} onVisibleChange={setMenuVisible} droplist={menu}>
   <Button ref={trigger} type="text" aria-label={`当前员工：${name} · ${employee.role}`}>
    <Space align="center"><Avatar size={24}>{Array.from(name)[0]}</Avatar><Typography.Text>{name} · {employee.role}</Typography.Text><IconDown/></Space>
   </Button>
  </Dropdown>
  <Modal className="account-password-modal iw-arco-modal iw-arco-controls" visible={visible} title="修改密码"
   onCancel={close} onOk={submit} confirmLoading={submitting.current}
   okText={submitting.current?'修改中…':'确认修改'} cancelText="取消" closable={!submitting.current} escToExit={!submitting.current}
   cancelButtonProps={{disabled:submitting.current}} maskClosable={false} unmountOnExit
   afterOpen={()=>document.querySelector('.account-password-modal input[data-account-password="currentPassword"]')?.focus()}>
   <div className="account-password-fields">
    {field('currentPassword','原密码','current-password')}
    {field('newPassword','新密码','new-password','至少 8 位')}
    {field('confirmation','确认新密码','new-password')}
   </div>
   {errors.form&&<p className="account-password-error" role="alert">{errors.form}</p>}
  </Modal>
 </>;
}

window.TOPBAR_ACCOUNT={mount(host,employee){
 if(!host||!employee)return;
 let root=roots.get(host);
 if(!root){root=createRoot(host);roots.set(host,root)}
 root.render(<AccountMenu key={employee.id} employee={employee}/>);
}};
window.TOPBAR_ACCOUNT.mount(document.querySelector('.basic-account'),window.MASTER_DATA.current());
