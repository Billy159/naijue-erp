"""Initialize the folder contract from the user's accepted current source once."""
from pathlib import Path
import json

from receive import ROOT, HERE, headers, inventory, write_json


def main():
    target = HERE / 'input-contract.json'
    if target.exists():
        raise ValueError('已有接收合同，不能用新输入自动覆盖')
    source = ROOT / 'inputs/tplus-current'
    previous = json.loads((ROOT / 'data-cleaning/cleaning/TPLUS_INPUT_STRUCTURE.json').read_text())
    definitions = {}
    for row in previous['sheets']:
        rows = [row['headerRow']] if row['headerRow'] else []
        if row['file'] == '库存状况表.xlsx':
            rows = [7, 8]
        definitions.setdefault(row['file'], []).append({'sheet': row['sheet'], 'headerRows': rows})
    definitions['调拨单导出.xlsx'] = [{'sheet': '调拨单', 'headerRows': [1]}]
    files, skipped = inventory(source)
    result = {'version': 'TPLUS-CURRENT-FOLDER-STRUCTURE-20261001-v1',
              'referenceInput': 'inputs/tplus-current',
              'requiredWorkbookPolicy': '本批全部工作簿作为完整同格式输入要求；打印模板为参考文件，允许缺少但记录',
              'files': []}
    for item in files:
        rel = item['path']
        kind = 'workbook' if rel.endswith('.xlsx') else 'reference'
        entry = {'path': rel, 'kind': kind, 'required': kind == 'workbook', 'referenceSha256': item['sha256']}
        if kind == 'workbook':
            if rel not in definitions:
                raise ValueError('工作簿未有明确表头定义：' + rel)
            entry['sheets'] = definitions[rel]
            entry['structure'] = headers(source / rel, definitions[rel])
        result['files'].append(entry)
    write_json(target, result)
    print(json.dumps({'contract': str(target), 'files': len(files), 'ignoredTemporaryFiles': len(skipped)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
