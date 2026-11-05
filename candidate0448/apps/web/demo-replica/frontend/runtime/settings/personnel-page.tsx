import { useState } from 'react';
import type { StaffSettingsProps } from '../../../../src/staff-settings/contracts.ts';
import { StaffRuntime } from './staff-page.tsx';
import { AccountsRuntime, type Props as AccountProps } from './accounts-page.tsx';
export function PersonnelRuntime(props:{staff:StaffSettingsProps;accounts:AccountProps;initialTab?:'staff'|'accounts'}) {
 const [tab,setTab]=useState(props.initialTab??'staff');
 const tabs=<nav className="bs-tabs" role="tablist" aria-label="员工与账号">{(['staff','accounts'] as const).map(id=><button type="button" role="tab" key={id} aria-selected={tab===id} onClick={()=>{ if(id===tab)return; const active=tab==='staff'?props.staff.workspace:props.accounts.workspace; if(active&&!active.canLeave()){active.getSnapshot()?.requestClose();return;} setTab(id); }}>{id==='staff'?'员工':'登录账号'}</button>)}</nav>;
 return tab==='staff'?<StaffRuntime {...props.staff} tabs={tabs}/>:<AccountsRuntime {...props.accounts} tabs={tabs}/>;
}
