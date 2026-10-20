-- Required before creating the inventory view under the runtime owner.
GRANT USAGE ON SCHEMA __SOURCE__ TO __RUNTIME_OWNER__;
GRANT SELECT ON __SOURCE__.tplus_inventory_balance_source TO __RUNTIME_OWNER__;
