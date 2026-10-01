"""Filesystem integration checks for batch identity and immutable receipts."""
import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from receive import HERE, ROOT, digest, receive


class ReceiptSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='tplus-intake-test-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.source = self.base / 'input'
        self.project = self.base / 'project'
        self.run = self.base / 'batch'
        self.source.mkdir()
        self.project.mkdir()
        self.workbook_name = '枚举档案/尺码.xlsx'
        original = ROOT / 'inputs/tplus-current' / self.workbook_name
        self.workbook = self.source / self.workbook_name
        self.workbook.parent.mkdir()
        shutil.copy2(original, self.workbook)
        self.reference = self.source / '打印模版/参考.bof'
        self.reference.parent.mkdir()
        self.reference.write_bytes(b'test-only print reference')
        template = json.loads((HERE / 'input-contract.json').read_text())
        definition = next(item for item in template['files'] if item['path'] == self.workbook_name)
        self.contract = {'files': [copy.deepcopy(definition), {
            'path': '打印模版/参考.bof', 'kind': 'reference', 'required': False}]}
        self.rule = self.project / 'accepted-rule.json'
        self.rule.write_text('{"historicalSize":"01","old910":"无尺码"}', encoding='utf-8')
        self.registry = {'files': ['accepted-rule.json']}

    def accept(self, **options):
        return receive(self.source, self.run, self.contract, self.registry, project=self.project, **options)

    def kinds(self, result):
        return {item['kind'] for item in result['structureIssues']}

    def test_originals_and_rules_conserved_and_repeat_does_not_overwrite(self):
        before = digest(self.workbook)
        result = self.accept()
        self.assertEqual(result['status'], 'RECEIVED')
        self.assertEqual(result['databaseWrites'], 0)
        self.assertFalse(result['databaseBuildExecuted'])
        self.assertEqual(digest(self.workbook), before)
        self.assertEqual(digest(self.run / 'source' / self.workbook_name), before)
        self.assertEqual(digest(self.run / 'rules/accepted-rule.json'), digest(self.rule))
        receipt_hash = digest(self.run / 'RECEIPT.json')
        repeated = self.accept()
        self.assertEqual(repeated['repeatStatus'], 'ALREADY_RECEIVED')
        self.assertEqual(digest(self.run / 'RECEIPT.json'), receipt_hash)

    def test_changed_input_cannot_replace_a_received_batch(self):
        self.accept()
        preserved = digest(self.run / 'source' / self.workbook_name)
        with self.workbook.open('ab') as stream:
            stream.write(b'changed fixture')
        with self.assertRaises(ValueError):
            self.accept()
        self.assertEqual(digest(self.run / 'source' / self.workbook_name), preserved)

    def test_changed_rule_cannot_replace_a_received_batch(self):
        self.accept()
        preserved = digest(self.run / 'rules/accepted-rule.json')
        self.rule.write_text('{"different":"decision"}')
        with self.assertRaises(ValueError):
            self.accept()
        self.assertEqual(digest(self.run / 'rules/accepted-rule.json'), preserved)

    def test_changed_cutoff_cannot_replace_a_received_batch(self):
        self.accept(cutoff='2026-10-01T18:00:00+08:00')
        with self.assertRaises(ValueError):
            self.accept(cutoff='2026-10-02T18:00:00+08:00')

    def test_corrupted_received_copy_is_rejected(self):
        self.accept()
        (self.run / 'source' / self.workbook_name).write_bytes(b'corrupt copy')
        with self.assertRaises(ValueError):
            self.accept()

    def test_unlisted_received_copy_is_rejected(self):
        self.accept()
        (self.run / 'source/unlisted.xlsx').write_bytes(b'unlisted')
        with self.assertRaises(ValueError):
            self.accept()

    def test_missing_required_workbook_is_reviewed_and_other_originals_saved(self):
        self.workbook.rename(self.base / 'excluded-workbook.xlsx')
        result = self.accept()
        self.assertEqual(result['status'], 'REVIEW_REQUIRED')
        self.assertIn('MISSING_FILE', self.kinds(result))
        self.assertEqual(digest(self.run / 'source/打印模版/参考.bof'), digest(self.reference))

    def test_header_drift_is_reviewed(self):
        self.contract['files'][0]['structure']['sheets'][0]['headers'][0]['values'][0] = 'different accepted header'
        result = self.accept()
        self.assertEqual(result['status'], 'REVIEW_REQUIRED')
        self.assertIn('SHEET_OR_HEADER_CHANGED', self.kinds(result))

    def test_sheet_drift_is_reviewed(self):
        self.contract['files'][0]['structure']['sheetNames'].append('expected extra sheet')
        self.assertIn('SHEET_OR_HEADER_CHANGED', self.kinds(self.accept()))

    def test_unknown_file_is_preserved_for_review(self):
        extra = self.source / '新增导出.xlsx'
        extra.write_bytes(b'unmapped source')
        result = self.accept()
        self.assertIn('NEW_FILE_REQUIRES_MAPPING', self.kinds(result))
        self.assertEqual((self.run / 'source/新增导出.xlsx').read_bytes(), extra.read_bytes())

    def test_damaged_workbook_is_preserved_for_review(self):
        self.workbook.write_bytes(b'damaged original')
        result = self.accept()
        self.assertIn('UNREADABLE_WORKBOOK', self.kinds(result))
        self.assertEqual((self.run / 'source' / self.workbook_name).read_bytes(), b'damaged original')

    def test_editor_temporary_files_not_received_as_business_data(self):
        for name in ['.~尺码.xlsx', '~$尺码.xlsx', '.DS_Store']:
            (self.source / name).write_bytes(b'editor temporary data')
        result = self.accept()
        self.assertEqual(result['status'], 'RECEIVED')
        self.assertEqual(len(result['ignoredTemporaryFiles']), 3)
        self.assertEqual(result['summary']['files'], 2)

    def test_missing_print_reference_is_not_a_business_block(self):
        self.reference.rename(self.base / 'excluded-reference.bof')
        result = self.accept()
        self.assertEqual(result['status'], 'RECEIVED')
        self.assertEqual(result['observations'][0]['kind'], 'MISSING_REFERENCE')

    def test_missing_rule_dependency_does_not_create_receipt(self):
        self.registry['files'].append('missing-rule.json')
        with self.assertRaises(ValueError):
            self.accept()
        self.assertFalse((self.run / 'RECEIPT.json').exists())

    def test_nested_output_does_not_copy_back_into_input(self):
        with self.assertRaises(ValueError):
            receive(self.source, self.source / 'batch', self.contract, self.registry, project=self.project)
        self.assertFalse((self.source / 'batch').exists())

    def test_cutoff_timezone_is_required(self):
        with self.assertRaises(ValueError):
            self.accept(cutoff='2026-10-01T18:00:00')
        self.assertFalse(self.run.exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
