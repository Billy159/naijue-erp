# Sales write-authorization PostgreSQL preflight: blocked, NOT RUN

The new sales write-authorization acceptance was not executed. No PostgreSQL startup, initdb, connection, database creation, or engine test occurred. The prepared operator remains unstarted; its data and commands paths are absent and runtime evidence directory is empty. Existing instances, databases, and evidence were not modified.

Two bounded attempts were made for the same read-only command, ss -H -ltn 'sport = :55432':
1. The normal sandbox returned “Cannot open netlink socket: Operation not permitted.” Its captured ss exit code was0, but the denial makes the port result unreliable. The full combined preflight output is preserved verbatim in attempt-01-preflight-output.txt.
2. One specifically approved require_escalated invocation returned exit1 before obtaining a reliable ss result: the bwrap wrapper reported a read-only-filesystem failure. Exact returned output is preserved in attempt-02-approved-tool-output.txt. The referenced restricted path was not read or changed, and its permissions were not requested.

The dependency was stopped. No alternate probe, sandbox/network change, PostgreSQL start, or retry followed. Port availability remains unknown. This is not a PostgreSQL test failure and is not a known issue repairable by additional user authorization. No missing authorization was established. A supported environment/tool resolution is needed before any separately authorized continuation.

The exact prepared supervisor SHA256 is247cd41d3ef3416082be28ee7a943cf590182d13db1a286395ce5875c1a2743a. Its only reviewed source delta is the isolated base directory. Expected26 is a plan, not PASS; earlier22/22 evidence does not cover this new write-authorization suite.

This report is frozen after creation. No credentials, data directory, or PostgreSQL configuration is included. The raw wrapper output mentions a restricted path only as an error message, not as a file read.
