import {createHash, randomUUID} from 'node:crypto';
import type {ActionLock} from '../../database/session.js';
import type {AuthorizedContext} from '../../security/service.js';
import {identifier, invalid, object, SecurityError} from '../../security/errors.js';
import {canonicalJson, CommandError, executeIdempotent} from '../idempotency/index.js';
import {DecimalError, formatScaled, parseBusinessDay, parseScaled} from '../transactions/decimal.js';
import {readInventoryBalance} from '../transactions/inventory.js';
import {updateProjection} from '../transactions/command.js';
import {inventoryFilters, queryInventory} from './query.js';

export interface CorrectionInput {
  readonly warehouseId: string; readonly skuId: string; readonly unit: string; readonly actualQuantity: string; readonly reason: string;
}
export interface CorrectionConfirm extends CorrectionInput {
  readonly correctionId: string; readonly requestKey: string; readonly expectedVersion: 0; readonly expectedBalanceVersion: string;
}
function optionalCorrectionText(value:unknown,limit:number):string|null{
  if(value===undefined)return null;
  if(typeof value!=='string'||!value.trim()||value.length>limit||value.includes('\0'))return invalid();
  return value.trim();
}
function optionalCorrectionDay(value:unknown):string|null{
  const result=optionalCorrectionText(value,10);
  if(result===null)return null;
  try{parseBusinessDay(result);}catch{return invalid();}
  return result;
}
function quantity(value: unknown): string {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d{1,4})?$/.test(value)) return invalid();
  try {return formatScaled(parseScaled(value,4,false),4);} catch (error) {
    if (error instanceof DecimalError) throw new SecurityError('VALIDATION',400,'实际数量格式、精度或范围无效');
    throw error;
  }
}
export function correctionInput(value: unknown, confirm = false): CorrectionInput | CorrectionConfirm {
  const body = object(value), allowed = ['warehouseId','skuId','unit','actualQuantity','reason',...(confirm ? ['correctionId','requestKey','expectedVersion','expectedBalanceVersion'] : [])];
  if (Object.keys(body).some(key => !allowed.includes(key))) return invalid();
  const reason = body['reason'];
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000 || reason.includes('\0')) throw new SecurityError('VALIDATION',400,'请填写校正原因（最多1000字）');
  const unit=body['unit'];
  if(typeof unit!=='string'||!unit.trim()||unit.length>64||unit.includes('\0'))throw new SecurityError('VALIDATION',400,'请选择已核实的计量单位');
  const input: CorrectionInput = {warehouseId:identifier(body['warehouseId'],true),skuId:identifier(body['skuId'],true),unit:unit.trim(),actualQuantity:quantity(body['actualQuantity']),reason:reason.trim()};
  if (!confirm) return input;
  if (body['expectedVersion'] !== 0 || typeof body['requestKey'] !== 'string' || !body['requestKey'].trim()
    || body['requestKey'].length > 200 || body['requestKey'].includes('\0')
    || typeof body['expectedBalanceVersion'] !== 'string' || !/^[a-f0-9]{64}$/.test(body['expectedBalanceVersion'])) return invalid();
  return {...input,correctionId:identifier(body['correctionId'],true),requestKey:body['requestKey'],expectedVersion:0,expectedBalanceVersion:body['expectedBalanceVersion']};
}

interface SkuFacts {
  productId: string; productCode: string; productName: string; unit: string | null; scale: number | null;
  enabled: boolean; productVersion: number; skuVersion: number; original: Record<string,unknown> | null; origin: string;
}
async function point(context: AuthorizedContext, input: CorrectionInput): Promise<Record<string,unknown>> {
  const {session,repo} = context, r = repo.runtime, s = repo.source;
  const sku = (await session.query<SkuFacts>(`SELECT v.product_id "productId",coalesce(po.code,p.code) "productCode",
      coalesce(pp.body->>'name',po.body->>'name',p.name) "productName",coalesce(u.name,po.body->>'unit') unit,u.quantity_scale scale,
      v.enabled AND coalesce((pp.body->>'enabled')::boolean,(po.body->>'enabled')::boolean,p.enabled,true)
        AND NOT coalesce(po.deleted,false) AND NOT coalesce(pp.body->'disabledSkuIds' ? v.id::text,false) enabled,
      coalesce(pp.version,p.version,1) "productVersion",v.version "skuVersion",v.origin,
      CASE WHEN v.origin='SOURCE' THEN coalesce((SELECT jsonb_object_agg(d.code,jsonb_build_object('id',sv.id,'code',sv.code,'name',sv.name))
        FROM ${s}.variant_option o JOIN ${s}.spec_dimension d ON d.id=o.dimension_id JOIN ${s}.spec_value sv ON sv.id=o.spec_value_id WHERE o.variant_id=v.id),'{}'::jsonb)
        || jsonb_build_object('FIT',jsonb_build_object('id',p.fit_id::text,'name',fit.name))
      ELSE (SELECT jsonb_build_object('SIZE',jsonb_build_object('id',size_id,'code',size_code,'name',size_name),
        'COLOR',jsonb_build_object('id',color_id,'name',coalesce(cm.body->>'name',c.name))) FROM ${r}.variant_overlay ov
        LEFT JOIN ${s}.spec_value c ON c.id=ov.color_id LEFT JOIN ${r}.product_master_overlay cm ON cm.kind='colors' AND cm.id=ov.color_id::text WHERE ov.id=v.id)
        || jsonb_build_object('FIT',jsonb_build_object('id',coalesce(p.fit_id::text,po.body->>'fitId'),
          'name',coalesce(fit.name,nullif(po.body->>'fitName',''),coalesce(po.body->>'fitId','A')||'版'))) END original
      FROM (SELECT id,product_id,enabled,version,'SOURCE'::text origin FROM ${s}.variant
        UNION ALL SELECT id,product_id,true,1,'RUNTIME' FROM ${r}.variant_overlay ov WHERE NOT EXISTS(SELECT 1 FROM ${s}.variant src WHERE src.id=ov.id)) v
      LEFT JOIN ${s}.product p ON p.id=v.product_id LEFT JOIN ${s}.fit fit ON fit.id=p.fit_id LEFT JOIN ${r}.product_overlay po ON po.id=v.product_id
      LEFT JOIN ${s}.unit u ON u.id=coalesce(p.unit_id,(po.body->>'unitId')::uuid)
      LEFT JOIN ${r}.product_profile_overlay pp ON pp.product_id=v.product_id WHERE v.id=$1::uuid`,[input.skuId])).rows[0];
  if (!sku) throw new SecurityError('REFERENCE_CONFLICT',409,'原商品规格不存在，不能使用展示汇总身份校正');
  if (!sku.enabled) throw new SecurityError('REFERENCE_CONFLICT',409,'商品或规格已停用，不能新增校正');
  const unitFacts=(await session.query<{scale:number|null}>(`SELECT quantity_scale scale FROM ${s}.unit WHERE name=$1`,[input.unit])).rows;
  const scale=input.unit==='件'&&unitFacts.length===1?0:unitFacts.length===1?unitFacts[0]!.scale:null;
  if (scale === null || !Number.isInteger(scale) || scale < 0 || scale > 4) throw new SecurityError('REFERENCE_CONFLICT',409,'计量单位或精度尚未核实');
  const actual = parseScaled(input.actualQuantity,4,false);
  if (actual % 10n ** BigInt(4-scale) !== 0n) throw new SecurityError('VALIDATION',400,'实际数量不符合商品计量精度');
  const inventory = await queryInventory(context,inventoryFilters({warehouseId:input.warehouseId,skuId:input.skuId,unit:input.unit,size:1}));
  const cell = (inventory['items'] as Record<string,unknown>[])[0];
  if (!cell || cell['unitConflict'] || cell['unit'] !== input.unit || inventory['reconciled'] !== true) throw new SecurityError('INVENTORY_BASIS_CONFLICT',409,'此仓库、原规格和单位的库存依据尚未核实');
  const bookQuantity = quantity(await readInventoryBalance(session,r,input.warehouseId,input.skuId,input.unit));
  let delta: string;
  try {delta = formatScaled(actual-parseScaled(bookQuantity,4,false),4);} catch {throw new SecurityError('VALIDATION',400,'校正差额超出数量存储范围');}
  const evidence = (await session.query<{facts:Record<string,unknown>}>(`SELECT jsonb_build_object(
      'openingRuns',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sha256',source_sha256) ORDER BY id),'[]'::jsonb) FROM ${r}.inventory_opening_run WHERE active),
      'movementsDigest',(SELECT md5(coalesce(string_agg(posting_id::text||':'||line_index::text||':'||quantity::text,'|' ORDER BY posting_id,line_index),'')) FROM ${r}.movement WHERE warehouse_id=$1::uuid AND sku_id=$2::uuid),
      'confirmationsDigest',(SELECT md5(coalesce(string_agg(d.id::text||':'||d.version::text,'|' ORDER BY d.id),'')) FROM ${r}.document d JOIN ${r}.revision v ON v.document_id=d.id AND v.revision=d.current_revision
        WHERE d.document_type='CORRECTION' AND v.body #>> '{correction,warehouseId}'=$1::text AND v.body #>> '{correction,skuId}'=$2::text AND v.body #>> '{correction,unit}'=$3::text),
      'historyRuns',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'manifestSha256',manifest_sha256) ORDER BY id),'[]'::jsonb) FROM ${r}.inventory_history_run),
      'historyMovementsDigest',(SELECT md5(coalesce(string_agg(run_id||':'||identity||':'||leg_index::text||':'||quantity::text,'|' ORDER BY run_id,identity,leg_index),''))
        FROM ${r}.inventory_history_movement WHERE warehouse_id=$1::uuid AND sku_id=$2::uuid AND unit=$3),
      'historyChanges',(SELECT coalesce(jsonb_agg(jsonb_build_object('runId',c.run_id,'eventId',c.event_id,'ordinal',c.ordinal,'payloadSha256',c.payload_sha256) ORDER BY c.run_id,c.event_id,c.ordinal),'[]'::jsonb)
        FROM ${r}.inventory_history_change c WHERE EXISTS(SELECT 1 FROM ${r}.inventory_history_event_leg l WHERE l.run_id=c.run_id AND l.event_id=c.event_id AND l.warehouse_id=$1::uuid AND l.sku_id=$2::uuid AND l.unit=$3)
          OR EXISTS(SELECT 1 FROM ${r}.inventory_history_movement m WHERE m.run_id=c.run_id AND m.identity='change:'||c.request_key AND m.warehouse_id=$1::uuid AND m.sku_id=$2::uuid AND m.unit=$3)),
      'basisRecords',CASE WHEN EXISTS(SELECT 1 FROM ${r}.inventory_opening_run WHERE active) THEN
        (SELECT coalesce(jsonb_agg(jsonb_build_object('runId',c.run_id,'quantity',c.quantity::text,'unit',c.unit,'sourceCell',c.source_cell,'sourceRecord',c.source_record) ORDER BY c.run_id),'[]'::jsonb)
          FROM ${r}.inventory_opening_cell c JOIN ${r}.inventory_opening_run run ON run.id=c.run_id AND run.active WHERE c.warehouse_id=$1::uuid AND c.sku_id=$2::uuid AND c.unit=$3)
      ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('batchId',batch_id,'sourceId',source_id,'quantity',quantity::text,'unit',unit,'cutoff',cutoff_source_date,'components',components,'sourceRecord',source_payload) ORDER BY batch_id,source_id),'[]'::jsonb)
        FROM ${s}.tplus_inventory_balance_source WHERE warehouse_id=$1::uuid AND variant_id=$2::uuid AND unit=$3) END) facts`,[input.warehouseId,input.skuId,input.unit])).rows[0]?.facts;
  if (!evidence) throw new SecurityError('INVENTORY_READ_FAILED',503,'库存版本无法回读');
  const basis = cell['basis'];
  const balanceVersion = createHash('sha256').update(canonicalJson({warehouseId:input.warehouseId,skuId:input.skuId,unit:input.unit,quantityScale:scale,bookQuantity,sku,
    warehouseVersion:cell?.['versions'] ?? null,basis,evidence})).digest('hex');
  return {warehouseId:input.warehouseId,skuId:input.skuId,actualQuantity:input.actualQuantity,reason:input.reason,bookQuantity,delta,balanceVersion,unit:input.unit,quantityScale:scale,productId:sku.productId,productCode:sku.productCode,productName:sku.productName,
    original:sku.original,versions:{product:sku.productVersion,sku:sku.skuVersion},source:{kind:'RUNTIME_CORRECTION',skuOrigin:sku.origin,basis,...evidence},requiresConfirmation:true};
}

export async function previewCorrection(context: AuthorizedContext, input: CorrectionInput): Promise<Record<string,unknown>> {
  return point(context,input);
}
export function correctionLocks(input: CorrectionConfirm): readonly ActionLock[] {
  return [{scope:'idempotency',key:`correction.confirm:${input.requestKey}`},{scope:'document',key:input.correctionId},
    {scope:'inventory',key:'posting-ledger'},{scope:'inventory',key:`${input.warehouseId}:${input.skuId}:${input.unit}`}];
}
export async function correctionDetail(context: AuthorizedContext, id: string): Promise<Record<string,unknown>> {
  const {session,repo} = context;
  const row = (await session.query<{data:Record<string,unknown>}>(`SELECT jsonb_build_object('correctionId',d.id,'documentType',d.document_type,'number',d.number,
      'status','CONFIRMED','version',d.version,'revision',d.current_revision,'businessDay',d.business_day,'createdAt',d.created_at,
      'actorId',v.actor_id,'postingId',d.active_effect_identity,'correction',v.body->'correction','source',v.body->'source','body',v.body) data
      FROM ${repo.runtime}.document d JOIN ${repo.runtime}.revision v ON v.document_id=d.id AND v.revision=d.current_revision
      WHERE d.id=$1::uuid AND d.document_type='CORRECTION'`,[identifier(id,true)])).rows[0]?.data;
  if (!row) throw new SecurityError('NOT_FOUND',404,'校正记录不存在');
  return row;
}
export async function confirmCorrection(context: AuthorizedContext, input: CorrectionConfirm): Promise<Record<string,unknown>> {
  const {session,repo,actor} = context, r = repo.runtime;
  try {
    return await executeIdempotent(session,{actorId:actor.id,commandScope:'correction.confirm',idempotencyKey:input.requestKey,runtimeSchema:r,
      payload:input,execute:async () => {
        if ((await session.query<{found:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${r}.document WHERE id=$1::uuid) found`,[input.correctionId])).rows[0]?.found) throw new SecurityError('VERSION_CONFLICT',409,'校正编号已使用，请核对原记录');
        const current = await point(context,input);
        if (current['balanceVersion'] !== input.expectedBalanceVersion) throw new SecurityError('BALANCE_CONFLICT',409,'账面或版本已变化，请核对最新差额后再次确认',current);
        const clock = (await session.query<{day:string;time:Date}>(`SELECT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS "day",now() AS "time"`)).rows[0]!;
        const postingId = randomUUID(), correction = {...input,bookQuantity:current['bookQuantity'],delta:current['delta'],balanceVersion:current['balanceVersion'],
          unit:current['unit'],quantityScale:current['quantityScale'],productId:current['productId'],productCode:current['productCode'],productName:current['productName'],original:current['original'],
          actorId:actor.id,confirmedAt:clock.time.toISOString()};
        const body = {header:{business_date:clock.day,source_warehouse_id:input.warehouseId},correction,source:current['source'],lines:[]};
        await session.query(`INSERT INTO ${r}.document(id,document_type,number,source_identity,status,baseline_was_included,current_effect_active,active_effect_identity,active_effect_revision,current_revision,version,business_day)
          VALUES($1::uuid,'CORRECTION',$2,$3::jsonb,'APPROVED',false,true,$4,1,1,1,$5::date) RETURNING id`,
          [input.correctionId,`KZ-${input.correctionId}`,JSON.stringify({kind:'RUNTIME_CORRECTION',warehouseId:input.warehouseId,skuId:input.skuId,unit:input.unit}),postingId,clock.day]);
        await session.query(`INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id) VALUES($1::uuid,1,false,$2::jsonb,$3) RETURNING document_id`,[input.correctionId,JSON.stringify(body),actor.id]);
        await session.query(`INSERT INTO ${r}.posting(id,document_id,revision,reason,actor_id,request_key) VALUES($1::uuid,$2::uuid,1,'INVENTORY_CORRECTION',$3,$4) RETURNING id`,[postingId,input.correctionId,actor.id,input.requestKey]);
        const delta = parseScaled(current['delta'],4,false);
        // A zero difference has a confirmation/audit record, never a fabricated movement.
        await updateProjection(session,r,postingId,delta === 0n ? [] : [{index:0,warehouse:input.warehouseId,sku:input.skuId,unit:input.unit,quantity:delta}]);
        if (quantity(await readInventoryBalance(session,r,input.warehouseId,input.skuId,input.unit)) !== input.actualQuantity) throw new SecurityError('ROLLED_BACK',409,'校正后余额无法核对，本次已回滚');
        await session.query(`INSERT INTO ${r}.version_history(document_id,version,operation,revision,actor_id,request_key) VALUES($1::uuid,1,'confirm',1,$2,$3) RETURNING version`,[input.correctionId,actor.id,input.requestKey]);
        await session.query(`UPDATE ${r}.idempotency_request SET document_id=$1::uuid,expected_version=0,operation='correction.confirm',committed_state='COMMITTED'
          WHERE actor_id=$2 AND command_scope='correction.confirm' AND idempotency_key=$3 RETURNING id`,[input.correctionId,actor.id,input.requestKey]);
        return correctionDetail(context,input.correctionId);
      }});
  } catch (error) {
    if (error instanceof CommandError) throw new SecurityError(error.code === 'IDEMPOTENCY_CONFLICT' ? 'IDEMPOTENCY_CONFLICT' : 'ROLLED_BACK',409,
      error.code === 'IDEMPOTENCY_CONFLICT' ? '同一请求编号已绑定不同内容' : '校正请求已回滚，请核对原请求');
    throw error;
  }
}

export async function listCorrections(context: AuthorizedContext, query: unknown): Promise<Record<string,unknown>> {
  const values = object(query);
  if (Object.keys(values).some(key => !['warehouseId','skuId','unit','page','size','start','end','q'].includes(key))) return invalid();
  const filters = inventoryFilters(values),start=optionalCorrectionDay(values['start']),end=optionalCorrectionDay(values['end']),queryText=optionalCorrectionText(values['q'],128), {session,repo} = context;
  if(start&&end&&start>end)return invalid();
  const result = (await session.query<{data:Record<string,unknown>}>(`WITH matches AS (SELECT d.id,d.number,d.version,d.created_at,d.business_day,v.actor_id,v.body->'correction' correction
      FROM ${repo.runtime}.document d JOIN ${repo.runtime}.revision v ON v.document_id=d.id AND v.revision=d.current_revision WHERE d.document_type='CORRECTION'
        AND ($1::uuid IS NULL OR v.body #>> '{correction,warehouseId}'=$1::text) AND ($2::uuid IS NULL OR v.body #>> '{correction,skuId}'=$2::text)
        AND ($5::text IS NULL OR v.body #>> '{correction,unit}'=$5)
        AND ($6::date IS NULL OR d.business_day >= $6::date) AND ($7::date IS NULL OR d.business_day <= $7::date)
        AND ($8::text IS NULL OR d.number ILIKE '%'||$8||'%' OR d.id::text ILIKE '%'||$8||'%')),
      slice AS (SELECT jsonb_build_object('correctionId',id,'number',number,'version',version,'status','CONFIRMED','createdAt',created_at,'businessDay',business_day,'actorId',actor_id,'correction',correction) item FROM matches ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4)
      SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(item) FROM slice),'[]'::jsonb),'total',(SELECT count(*)::int FROM matches),'page',$4::int/$3::int+1,'size',$3::int) data`,
      [filters.warehouseId,filters.skuId,filters.size,(filters.page-1)*filters.size,filters.unit,start,end,queryText])).rows[0]?.data;
  if (!result) throw new SecurityError('INVENTORY_READ_FAILED',503,'校正记录无法回读');
  return result;
}
