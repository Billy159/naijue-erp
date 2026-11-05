// The pre-Node launcher validates this entire tree before loading this module.
import {installSalesModuleBoundary} from './whole-sales-module-boundary.mjs';
import {salesInstallLayout} from './whole-sales-platform-layout.mjs';
installSalesModuleBoundary(salesInstallLayout().root);
