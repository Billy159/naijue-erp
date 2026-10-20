# Source snapshot

- Local source: `/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1`
- Local branch: `codex/t07-foundation`
- Local commit: `deedf387b1bf3605c1a0a005ef35cdef825579a0` (Record T07 acceptance and release evidence)
- Working tree at capture: Git porcelain reported 290 entries (66 tracked changes and 224 untracked path entries; directory summaries can represent many files). The snapshot copies current file contents in its included source scope, not only committed content.
- Captured at: 2026-10-20T11:11:36+08:00
- Remote base: `Billy159/naijue-erp` private repository, default branch `main` at `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`; this snapshot is intended to be added on `snapshot/local-20261020-111136` without replacing existing remote files.
- Scope: backend and frontend source, SQL schema/migrations, local build/package configuration, selected build/test scripts, tests, static vendor libraries and fonts, README.
- Excluded: `.git` and local history; candidate 617 and release packages; `outputs/`, `logs/`, `references/`, `inputs/`, raw import directories, QA/runtime data, database files, backups, caches, `node_modules`, `.runtime`, `dist/`, generated frontend bundles, product media/user-uploaded files, verification image fixtures, and their derived media index, operational server configs/scripts (including the employee-bearing T12 verification script), all environment templates, global/personal collaboration instructions, and local GitHub workflows.
- Private inputs omitted from the upload: `server/security/approved-fund-accounts-data.ts`, `server/security/approved-party-roles.ts`, `server/security/approved-initial-employees.ts`, `frontend/sales-funds-data.js`, and the derived `frontend/product-media-thumbnails.js` index. The snapshot contains fail-closed placeholders that preserve import/export names where needed: private configuration stubs raise `PRIVATE_CONFIGURATION_REQUIRED`, and the media-index stub raises `PRIVATE_MEDIA_OMITTED`; no real private values or empty collections are substituted. The original project remains unchanged.
- **This is a current local workspace source snapshot, not candidate 617 and not a formal release package.** It is not deployable until the private configuration inputs are supplied through an approved private channel.
