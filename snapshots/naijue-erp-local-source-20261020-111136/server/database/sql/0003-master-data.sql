-- Version 0003: editable master data and immutable snapshots.
SET LOCAL ROLE __RUNTIME_OWNER__;

CREATE TABLE __RUNTIME__.master_data_entity (
    kind text NOT NULL CHECK (kind = ANY (ARRAY['halls'::text,'warehouses'::text,'parties'::text,'payments'::text,'fundAccounts'::text])),
    id text NOT NULL,
    body jsonb NOT NULL,
    source_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
    version integer NOT NULL CHECK (version > 0),
    updated_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind,id)
);
CREATE UNIQUE INDEX master_data_entity_code_key ON __RUNTIME__.master_data_entity(kind,lower(btrim(body->>'code')))
  WHERE coalesce(btrim(body->>'code'),'') <> '';

CREATE TABLE __RUNTIME__.master_data_history (
    kind text NOT NULL,
    id text NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    request_key text NOT NULL,
    operation text NOT NULL CHECK (operation = ANY (ARRAY['CREATE'::text,'UPDATE'::text,'ENABLE'::text,'DISABLE'::text,'MIGRATED'::text])),
    actor_id text,
    actor_name text NOT NULL,
    before_body jsonb,
    body jsonb NOT NULL,
    before_source_facts jsonb,
    source_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind,id,version),
    UNIQUE (actor_id,request_key)
);
CREATE INDEX master_data_history_time_idx ON __RUNTIME__.master_data_history(created_at DESC,id);

CREATE TABLE __RUNTIME__.master_data_state (
    singleton boolean PRIMARY KEY CHECK (singleton),
    revision bigint NOT NULL CHECK (revision >= 0)
);
INSERT INTO __RUNTIME__.master_data_state(singleton,revision) VALUES(true,0);

CREATE TRIGGER master_data_history_immutable BEFORE UPDATE OR DELETE ON __RUNTIME__.master_data_history
  FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
CREATE TRIGGER master_data_history_no_truncate BEFORE TRUNCATE ON __RUNTIME__.master_data_history
  FOR EACH STATEMENT EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
REVOKE UPDATE,DELETE,TRUNCATE ON __RUNTIME__.master_data_history FROM PUBLIC,__APP__;
GRANT SELECT,INSERT ON __RUNTIME__.master_data_entity,__RUNTIME__.master_data_history,__RUNTIME__.master_data_state TO __APP__;
GRANT UPDATE ON __RUNTIME__.master_data_entity,__RUNTIME__.master_data_state TO __APP__;

-- Carry forward old service-side edits. Browser-local values are reviewed separately by an administrator.
WITH latest AS (
  SELECT batch_id FROM __SOURCE__.tplus_import_run WHERE status='COMMITTED' ORDER BY committed_at DESC NULLS LAST,started_at DESC LIMIT 1
), old AS (
  SELECT o.*,w.code AS warehouse_code,w.type AS warehouse_type,
    a.source_code AS account_code,a.account_number,a.bank,a.account_type,a.primary_payment_method_id,
    a.hall_ids,a.source_department_id,a.source_payload AS account_payload
  FROM __RUNTIME__.master_reference_overlay o
  LEFT JOIN __SOURCE__.warehouse w ON o.kind='warehouses' AND w.id=o.id
  LEFT JOIN latest ON true
  LEFT JOIN __SOURCE__.tplus_fund_account a ON o.kind='fundAccounts' AND a.id=o.id AND a.batch_id=latest.batch_id
), relations AS (
  SELECT old.kind,old.id,array_agg(DISTINCT h.id::text ORDER BY h.id::text) AS hall_ids
  FROM old JOIN latest ON true JOIN __SOURCE__.tplus_hall h ON h.batch_id=latest.batch_id
  CROSS JOIN LATERAL unnest(h.warehouse_ids) wh(id)
  WHERE old.kind='warehouses' AND wh.id=old.id
  GROUP BY old.kind,old.id
)
INSERT INTO __RUNTIME__.master_data_entity(kind,id,body,source_facts,version,updated_by,created_at,updated_at)
SELECT CASE old.kind WHEN 'payments' THEN 'payments' ELSE old.kind END,old.id::text,
  CASE old.kind
    WHEN 'warehouses' THEN jsonb_build_object('code',coalesce(old.warehouse_code,''),'name',old.name,'enabled',old.enabled,
      'type',coalesce(old.warehouse_type,''),'hallRelations',to_jsonb(coalesce(relations.hall_ids,ARRAY[]::text[])),
      'sourceOwnershipUnknown',coalesce(cardinality(relations.hall_ids)=0,true))
    WHEN 'payments' THEN jsonb_build_object('code',coalesce((SELECT source_code FROM __SOURCE__.tplus_payment_method p JOIN latest ON p.batch_id=latest.batch_id WHERE p.id=old.id LIMIT 1),''),'name',old.name,'enabled',old.enabled)
    ELSE jsonb_build_object('code',coalesce(old.account_code,''),'name',old.name,'enabled',old.enabled,
      'primaryPaymentMethodId',coalesce(coalesce(old.method_id,old.primary_payment_method_id)::text,''),'type',coalesce(old.account_type,''),
      'bank',coalesce(old.bank,''),'accountNumber',coalesce(old.account_number,''),'department',coalesce(old.source_department_id::text,''),
      'sourceFacts',coalesce(old.account_payload,'{}'::jsonb)||jsonb_build_object('hallIds',coalesce(to_jsonb(old.hall_ids),'[]'::jsonb)))
  END,
  CASE WHEN old.kind='fundAccounts' THEN coalesce(old.account_payload,'{}'::jsonb)||jsonb_build_object('hallIds',coalesce(to_jsonb(old.hall_ids),'[]'::jsonb)) ELSE '{}'::jsonb END,
  1,'legacy-overlay-migration',old.updated_at,old.updated_at
FROM old LEFT JOIN relations ON old.kind=relations.kind AND old.id=relations.id
ON CONFLICT(kind,id) DO NOTHING;
INSERT INTO __RUNTIME__.master_data_history(kind,id,version,request_key,operation,actor_name,before_body,body,source_facts,created_at)
SELECT kind,id,version,'0003:'||kind||':'||id,'MIGRATED','旧服务端覆盖迁移',NULL,body,source_facts,created_at
FROM __RUNTIME__.master_data_entity WHERE updated_by='legacy-overlay-migration'
ON CONFLICT(kind,id,version) DO NOTHING;
RESET ROLE;
