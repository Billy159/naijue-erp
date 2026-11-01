"""Same-session Card03 orchestration. No connection factory, target, grant or IO.

The reviewed runner supplies one owned PrivatePsqlSession after RO02 binding.
Any exception escapes and stops the sole card; there is no retry or resume.
"""
import time

# Bounded payload batches; SQL, timeout, session and EOF/count rules are unchanged.
PAGE_ROWS = 16
import hashlib
import re

def need(value, code):
    if not value:
        raise ValueError(code)

def collect_card03(session, sql, protocol, lease, deadline, prefix, audit, monotonic=time.monotonic):
    accumulator = protocol.KeyBoundCard03Accumulator(page_size=PAGE_ROWS, max_pages_per_source=10000)
    audit.update(phase='OPENING_SINGLE_RR_READONLY_SESSION', completedPageStatements=0,
                 completedKeyPageStatements=0, completedCountStatements=0, statementLockIdleTimeoutSeconds=[3,1,5],
                 sameOwnedSessionRequired=True, privatePacketsPublished=False,
                 clientClosed=False, rollback='NOT_CONFIRMED', aggregateCandidate=None)
    def alive():
        need(monotonic() < deadline, 'CARD03_ACTION_DEADLINE_EXHAUSTED')
        lease.assert_live()
    # Bounded non-sensitive progress only. Never a partial aggregate candidate.
    progress = {'scope': 'PARTIAL_PROGRESS_NOT_FULL_AGGREGATE', 'tailLimit': 16,
                'queryCallsAttempted': 0, 'sources': {
                    name: {'acceptedRows': 0, 'acceptedPageStatements': 0, 'acceptedKeyPageStatements': 0,
                           'eofAccepted': False, 'countAccepted': False}
                    for name in ('revision', 'employee')}, 'tail': []}
    audit['progressAudit'] = progress
    template_hashes = {name: hashlib.sha256(sql[name]).hexdigest()
                       for table in ('revision', 'employee')
                       for name in (table+'-locate-first.sql', table+'-locate-next.sql',
                                    table+'-first.sql', table+'-next.sql', table+'-total.sql')}

    def audited_query(table, name, params, query_kind):
        source_progress = progress['sources'][table]
        progress['queryCallsAttempted'] += 1
        item = {'attemptOrdinal': progress['queryCallsAttempted'], 'template': name,
                'templateSha256': template_hashes[name], 'queryKind': query_kind,
                'status': 'ATTEMPTED_NOT_ACCEPTED', 'durationNanoseconds': None,
                'packetBytes': None, 'acceptedNrows': None,
                'acceptedCumulativeRows': source_progress['acceptedRows'],
                'backendSnapshotConsistencyAccepted': None,
                'eofAccepted': source_progress['eofAccepted'],
                'countAccepted': source_progress['countAccepted'], 'sqlstate': 'NOT_REPORTED'}
        progress['tail'].append(item)
        if len(progress['tail']) > 16:
            del progress['tail'][0]
        started = monotonic()
        try:
            raw = session.query(sql[name], list(params))
            item['packetBytes'] = len(raw) if type(raw) is bytes else None
            alive()
            if query_kind == 'TOTAL':
                accumulator.accept_total_bytes(raw)
                audit['completedCountStatements'] += 1
                source_progress['countAccepted'] = True
            elif query_kind == 'KEY_PAGE':
                accumulator.accept_key_page_bytes(raw)
                audit['completedKeyPageStatements'] += 1
                source_progress['acceptedKeyPageStatements'] += 1
                # Tentative key header is NOT accepted aggregate rows/EOF.
            else:
                need(query_kind == 'PAYLOAD_AGGREGATE', 'CARD03_QUERY_KIND_REFUSED')
                previous_rows = accumulator._rows
                accumulator.accept_page_bytes(raw)
                accepted_nrows = accumulator._rows - previous_rows
                audit['completedPageStatements'] += 1
                source_progress['acceptedRows'] += accepted_nrows
                source_progress['acceptedPageStatements'] += 1
                source_progress['eofAccepted'] = accumulator._eof
                item['acceptedNrows'] = accepted_nrows
            item.update(status=('KEY_PACKET_PENDING_PAYLOAD_NOT_AGGREGATE' if query_kind == 'KEY_PAGE'
                                else 'PROTOCOL_ACCEPTED_PARTIAL_PROGRESS'), sqlstate='00000',
                        acceptedCumulativeRows=source_progress['acceptedRows'],
                        backendSnapshotConsistencyAccepted=True,
                        eofAccepted=source_progress['eofAccepted'], countAccepted=source_progress['countAccepted'])
        except BaseException as error:
            # Preserve the original exception identity and never copy its message.
            try:
                state = getattr(error, 'sqlstate', None)
            except BaseException:
                state = None
            item['sqlstate'] = state if type(state) is str and re.fullmatch('[0-9A-Z]{5}', state) else 'NOT_REPORTED'
            item['status'] = 'FAILED_OR_UNACCEPTED_UNKNOWN'
            raise
        finally:
            # Client attempt wall time includes receive, lease check and validation;
            # not a measurement of server-only execution or a SQL sub-plan stage.
            item['durationNanoseconds'] = max(0, int((monotonic()-started)*1000000000))

    try:
        alive()
        need(session.exchange(prefix + b"SET client_encoding='UTF8';\n" + sql['00-open-and-original-guards.sql']) == [b'1', b'1'], 'CARD03_ORIGINAL_GUARDS_REFUSED')
        alive()
        audit['phase'] = 'VERIFYING_CURRENT_PRIMARY_KEYS'
        need(session.exchange(sql['01-current-pk-guard.sql']) == [b'1'], 'CARD03_CURRENT_PRIMARY_KEYS_REFUSED')
        for table in ('revision', 'employee'):
            while True:
                alive()
                cursor = accumulator.private_next_cursor
                if cursor is None:
                    suffix = 'first'
                    params = (str(PAGE_ROWS),)
                else:
                    suffix = 'next'
                    params = tuple([str(cursor[0]), str(cursor[1]), str(PAGE_ROWS)] if table == 'revision' else [v.encode('utf-8').hex() for v in cursor] + [str(PAGE_ROWS)])
                # Immutable original vector; each query gets an independent list.
                audit['phase'] = table.upper() + '_KEY_PAGE'
                audited_query(table, table + '-locate-' + suffix + '.sql', params, 'KEY_PAGE')
                alive()
                audit['phase'] = table.upper() + '_PAYLOAD_AGGREGATE'
                audited_query(table, table + '-' + suffix + '.sql', params, 'PAYLOAD_AGGREGATE')
                if accumulator._eof:
                    break
            alive()
            audit['phase'] = table.upper() + '_INDEPENDENT_TOTAL'
            audited_query(table, table + '-total.sql', (), 'TOTAL')
        candidate = accumulator.aggregate_candidate()
        alive()
        audit['phase'] = 'ROLLING_BACK_OWNED_SESSION'
        session.close_rollback()
        audit.update(clientClosed=True, rollback='ROLLBACK_ACK_AND_PSQL_EXIT_ZERO', phase='AWAITING_FINAL_KERNEL_BINDING')
        alive()
        # The caller must still verify kernel binding and complete owned cleanup.
        return candidate
    except BaseException:
        accumulator.abort()
        audit['aggregateCandidate'] = None
        audit['phaseFailed'] = audit['phase']
        try:
            session.abort()
            audit['localClientProcessCleanup'] = 'TERMINAL_LOCAL_PROCESS_NOT_DATABASE_PROOF' if getattr(session,'cleanup_confirmed',False) is True else 'UNKNOWN_REQUIRES_OWNED_TARGET_STOP'
        except BaseException:
            audit['localClientProcessCleanup'] = 'UNKNOWN_REQUIRES_OWNED_TARGET_STOP'
        raise
