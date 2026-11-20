import type { StoreSettingsPageProps } from '../stores/contracts.ts';
import { StoreSettingsPage } from '../stores/stores-page.tsx';
export function WarehousesPage(props: StoreSettingsPageProps) { return <StoreSettingsPage {...props} kind="warehouses" />; }
