#!/usr/bin/env python3
"""Read-only T07 evidence verification. --write saves a fresh result in this project."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib
import json
import subprocess
import os
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/T07'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


before = read(OUT / 'demo-before.json')
demo = Path(before['root'])
env = {**os.environ, 'GIT_OPTIONAL_LOCKS': '0'}


def git(*args):
    return subprocess.check_output(['git', '-C', str(demo), *args], text=True, env=env)


file_changes = []
for relative, expected in before['files'].items():
    path = demo / relative
    if not path.is_file() or digest(path) != expected:
        file_changes.append(relative)
refs = {
    'head': git('rev-parse', 'HEAD').strip(),
    'tagObject': git('rev-parse', '8877-final-baseline').strip(),
    'tagCommit': git('rev-parse', '8877-final-baseline^{commit}').strip(),
    'refs': git('show-ref'),
    'status': git('status', '--porcelain=v2', '--untracked-files=all'),
}
def ref_map(value):
    return {line.split()[1]: line.split()[0] for line in value.splitlines()}


all_before, all_after = ref_map(before['refs']), ref_map(refs['refs'])
ref_changes = [
    {'ref': name, 'before': all_before.get(name), 'after': all_after.get(name)}
    for name in sorted(set(all_before) | set(all_after))
    if all_before.get(name) != all_after.get(name)
]
# Codex maintains its own diff checkpoints in the shared reference checkout.
# Preserve those observations separately; never alter or restore them.
platform_ref_changes = [r for r in ref_changes if r['ref'].startswith('refs/codex/turn-diffs/')]
protected_ref_changes = [r for r in ref_changes if not r['ref'].startswith('refs/codex/turn-diffs/')]
git_changes = [name for name, value in refs.items() if name != 'refs' and value != before[name]]
if protected_ref_changes:
    git_changes.append('protectedRefs')
copied = read(OUT / 'copied-source-manifest.json')
copy_changes = [r['destination'] for r in copied if not (ROOT / r['destination']).is_file() or digest(ROOT / r['destination']) != r['sha256']]
references = read(OUT / 'reference-manifest.json')
reference_changes = [r['copy'] for r in references if digest(ROOT / r['copy']) != r['sha256'] or digest(Path(r['source'])) != r['sha256']]
policy = read(ROOT / 'config/frontend-release.json')
web = ROOT / 'dist/web'
expected_web = sorted(policy['publicFiles'] + [e['output'] for e in policy['entries']])
actual_web = sorted(str(p.relative_to(web)) for p in web.rglob('*') if p.is_file())
frozen = read(demo / 'data-cleaning/verification/final-freeze-20261001/runtime-sha256.json')
entries = []
for entry in policy['entries']:
    path = web / entry['output']
    actual = digest(path)
    expected = frozen['frontend/' + entry['output']]
    entries.append({**entry, 'bytes': path.stat().st_size, 'sha256': actual, 'frozenBundleSha256': expected, 'equalsFrozenBundle': actual == expected})


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts, self.styles, self.missing = [], [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        url = attrs.get('src') if tag == 'script' else attrs.get('href') if tag == 'link' else None
        if not url or url.startswith(('https:', 'http:', 'data:', '#')):
            return
        relative = url.split('?')[0].split('#')[0]
        target = web / relative
        if not target.is_file():
            self.missing.append(relative)
        if tag == 'script':
            self.scripts.append(relative)
        elif attrs.get('rel') == 'stylesheet':
            self.styles.append(relative)


html = References()
html.feed((web / 'index.html').read_text())
media = [r for r in copied if r['source'].startswith('frontend/assets/product-media/')]
fonts = [r for r in copied if r['source'].endswith('.woff2')]
context = read(OUT / 'task-context.json')
plan = demo / 'docs/正式开发与上线主计划-20261001/主计划.md'
tasks = demo / 'docs/正式开发与上线主计划-20261001/任务清单.json'
release = read(ROOT / 'outputs/releases/verification.json')
smoke = read(OUT / 'release-runtime-smoke.json')
template_files = sorted((ROOT / 'config/templates').glob('*.env.example'))
empty_secret_templates = all('POSTGRES_PASSWORD_FILE=\n' in p.read_text() and 'SESSION_SECRET_FILE=\n' in p.read_text() for p in template_files)
checks = {
    'demo_protected_files_unchanged': not file_changes,
    'demo_head_tags_branches_remotes_status_unchanged': not git_changes,
    'all_other_ref_changes_confined_to_codex_diff_checkpoints': len(ref_changes) == len(platform_ref_changes),
    'copied_sources_exact': not copy_changes,
    'planning_references_exact': not reference_changes,
    'seven_entries_equal_frozen_bundles': len(entries) == 7 and all(e['equalsFrozenBundle'] for e in entries),
    'frontend_publication_exact': actual_web == expected_web,
    'html_references_complete': not html.missing,
    'fonts_and_media_preserved': len(fonts) == 4 and len(media) == 134,
    'private_media_excluded_from_web': not (web / 'assets/product-media').exists(),
    'actual_plan_and_task_versions_unchanged': digest(plan) == context['actualPlanSha256'] and digest(tasks) == context['taskListSha256'],
    'three_empty_secret_configuration_templates': len(template_files) == 3 and empty_secret_templates,
    'archive_readback_and_exclusions': release['status'] == 'PASS' and release['excludedFilesFound'] == 0,
    'fresh_runtime_archive_smoke': smoke['status'] == 'PASS' and smoke['archiveSha256'] == release['archiveSha256'] and smoke['shutdownExitCode'] == 0,
}
result = {
    'task': 'T07', 'status': 'PASS' if all(checks.values()) else 'FAIL',
    'checkedAtUTC': datetime.now(timezone.utc).isoformat(), 'checks': checks,
    'demo': {**refs, 'protectedFiles': len(before['files']), 'changedFiles': file_changes, 'changedGitFields': git_changes, 'allRefChanges': ref_changes, 'codexDiffCheckpointChanges': platform_ref_changes, 'protectedRefChanges': protected_ref_changes},
    'sourceCopies': {'files': len(copied), 'changedFiles': copy_changes},
    'planningCopies': {'files': len(references), 'changedFiles': reference_changes},
    'resources': {'frontendCopiedFiles': sum(r['source'].startswith('frontend/') for r in copied), 'htmlScripts': len(html.scripts), 'htmlStyles': len(html.styles), 'htmlMissing': html.missing, 'fonts': len(fonts), 'productMedia': len(media), 'sevenEntries': entries, 'publishedFiles': len(actual_web)},
    'knownMetadataMismatch': {'recorded': context['recordedPlanSha256'], 'actual': context['actualPlanSha256'], 'preserved': True},
    'archive': release, 'runtimeSmoke': smoke, 'databaseConnections': 0, 'serverOperations': 0,
}
if '--write' in sys.argv:
    (OUT / 'verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
sys.exit(0 if result['status'] == 'PASS' else 1)
