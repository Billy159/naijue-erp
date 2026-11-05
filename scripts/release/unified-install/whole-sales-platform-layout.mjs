/** Fixed native deployment contracts; callers cannot override paths through config. */
export function salesInstallLayout(platform=process.platform){
 if(platform==='linux')return Object.freeze({root:'/opt/naijue-erp/whole-sales-v1',node:'/usr/bin/node',psql:'/usr/lib/postgresql/17/bin/psql',etc:'/etc/naijue-erp',config:'/etc/naijue-erp/whole-sales-install-config-v1.json'});
 if(platform==='darwin')return Object.freeze({root:'/Library/Application Support/NaijueERP/whole-sales-v1',node:'/usr/local/bin/node',psql:'/Library/PostgreSQL/17/bin/psql',etc:'/private/etc/naijue-erp',config:'/private/etc/naijue-erp/whole-sales-install-config-v1.json'});
 throw Error('SALES_INSTALL_PLATFORM_UNSUPPORTED');
}
