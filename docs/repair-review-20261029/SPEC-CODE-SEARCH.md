# Specification candidate code search

Actual fixed35ef9040 headed RED: synthetic color code001 corresponds to real candidate id…020000/nameA. Formal-shaped candidate response contained A, but visible Transfer rows were empty. DTO already carries code; local Transfer filter retained only name and discarded valid server results. Frozen product-arco.jsx searches actual name+code.

Minimal fix keeps displayed names and IDs unchanged, builds codeById from actual loaded candidates, searches name plus that code; absent code remains absent, never inferred from UUID or label. Typecheck caught Arco TransferItem type rejecting custom code property; final implementation uses real-ID Map, not type cast. Native and actual fixed browser results follow in evidence update; no write behavior changed.

Final evidence: old35ef code-red2 exact installed Arco row selector returned no visible rows while response carried A/001; fixedda2 code-green4 exit0, A visible→click label/select→actual move-right button→selected-side001 finds A→move-left→cancel preserves original specs. Frozen b8 actual001 search exit0 and displays A. Native editor regression/typecheck0. Initial runner used obsolete row CSS class, then attempted covered native checkbox input, then Chinese label despite Arco English aria-label: these harness failures are preserved, not claimed as production defects. Final screenshot inspected.
