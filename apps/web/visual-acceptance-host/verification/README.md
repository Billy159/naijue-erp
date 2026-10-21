# Focused check evidence

Six distinct focused checks passed: three graph/fixture checks recorded in
`graph-fixtures-server.log`, the source entry smoke recorded in `entry.log`, and
two static server checks rerun against the final server in `server-final.log`.
The earlier server results are superseded by the final rerun, not counted again.
The graph/fixture/entry logs reproduce the completed tool-run stdout; they are not
presented as fresh reruns. The server-final log is direct redirected stdout.

Root owns full compilation and the final commit/rebuild. These logs are not Mac
browser visual acceptance, and no server listener was started during any check.
