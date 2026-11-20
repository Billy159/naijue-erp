/** Exact historical calendar decoding. Never supplies a timezone or rounds source precision. */
export interface ExcelTemporalEvidence {
  encoding: 'EXCEL_SERIAL'; dateSystem: '1900' | '1904'; cellType: 'NUMBER';
  sourceFileSha256: string; sheet: string; rowNo: string; field: string; raw: string;
  cellRef: string; styleIndex: number; numberFormat: string; evidenceRef: string;
}
export interface HistoryTemporalResult {
  raw: string; state: 'UNKNOWN' | 'EXACT' | 'DATE_ONLY' | 'POLICY_REQUIRED'; reason: string;
  date: string | null; local: string | null; instant: string | null;
  precision: string; encoding: string; evidenceRef: string | null;
}
const DAY_US = 86_400_000_000n;
function calendar(value: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}
export function mapHistoryTemporal(raw: string, kind: 'DATE' | 'DATETIME', evidence?: ExcelTemporalEvidence): HistoryTemporalResult {
  const base: HistoryTemporalResult = { raw, state:'POLICY_REQUIRED',reason:'UNRECOGNIZED_TEMPORAL_ENCODING',date:null,local:null,instant:null,precision:'UNKNOWN',encoding:'UNKNOWN',evidenceRef:evidence?.evidenceRef ?? null };
  if (raw === '') return {...base,state:'UNKNOWN',reason:'SOURCE_EMPTY'};
  if (calendar(raw)) return {...base,state:kind === 'DATE' ? 'EXACT':'DATE_ONLY',reason:kind === 'DATE' ? 'ISO_CALENDAR_DATE':'SOURCE_DATE_WITHOUT_TIME',date:raw,precision:'DAY',encoding:'ISO_DATE'};
  const timestamp = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/.exec(raw);
  if (timestamp) {
    const [, date, hour, minute, second, fraction = '', offset] = timestamp;
    if (!calendar(date!) || Number(hour)>23 || Number(minute)>59 || Number(second)>59
      || (offset && offset !== 'Z' && (Number(offset.slice(1,3))>14 || Number(offset.slice(4))>59 || (offset.slice(1,3)==='14' && offset.slice(4)!=='00')))) return {...base,reason:'INVALID_CALENDAR_OR_OFFSET'};
    if (kind === 'DATE') return {...base,reason:'DATE_FIELD_CONTAINS_TIME',encoding:'ISO_DATETIME',precision:'TIME'};
    if (fraction.length>6 && /[1-9]/.test(fraction.slice(6))) return {...base,reason:'SUBMICROSECOND_PRECISION_REQUIRES_DECISION',encoding:'ISO_DATETIME',precision:`FRACTION_${fraction.length}`};
    const local = `${date}T${hour}:${minute}:${second}${fraction ? `.${fraction.slice(0,6).replace(/0+$/,'')}`:''}`.replace(/\.$/,'');
    return {...base,state:'EXACT',reason:offset ? 'EXPLICIT_SOURCE_OFFSET':'LOCAL_TIME_NO_TIMEZONE',local,instant:offset ? `${local}${offset}`:null,encoding:'ISO_DATETIME',precision:fraction ? `FRACTION_${fraction.length}`:'SECOND'};
  }
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return base;
  if (!evidence || evidence.encoding!=='EXCEL_SERIAL' || evidence.cellType!=='NUMBER' || evidence.raw!==raw
    || !['1900','1904'].includes(evidence.dateSystem) || !evidence.evidenceRef || !/^[A-Z]+[1-9]\d*$/.test(evidence.cellRef)
    || !Number.isSafeInteger(evidence.styleIndex) || evidence.styleIndex<0 || !evidence.numberFormat) return {...base,reason:'EXCEL_CELL_ENCODING_EVIDENCE_REQUIRED',encoding:'NUMERIC_TEXT'};
  const [whole='', fraction=''] = raw.split('.');
  if (whole.length>7 || fraction.length>100) return {...base,reason:'SERIAL_RANGE_OR_PRECISION_LIMIT',encoding:'EXCEL_SERIAL'};
  const day = BigInt(whole), denominator = 10n**BigInt(fraction.length), numerator = BigInt(fraction || '0');
  if (evidence.dateSystem==='1900' && day===60n) return {...base,reason:'EXCEL_1900_FICTITIOUS_LEAP_DAY',encoding:'EXCEL_SERIAL'};
  if (kind==='DATE' && numerator!==0n) return {...base,reason:'DATE_SERIAL_HAS_TIME_FRACTION',encoding:'EXCEL_SERIAL'};
  const dateOnlyStyle = evidence.numberFormat === 'yyyy-mm-dd';
  if (!['yyyy-mm-dd','yyyy-mm-dd hh:mm:ss','yyyy-mm-dd h:mm:ss'].includes(evidence.numberFormat)) return {...base,reason:'NUMBER_FORMAT_POLICY_REQUIRED',encoding:'EXCEL_SERIAL'};
  if (kind==='DATETIME' && dateOnlyStyle && numerator!==0n) return {...base,reason:'DATE_ONLY_STYLE_HAS_TIME_FRACTION',encoding:'EXCEL_SERIAL'};
  const timeNumerator = numerator*DAY_US;
  if (timeNumerator%denominator!==0n) return {...base,reason:'SUBMICROSECOND_PRECISION_REQUIRES_DECISION',encoding:'EXCEL_SERIAL',precision:`SERIAL_FRACTION_${fraction.length}`};
  const epoch = evidence.dateSystem==='1900' ? Date.parse('1899-12-31T00:00:00Z'):Date.parse('1904-01-01T00:00:00Z');
  const offsetDays = day-(evidence.dateSystem==='1900' && day>60n ? 1n:0n);
  const civil = new Date(epoch+Number(offsetDays)*86400000);
  if (!Number.isFinite(civil.getTime())) return {...base,reason:'DATE_RANGE',encoding:'EXCEL_SERIAL'};
  const date=civil.toISOString().slice(0,10);
  if (!calendar(date)) return {...base,reason:'DATE_RANGE',encoding:'EXCEL_SERIAL'};
  if (kind==='DATE') return {...base,state:'EXACT',reason:'EVIDENCED_EXCEL_CALENDAR_DATE',date,precision:'DAY',encoding:'EXCEL_SERIAL'};
  if (dateOnlyStyle) return {...base,state:'DATE_ONLY',reason:'SOURCE_DATE_WITHOUT_TIME',date,precision:'DAY',encoding:'EXCEL_SERIAL'};
  const us=timeNumerator/denominator, hours=us/3_600_000_000n, minutes=us/60_000_000n%60n, seconds=us/1_000_000n%60n;
  const micros=(us%1_000_000n).toString().padStart(6,'0').replace(/0+$/,'');
  const local=`${date}T${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}${micros?`.${micros}`:''}`;
  return {...base,state:'EXACT',reason:'EVIDENCED_EXCEL_LOCAL_TIME_NO_TIMEZONE',local,precision:`SERIAL_FRACTION_${fraction.length}`,encoding:'EXCEL_SERIAL'};
}
