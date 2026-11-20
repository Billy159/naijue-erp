import { useRuntimeTabs } from '../common/tabs.tsx';
import { useState } from 'react';
import type { StaffSettingsProps } from '../../../../src/staff-settings/contracts.ts';
import { StaffRuntime } from './staff-page.tsx';
import { AccountsRuntime, type Props as AccountProps } from './accounts-page.tsx';
export function PersonnelRuntime(props:{staff:StaffSettingsProps;accounts:AccountProps;initialTab?:'staff'|'accounts'}) {
 const [tab,setTab]=useState(props.initialTab??'staff');
 const tabs=useRuntimeTabs({ label: '员工与账号', items: (['staff', 'accounts'] as const).map(key => [key, key === 'staff' ? '员工' : '登录账号'] as const), selected: tab, onSelect: id => { if(id===tab)return; const active=tab==='staff'?props.staff.workspace:props.accounts.workspace; if(active&&!active.canLeave()){active.getSnapshot()?.requestClose();return;} setTab(id); }, className: 'bs-tabs' });
 return tab==='staff'?<StaffRuntime {...props.staff} tabs={tabs}/>:<AccountsRuntime {...props.accounts} tabs={tabs}/>;
}
