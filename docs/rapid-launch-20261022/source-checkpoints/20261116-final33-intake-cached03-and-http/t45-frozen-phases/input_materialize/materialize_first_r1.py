"""Existing private input and ordinary-tool materializers bound to first R1."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import tarfile
import threading
import time

RAW_JOB = "t45-first-r1-input-materialize-20261109-01"
RAW_REMAINING_JOB = "t45-first-r1-input-remaining-20261109-01"
RAW_DIAGNOSTIC_JOB = "t45-first-r1-input-partial-readonly-20261109-01"
RAW_REMAINING_PINS = {
    "originalTerminalSha256": "d0757e475217f09460e7908c5c14d58c29a222f82a5173db5bb11a62ddc4fa5d",
    "originalResultSha256": "352d78053b41bc43b94fb2a2b9c3794926faae4718dae3373ec55bbe647e4a06",
    "diagnosticTerminalSha256": "bbe91a0a3d3c6bd4ae0455a43413c5b86351b33ef05c6c5a6754e9fe1e650bae",
    "diagnosticResultSha256": "6d02ac41b3f93d70cffb2bff3a17636f0447cb9c73100b066b889d01d3cb5c41",
    "stageAuthoritySha256": "94b22a2897cfcf603c524a6a7c9d32a34e24508c868fcb5484d504ffb0462677",
    "stageReadySha256": "34abd06e8cbdebdc0835ace6b2845a4e18ba8730dd6ccc37fc33dc5bacbbb8b5",
    "planSha256": "3a9dd4e083ba8a023ea903f6bac20960893f3b32dd257a6697d19e93436f9503",
    "nativeResultSha256": "79a634d296babe94166e6a9089ff55b14e6f8a946fa314163c37201a16c5d1e4",
}
RAW_PRESERVED_BYTES = 278769097
RAW_PRESERVED_SET_SHA = "4d302b2a4885aae8adecd92b8a6cf2db14df780d88e15582d9aae4a4243380bb"
RAW_SAMPLE_INTERVAL = .25
RAW_SAMPLE_POLL = .05

TOOL_JOB = "t45-first-r1-tool-materialize-20261109-01"
TOOL_SUCCESSOR_JOB = "t45-first-r1-tool-materialize-75144abc-20261110-01"
TOOL_RECOVERY_JOB = "t45-first-r1-tool-materialize-94152ed1-20261110-01"
RAW_KEY = "t45-first-r1-standard-full-20261109-01"
RAW_MANIFEST = "1e1e495ad7177b64be65620f3e15a632405e738a1d076e9173e77b282fb3eec9"
RAW_SHA = "fc831c282f982ca22c840906aae96bf69acf23e785a42c199655e0ccf297365e"
RAW_BYTES = 93508914
RAW_EXPANDED_BYTES = 1008361447
TOOL_MATERIALS = {
    TOOL_JOB: {
        "key": "f35-72eb4b8c-first-production-20261109-r1",
        "root": "/var/lib/naijue-erp/fresh35-production/installed-real-operation-72eb4b8c-20261109-01/operation",
        "commit": "72eb4b8ccd2a55078f3f32f83e74ac1f0d44eff3",
        "source": "964a925adcad201f10d5e5b18d158cb6abd229cfa7f1d0e3402105c0dcf187b3",
        "archive": "92c53cdaa5f1136194936df9f52bbaead67f206d8ba5a46f2fc697b193185f46",
        "archiveBytes": 1153749,
        "manifest": "fccd404c1e46a7c53c1d58c259506c8c1d2a5945affeb8a6a973aefe6a07875a",
        "expandedBytes": 5150488,
    },
    TOOL_SUCCESSOR_JOB: {
        "key": "f35-75144abc-first-production-20261109-r1",
        "root": "/var/lib/naijue-erp/fresh35-production/installed-real-operation-75144abc-20261110-01/operation",
        "commit": "75144abc47d89bf5204cf88a92737981bb5e025d",
        "source": "50bd7bf46362487fabb6b709c47b55feb51436df318c55191c6e1433b617d96c",
        "archive": "57445437cf04029f1da00b14e2e9f6d287a678275a771645b2af057c52a858a6",
        "archiveBytes": 1153960,
        "manifest": "beaa2a699a318265c47a721cc810951134e6d5b583852af3b4b597255fcdf9e1",
        "expandedBytes": 5151292,
    },
    TOOL_RECOVERY_JOB: {
        "key": "f35-94152ed1-first-production-20261109-r1",
        "root": "/var/lib/naijue-erp/fresh35-production/installed-real-operation-94152ed1-20261110-01/operation",
        "commit": "94152ed1c61e508255e0f20cc35e23d00253f635",
        "source": "f9d7b100b628ecf5072a208bc0f28ed93b987a1f9150dc54398c36f785774054",
        "archive": "ef5c74ebcec9c114e45ba4e3fb88b4b12f4caa4a3d677607c6232a462b071fb8",
        "archiveBytes": 1156487,
        "manifest": "7188a1b6bc1fa009a06c0b0ef4ac7800b97292d3624fcc931f522b0bdb9da19a",
        "expandedBytes": 5161482,
    },
}
FIRST_ROOT = "/srv/naijue-erp/isolated-targets/fresh35-first-production-20261109-r1"


def need(value, code):
    if not value:
        raise ValueError(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def check_binding(binding, key, now):
    fields = {"format", "jobId", "targetRoot", "opsSourceSha256", "planSha256",
              "stageAuthoritySha256", "stageReadySha256", "startsAt", "expiresAt"}
    if key in (RAW_JOB, RAW_REMAINING_JOB):
        fields |= {"nativeResultSha256"}
        if key == RAW_REMAINING_JOB:
            fields |= RAW_REMAINING_PINS.keys()
    else:
        fields |= {"containerId", "installationRecordSha256", "targetSha256"}
    need((key in (RAW_JOB, RAW_REMAINING_JOB) or key in TOOL_MATERIALS)
         and type(binding) is dict and set(binding) == fields
         and binding["format"] == "T45_FIRST_R1_MATERIALIZATION_V1"
         and binding["jobId"] == key and binding["targetRoot"] == FIRST_ROOT,
         "FIRST_MATERIAL_TARGET_OR_KEY_DIFFERS")
    need(all(type(binding[k]) is str and re.fullmatch("[a-f0-9]{64}", binding[k])
             for k in fields if k.endswith("Sha256") or k == "containerId"),
         "FIRST_MATERIAL_FIXED_DIGEST_REQUIRED")
    max_window_ms = 600000 if key == RAW_REMAINING_JOB else 1800000
    need(type(binding["startsAt"]) is type(binding["expiresAt"]) is int
         and binding["startsAt"] <= now < binding["expiresAt"] <= binding["startsAt"] + max_window_ms,
         "FIRST_MATERIAL_EXTERNAL_WINDOW_REQUIRED")
    if key == RAW_REMAINING_JOB:
        need(all(binding[k] == v for k, v in RAW_REMAINING_PINS.items()), "FIRST_RAW_REMAINING_PINS_DIFFER")


def member_name(member):
    name = member.name
    path = PurePosixPath(name)
    need(not path.is_absolute() and str(path) == name and name != "."
         and ".." not in path.parts and "\\" not in name, "FIRST_MATERIAL_ARCHIVE_PATH_REFUSED")
    return path


def write_guarded_raw(output, data, checkpoint):
    pending = memoryview(data)
    while pending:
        checkpoint()
        size = output.write(pending)
        need(size is not None and 0 < size <= len(pending), "FIRST_RAW_SHORT_WRITE")
        pending = pending[size:]


def sync_guarded_raw_directory(path, checkpoint):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        checkpoint()
        os.fsync(fd)
    finally:
        os.close(fd)


def extract_raw(ops, data, package, sample, *, preserved=frozenset(), phase=None):
    seen = set()
    count = total = 0
    with tarfile.open(fileobj=io.BytesIO(data), mode="r|gz") as archive:
        for member in archive:
            sample()
            q = member_name(member)
            need(q not in seen and (member.isfile() or member.isdir()), "PRIVATE_REGULAR_MEMBER_REQUIRED")
            seen.add(q)
            out = package / str(q)
            if str(q) in preserved:
                need(member.isfile(), "FIRST_RAW_PRESERVED_MEMBER_TYPE_DIFFERS")
                count += 1
                total += member.size
                continue
            if phase:
                phase("EXTRACT_WRITE")
                parent = package
                for part in q.parts[:-1]:
                    parent /= part
                    sample()
                    parent.mkdir(mode=0o700, exist_ok=True)
            else:
                out.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            if member.isdir():
                if phase:
                    sample()
                out.mkdir(mode=0o700, exist_ok=True)
                continue
            need(count < 31 and member.size >= 0 and total + member.size <= RAW_EXPANDED_BYTES,
                 "PRIVATE_PACKAGE_BOUND_DIFFERS")
            count += 1
            if phase:
                sample()
            fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            try:
                incoming = archive.extractfile(member)
                written = 0
                # Closing a guarded output must never flush data after the stop.
                with os.fdopen(fd, "wb", buffering=0 if phase else -1, closefd=False) as output:
                    while True:
                        sample()
                        block = incoming.read(65536)
                        if not block:
                            break
                        if phase:
                            write_guarded_raw(output, block, sample)
                        else:
                            output.write(block)
                        written += len(block)
                    if phase:
                        phase("FILE_SYNC")
                    else:
                        output.flush()
                    os.fchmod(fd, 0o400)
                    if phase:
                        sample()
                    os.fsync(fd)
                    if phase:
                        sample()
                need(written == member.size, "PRIVATE_PACKAGE_WRITE_INCOMPLETE")
                if phase:
                    phase("DIRECTORY_SYNC")
                    sync_guarded_raw_directory(out.parent, sample)
                    phase("EXTRACT_READ")
                else:
                    ops.syncdir(out.parent)
                total += written
            finally:
                os.close(fd)
    need(count == 31 and total == RAW_EXPANDED_BYTES, "PRIVATE_PACKAGE_CLOSURE_DIFFERS")


def require_native_continuation(ops, plan, expected_result_sha, expected_plan_sha):
    native_job = ops.NATIVE_REMAINING_JOB
    terminal = ops.strict(ops.read_file(ops.CONTROL / "results" / (native_job + ".json"), 65536, root=False))
    need(terminal.get("jobId") == native_job and terminal.get("taskId") == "T45"
         and terminal.get("status") == "COMPLETED" and terminal.get("exitCode") == 0
         and "fresh35-materialize-app-remaining-result.json" in terminal.get("exports", []),
         "FIRST_MATERIAL_NATIVE_CONTINUATION_TERMINAL_REQUIRED")
    path = ops.CONTROL / "jobs" / native_job / "results/fresh35-materialize-app-remaining-result.json"
    raw = ops.read_file(path, 65536, root=False)
    need(sha(raw) == expected_result_sha, "FIRST_MATERIAL_NATIVE_CONTINUATION_DIGEST_DIFFERS")
    native = ops.strict(raw)
    need(native.get("planSha256") == expected_plan_sha, "FIRST_MATERIAL_NATIVE_CONTINUATION_PLAN_DIFFERS")
    continuation = native.get("continuation", {})
    expected = {**ops.native_remaining_lineage(), "targetIdentity": list(ops.NATIVE_PARTIAL_ROOT_ID[:5]),
                "existingReused": 6878, "missingWritten": 420, "fixedWritten": 2, "membersVerified": 7298,
                "existingOverwritten": 0, "independentInodes": True, "sourceIdentityStable": True}
    authority = continuation.get("remainingAuthoritySha256")
    need(native.get("status") == "FIRST_R1_NATIVE_REMAINING_MATERIALIZED_NO_DB_WINDOW"
         and native.get("application") == ops.application_receipt(plan) and native.get("postgresStarted") is False
         and type(authority) is str and re.fullmatch("[a-f0-9]{64}", authority)
         and continuation == {**expected, "remainingAuthoritySha256": authority}
         and ops.local_copy_identity(ops.trusted(ops.ROOT).lstat())[:5] == ops.NATIVE_PARTIAL_ROOT_ID[:5],
         "FIRST_MATERIAL_NATIVE_CONTINUATION_RESULT_REQUIRED")


def require_raw_native_plan(ops, job, binding):
    plan = ops.load_plan(str(job / "bundle/native-plan.json"), binding["planSha256"])
    need(plan["operationId"] == "t45-first-20261109-r1-install-preparation"
         and ops.strict(ops.read_file(ops.ROOT / "prepare-started.json", 65536, True)) == ops.application_receipt(plan),
         "FIRST_MATERIAL_NATIVE_ROOT_DIFFERS")
    require_native_continuation(ops, plan, binding["nativeResultSha256"], binding["planSha256"])


def materialize_raw(ops, job, binding):
    require_raw_native_plan(ops, job, binding)

    state = ops.trusted(ops.ROOT / "state")
    private = state / ops.REAL_ROOT.name
    for path in (ops.ROOT / "input", private, state / ops.FIRST_WORK, state / "shared-real-package-binding.json",
                 ops.ROOT / "production-start-intent.json", ops.ROOT / "production-container-receipt.json"):
        need(not path.exists() and not path.is_symlink(), "FIRST_MATERIAL_INPUT_OR_TARGET_ALREADY_PRESENT_NO_REPLAY")
    need(not ops.run(["docker", "ps", "-a", "--filter", "name=^/" + ops.NAME + "$", "--format", "{{.ID}}"]).strip(),
         "FIRST_MATERIAL_TARGET_CONTAINER_PRESENT")
    data = ops.staged_artifact(RAW_KEY, "manifestSha256", RAW_MANIFEST, RAW_BYTES, RAW_SHA,
                               binding["stageAuthoritySha256"], binding["stageReadySha256"])
    began = last = time.monotonic()
    namespace = Path("/proc/self/ns/mnt").stat().st_ino
    device = state.stat().st_dev

    def sample(starting=False):
        nonlocal last
        now = time.monotonic()
        need(now - began < 280 and int(time.time() * 1000) < binding["expiresAt"], "FIRST_MATERIAL_INPUT_DEADLINE_EXPIRED")
        need(now - last <= .25 and state.stat().st_dev == device == 66304
             and Path("/proc/self/ns/mnt").stat().st_ino == namespace, "FIRST_MATERIAL_INPUT_VOLUME_OR_SAMPLE_DIFFERS")
        v = os.statvfs(state)
        free = v.f_bavail * v.f_frsize
        need(free >= (ops.REAL_START_MINIMUM if starting else ops.REAL_STOP_FLOOR), "FIRST_MATERIAL_INPUT_SPACE_FLOOR")
        finished = time.monotonic()
        need(finished - last <= .25 and int(time.time() * 1000) < binding["expiresAt"],
             "FIRST_MATERIAL_INPUT_VOLUME_OR_SAMPLE_DIFFERS")
        last = finished
        return free

    before = sample(True)
    ops.SHARED_REAL_PACKAGE.parent.mkdir(mode=0o700)
    ops.SHARED_REAL_PACKAGE.mkdir(mode=0o700)
    private.mkdir(mode=0o700)
    for name in ("reports", "tmp", "sqlite-scratch", "approvals"):
        (private / name).mkdir(mode=0o700)
    extract_raw(ops, data, ops.SHARED_REAL_PACKAGE, sample)
    snapshot = ops.shared_real_package_snapshot()
    sample()
    ops.new_json(state / "shared-real-package-binding.json", snapshot)
    need(ops.shared_real_package_binding() == ops.SHARED_REAL_PACKAGE, "FIRST_MATERIAL_INPUT_BINDING_READBACK_DIFFERS")
    return {"status": "FIRST_R1_PRIVATE_INPUT_AND_BINDING_MATERIALIZED", "archiveSha256": RAW_SHA,
            "manifestSha256": RAW_MANIFEST, "expandedBytes": RAW_EXPANDED_BYTES, "members": 31,
            "freeBeforeBytes": before, "freeAfterBytes": sample(), "archiveTransferred": False, "PGConnections": 0}


class RawSampleError(ValueError):
    def __init__(self, code, stage):
        super().__init__(code)
        self.stage = stage


def mount_namespace_identity():
    s = Path("/proc/self/ns/mnt").stat()
    return s.st_dev, s.st_ino


class RawVolumeGuard:
    """Sample while the single writer is in blocking I/O. The sampler has no write access."""

    def __init__(self, ops, state, expires_at, progress):
        self.ops = ops
        self.state = state
        self.expires_at = expires_at
        self.progress = progress
        self.namespace = mount_namespace_identity()
        self.began = self.last = time.monotonic()
        self.failure = None
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.worker = threading.Thread(target=self._watch, daemon=True)

    def _within_window(self, now):
        return now - self.began < 280 and int(time.time() * 1000) < self.expires_at

    def _sample(self, starting=False):
        previous = self.last
        now = time.monotonic()
        need(self._within_window(now), "FIRST_RAW_WINDOW_EXPIRED_BEFORE_SAMPLE")
        need(now - previous <= RAW_SAMPLE_INTERVAL, "FIRST_RAW_SAMPLE_LATE")
        need(self.state.stat().st_dev == 66304, "FIRST_RAW_SAMPLE_DEVICE_DIFFERS")
        need(mount_namespace_identity() == self.namespace, "FIRST_RAW_SAMPLE_NAMESPACE_DIFFERS")
        v = os.statvfs(self.state)
        free = v.f_bavail * v.f_frsize
        finished = time.monotonic()
        need(self._within_window(finished), "FIRST_RAW_WINDOW_EXPIRED_DURING_SAMPLE")
        need(finished - previous <= RAW_SAMPLE_INTERVAL, "FIRST_RAW_SAMPLE_OVERRUN")
        floor = self.ops.REAL_START_MINIMUM if starting else self.ops.REAL_STOP_FLOOR
        need(free >= floor, "FIRST_RAW_SAMPLE_SPACE_FLOOR")
        self.last = finished
        self.free = free

    def _record(self, error):
        with self.lock:
            if self.failure is None:
                code = str(error) if isinstance(error, ValueError) else "FIRST_RAW_SAMPLE_OS_ERROR"
                self.failure = RawSampleError(code, self.progress["stage"])
        self.stop.set()

    def _watch(self):
        while not self.stop.wait(RAW_SAMPLE_POLL):
            try:
                self._sample()
            except (OSError, ValueError) as error:
                self._record(error)
                break

    def __enter__(self):
        self.progress["stage"] = "INITIAL_SAMPLE"
        try:
            self._sample(starting=True)
        except (OSError, ValueError) as error:
            self._record(error)
            raise self.failure from error
        self.free_before = self.free
        self.worker.start()
        return self

    def checkpoint(self):
        if self.failure:
            raise self.failure
        # Only the sampler diagnoses sample predicates. The writer fails closed if
        # it has not received a fresh sample, including a sampler blocked in I/O.
        if not self._within_window(time.monotonic()):
            self._record(ValueError("FIRST_RAW_WRITER_WINDOW_EXPIRED"))
        elif time.monotonic() - self.last > RAW_SAMPLE_INTERVAL:
            self._record(ValueError("FIRST_RAW_SAMPLE_STALE_AT_WRITER"))
        if self.failure:
            raise self.failure

    def phase(self, value):
        self.checkpoint()
        self.progress["stage"] = value

    def __exit__(self, error_type, error, trace):
        try:
            if error is None:
                self.checkpoint()
            else:
                # Preserve an already recorded sample failure, otherwise latch the
                # writer error before shutdown can produce a later sample failure.
                with self.lock:
                    if self.failure is None:
                        self.failure = error
        finally:
            self.stop.set()
            self.worker.join(RAW_SAMPLE_INTERVAL)
        if self.failure and self.failure is not error:
            raise self.failure from error
        if error is None:
            need(not self.worker.is_alive(), "FIRST_RAW_SAMPLER_STOP_UNCONFIRMED")


def raw_remaining_receipts(ops):
    specs = (
        (ops.CONTROL / "results" / (RAW_JOB + ".json"), "originalTerminalSha256"),
        (ops.CONTROL / "jobs" / RAW_JOB / "results/first-r1-materialization.json", "originalResultSha256"),
        (ops.CONTROL / "results" / (RAW_DIAGNOSTIC_JOB + ".json"), "diagnosticTerminalSha256"),
        (ops.CONTROL / "jobs" / RAW_DIAGNOSTIC_JOB / "results/input-partial-readback.json", "diagnosticResultSha256"),
    )
    values = []
    for path, key in specs:
        raw = ops.read_file(path, 65536, root=False)
        need(sha(raw) == RAW_REMAINING_PINS[key], "FIRST_RAW_REMAINING_RECEIPT_SHA_DIFFERS")
        values.append(ops.strict(raw))
    original, phase, diagnostic, observed = values
    stats = observed.get("packageStatistics", {})
    need(original["jobId"] == phase["jobId"] == RAW_JOB and original["taskId"] == "T45"
         and (original["status"], original["exitCode"]) == ("FAILED", 2)
         and phase["safeCode"] == "FIRST_MATERIAL_INPUT_VOLUME_OR_SAMPLE_DIFFERS"
         and diagnostic["jobId"] == observed["jobId"] == RAW_DIAGNOSTIC_JOB and diagnostic["taskId"] == "T45"
         and (diagnostic["status"], diagnostic["exitCode"]) == ("COMPLETED", 0)
         and observed["status"] == "EXACT_READONLY_RAW_PARTIAL_INVENTORY"
         and observed["volume"]["device"] == 66304 and observed["volume"]["rootInode"] == 13238273
         and observed["pathPresence"] == {"input": True, "package": True, "binding": False, "runtimeStaging": True}
         and (stats.get("completeShaMatches"), stats.get("missingFiles"), stats.get("presentBytes"),
              stats.get("truncatedPrefixMatches"), stats.get("completeBytesAwaitingMode")) == (2, 29, RAW_PRESERVED_BYTES, 0, 0),
         "FIRST_RAW_REMAINING_RECEIPT_SCOPE_DIFFERS")


def hash_raw_stream(stream, guard):
    digest = hashlib.sha256()
    count = 0
    while True:
        guard.checkpoint()
        block = stream.read(1024 * 1024)
        if not block:
            return count, digest.hexdigest()
        digest.update(block)
        count += len(block)


def raw_archive_files(data, guard):
    files = {}
    directories = set()
    names = set()
    with tarfile.open(fileobj=io.BytesIO(data), mode="r|gz") as archive:
        for row in archive:
            guard.checkpoint()
            p = member_name(row)
            need(str(p) not in names and (row.isfile() or row.isdir()), "FIRST_RAW_ARCHIVE_MEMBER_DIFFERS")
            names.add(str(p))
            directories.update(str(parent) for parent in p.parents if str(parent) != ".")
            if row.isdir():
                directories.add(str(p))
            else:
                size, digest = hash_raw_stream(archive.extractfile(row), guard)
                need(size == row.size, "FIRST_RAW_ARCHIVE_SIZE_DIFFERS")
                files[str(p)] = (size, digest)
    need(len(files) == 31 and sum(size for size, _ in files.values()) == RAW_EXPANDED_BYTES
         and not files.keys() & directories and files.get("manifest.json", (None, None))[1] == RAW_MANIFEST,
         "FIRST_RAW_ARCHIVE_CLOSURE_DIFFERS")
    return files, directories


def raw_directory(ops, path):
    s = ops.trusted(path).lstat()
    need(stat.S_ISDIR(s.st_mode) and (s.st_uid, s.st_gid, s.st_dev, stat.S_IMODE(s.st_mode)) == (0, 0, 66304, 0o700),
         "FIRST_RAW_EXISTING_DIRECTORY_DIFFERS")
    return s


def verify_raw_members(ops, package, files, directories, expected, guard):
    actual = {}

    def walk(directory, relative):
        directory_identity = ops.local_copy_identity(raw_directory(ops, directory))
        fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME)
        try:
            need(ops.local_copy_identity(os.fstat(fd)) == directory_identity, "FIRST_RAW_DIRECTORY_CHANGED")
            with os.scandir(fd) as entries:
                for row in entries:
                    guard.checkpoint()
                    member = str(relative / row.name)
                    path = directory / row.name
                    if row.is_dir(follow_symlinks=False):
                        need(member in directories, "FIRST_RAW_UNEXPECTED_DIRECTORY")
                        walk(path, relative / row.name)
                        continue
                    need(member in expected, "FIRST_RAW_UNEXPECTED_LEAF")
                    size, digest = files[member]
                    child = os.open(row.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK, dir_fd=fd)
                    with os.fdopen(child, "rb") as stream:
                        before = os.fstat(child)
                        need(stat.S_ISREG(before.st_mode) and (before.st_uid, before.st_gid, before.st_dev,
                             stat.S_IMODE(before.st_mode), before.st_nlink, before.st_size) == (0, 0, 66304, 0o400, 1, size),
                             "FIRST_RAW_LEAF_IDENTITY_OR_SIZE_DIFFERS")
                        stamp = ops.local_copy_identity(before)
                        need(hash_raw_stream(stream, guard) == (size, digest), "FIRST_RAW_LEAF_SHA_DIFFERS")
                        need(stamp == ops.local_copy_identity(os.fstat(child)) == ops.local_copy_identity(path.lstat()),
                             "FIRST_RAW_LEAF_CHANGED")
                        actual[member] = stamp
            need(ops.local_copy_identity(os.fstat(fd)) == ops.local_copy_identity(directory.lstat()) == directory_identity,
                 "FIRST_RAW_DIRECTORY_CHANGED")
        finally:
            os.close(fd)

    walk(package, PurePosixPath())
    need(actual.keys() == expected, "FIRST_RAW_EXPECTED_MEMBER_SET_DIFFERS")
    return actual


def publish_raw_binding(path, snapshot, checkpoint):
    data = (json.dumps(snapshot, sort_keys=True) + "\n").encode()
    checkpoint()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", buffering=0, closefd=False) as output:
            write_guarded_raw(output, data, checkpoint)
            checkpoint()
            os.fchmod(fd, 0o600)
            checkpoint()
            os.fsync(fd)
    finally:
        os.close(fd)
    checkpoint()
    sync_guarded_raw_directory(path.parent, checkpoint)


def materialize_raw_remaining(ops, job, binding, progress):
    progress["stage"] = "EXACT_PREFLIGHT"
    require_raw_native_plan(ops, job, binding)
    raw_remaining_receipts(ops)
    state = ops.trusted(ops.ROOT / "state")
    package = ops.SHARED_REAL_PACKAGE
    private = state / ops.REAL_ROOT.name
    binding_path = state / "shared-real-package-binding.json"
    for path in (state / ops.FIRST_WORK, binding_path, ops.ROOT / "production-start-intent.json",
                 ops.ROOT / "production-container-receipt.json"):
        need(not os.path.lexists(path), "FIRST_RAW_REMAINING_PATH_ALREADY_PRESENT")
    need(not ops.run(["docker", "ps", "-a", "--filter", "name=^/" + ops.NAME + "$", "--format", "{{.ID}}"]).strip(),
         "FIRST_MATERIAL_TARGET_CONTAINER_PRESENT")
    raw_directory(ops, package.parent)
    raw_directory(ops, private)
    staging_names = {"reports", "tmp", "sqlite-scratch", "approvals"}
    need({p.name for p in private.iterdir()} == staging_names, "FIRST_RAW_RUNTIME_STAGING_DIFFERS")
    for name in staging_names:
        path = private / name
        raw_directory(ops, path)
        need(not any(path.iterdir()), "FIRST_RAW_RUNTIME_STAGING_NOT_EMPTY")

    with RawVolumeGuard(ops, state, binding["expiresAt"], progress) as guard:
        guard.phase("VAULT_AND_ARCHIVE_READ")
        data = ops.staged_artifact(RAW_KEY, "manifestSha256", RAW_MANIFEST, RAW_BYTES, RAW_SHA,
                                   binding["stageAuthoritySha256"], binding["stageReadySha256"])
        files, directories = raw_archive_files(data, guard)
        preserved = set(list(files)[:2])
        pin = (json.dumps(sorted(preserved), separators=(",", ":")) + "\n").encode()
        need(sha(pin) == RAW_PRESERVED_SET_SHA and sum(files[n][0] for n in preserved) == RAW_PRESERVED_BYTES,
             "FIRST_RAW_PRESERVED_ARCHIVE_SET_DIFFERS")
        guard.phase("VERIFY_EXISTING_TWO")
        initial = verify_raw_members(ops, package, files, directories, preserved, guard)
        package_identity = raw_directory(ops, package)
        guard.phase("EXTRACT_READ")
        extract_raw(ops, data, package, guard.checkpoint, preserved=preserved, phase=guard.phase)
        guard.phase("VERIFY_ALL_MEMBERS")
        actual = verify_raw_members(ops, package, files, directories, files.keys(), guard)
        need(all(actual[name] == stamp for name, stamp in initial.items()), "FIRST_RAW_PRESERVED_INODE_CHANGED")
        after = raw_directory(ops, package)
        need((after.st_dev, after.st_ino) == (package_identity.st_dev, package_identity.st_ino),
             "FIRST_RAW_PACKAGE_ROOT_CHANGED")
        guard.phase("BINDING_SNAPSHOT")
        snapshot = ops.shared_real_package_snapshot()
        expected_members = [
            {"path": name, "device": stamp[0], "inode": stamp[1], "bytes": stamp[5],
             "mtimeNs": stamp[7], "ctimeNs": stamp[8]}
            for name, stamp in sorted(actual.items())
        ]
        need(snapshot["members"] == expected_members
             and snapshot["directory"] == {"device": after.st_dev, "inode": after.st_ino},
             "FIRST_RAW_BINDING_SNAPSHOT_DIFFERS_FROM_VERIFIED_FILES")
        guard.phase("BINDING_PUBLISH")
        publish_raw_binding(binding_path, snapshot, guard.checkpoint)
        guard.phase("BINDING_READBACK")
        need(ops.shared_real_package_binding() == package, "FIRST_MATERIAL_INPUT_BINDING_READBACK_DIFFERS")
        guard.checkpoint()
        final_free = guard.free
    return {"status": "FIRST_R1_PRIVATE_INPUT_REMAINING_MATERIALIZED", "archiveSha256": RAW_SHA,
            "manifestSha256": RAW_MANIFEST, "expandedBytes": RAW_EXPANDED_BYTES, "members": 31,
            "sourceBindings": {key: binding[key] for key in RAW_REMAINING_PINS},
            "existingReused": 2, "missingWritten": 29, "existingOverwritten": 0, "preservedInodes": True,
            "freeBeforeBytes": guard.free_before, "freeAfterBytes": final_free,
            "archiveTransferred": False, "PGConnections": 0}


def tool_files(ops, data, tool):
    files = {}
    directories = set()
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        for member in archive:
            name = str(member_name(member))
            need(name not in files and name not in directories, "FIRST_TOOL_DUPLICATE_ARCHIVE_MEMBER")
            if member.isdir():
                need(member.mode == 0o755, "FIRST_TOOL_DIRECTORY_MODE_DIFFERS")
                directories.add(name)
            else:
                need(member.isfile() and member.mode == 0o444 and member.size <= 1048576, "FIRST_TOOL_REGULAR_MEMBER_REQUIRED")
                files[name] = archive.extractfile(member).read()
    directories.update(str(parent) for name in files for parent in PurePosixPath(name).parents if str(parent) != ".")
    need(not set(files) & directories and len(files) == 361 and len(directories) == 52
         and sum(map(len, files.values())) == tool["expandedBytes"], "FIRST_TOOL_ARCHIVE_CLOSURE_DIFFERS")
    manifest_path = "metadata/resource-manifest.json"
    raw = files[manifest_path]
    need(sha(raw) == tool["manifest"], "FIRST_TOOL_MANIFEST_DIGEST_DIFFERS")
    manifest = ops.strict(raw)
    need(manifest["sourceCommit"] == tool["commit"] and manifest["sourceSetSha256"] == tool["source"]
         and manifest["operationFiles"] == 357, "FIRST_TOOL_SOURCE_DIFFERS")
    expected = {v["path"]: v for v in manifest["files"]}
    need(len(expected) == 360 and len([n for n in expected if n.startswith("operation/")]) == 357
         and set(files) == set(expected) | {manifest_path}, "FIRST_TOOL_MANIFEST_MEMBERS_DIFFERS")
    for name, item in expected.items():
        need(len(files[name]) == item["bytes"] and sha(files[name]) == item["sha256"] and item["mode"] == 0o444,
             "FIRST_TOOL_MANIFEST_MEMBER_DIFFERS")
    return files, directories


def materialize_tool(ops, job, binding):
    tool = TOOL_MATERIALS[job.name]
    plan = ops.load_production_plan(str(job / "bundle/production-plan.json"), binding["planSha256"])
    facts = ops.production_facts(plan)
    installed = facts["sharedPostgresNamespace"]
    need(facts["status"] == "DURABLE_PRODUCTION_SHARED_NAMESPACE_FACTS_NOT_DEPLOYMENT_APPROVAL"
         and facts["cid"] == binding["containerId"]
         and installed["targetSha256"] == binding["targetSha256"]
         and installed["installationRecordSha256"] == binding["installationRecordSha256"],
         "FIRST_TOOL_ACTUAL_INSTALLATION_REQUIRED")
    root = tool["root"]
    dest = ops.ROOT / "state" / Path(root).parent.name
    parent = ops.trusted(dest.parent)
    need(parent.stat().st_dev == 66304 and not dest.exists() and not dest.is_symlink(),
         "FIRST_TOOL_ROOT_OR_REPLAY_DIFFERS")

    def budget(seconds=0):
        v = os.statvfs(parent)
        need(int(time.time() * 1000) + seconds * 1000 < binding["expiresAt"]
             and parent.stat().st_dev == 66304 and v.f_bavail * v.f_frsize >= ops.REAL_STOP_FLOOR,
             "FIRST_TOOL_WINDOW_OR_SPACE_DIFFERS")

    data = ops.staged_artifact(tool["key"], "sourceSetSha256", tool["source"], tool["archiveBytes"], tool["archive"],
                               binding["stageAuthoritySha256"], binding["stageReadySha256"])
    files, directories = tool_files(ops, data, tool)
    budget()
    dest.mkdir(mode=0o755)
    ops.syncdir(parent)
    for name in sorted(directories, key=lambda n: (len(PurePosixPath(n).parts), n)):
        (dest / name).mkdir(mode=0o755)
    for name, data in files.items():
        budget()
        path = dest / name
        ops.new_file(path, data, 0o444)
        need((ops.read_file(path, len(data)) == data if data else path.lstat().st_size == 0),
             "FIRST_TOOL_EXTRACTED_MEMBER_DIFFERS")

    code = ("import{pathToFileURL as url}from'node:url';const S=" + json.dumps(root)
            + ";const m=await import(url(S+'/scripts/release/unified-install/fresh35-combined-source-v1.mjs'));"
            + "const d=m.describeFresh35CombinedSource(await m.loadFresh35CombinedSource(S,"
            + "await m.resolveFresh35ReferenceInputPaths(" + json.dumps(ops.DEPLOY + "/reference-inputs")
            + ")));console.log(JSON.stringify({node:process.version,sourceSetSha256:d.sourceSetSha256,"
            + "pins:d.currentSourcePins.length}));")
    docker = ["docker", "exec", "--user", "0:0", facts["cid"], ops.DEPLOY + "/runtime/node/bin/node",
              "--no-global-search-paths"]
    budget(30)
    load = ops.strict(ops.run(docker + ["--input-type=module", "-e", code], seconds=30))
    need(load == {"node": "v24.21.0", "sourceSetSha256": tool["source"], "pins": 216}, "FIRST_TOOL_LINUX_LOAD_DIFFERS")
    budget(30)
    help_result = ops.strict(ops.run(docker + [root + "/tools/unified-import/cli.mjs", "--help"], seconds=30))
    need(help_result.get("usage", "").startswith("node tools/unified-import/cli.mjs validate "),
         "FIRST_TOOL_LINUX_CLI_HELP_DIFFERS")
    observed = ops.production_facts(plan)
    need(observed["carrier"] == facts["carrier"] and observed["pgProcess"] == facts["pgProcess"]
         and observed["sharedPostgresNamespace"] == installed, "FIRST_TOOL_CARRIER_CHANGED")
    budget()
    return {"status": "FIRST_R1_EXACT_TOOL_MATERIALIZED_AND_LINUX_LOADED", "archiveSha256": tool["archive"],
            "sourceSetSha256": tool["source"], "materializedFiles": len(files), "loader": load,
            "cliHelpExit": 0, "PGConnections": 0}


def load_carrier(bundle, raw, binding, job_key):
    source = bundle / "fresh35-production-carrier.py"
    need(sha(source.read_bytes()) == binding["opsSourceSha256"], "FIRST_MATERIAL_CARRIER_SOURCE_DIFFERS")
    spec = importlib.util.spec_from_file_location("first_material_carrier", source)
    ops = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ops)
    tool = TOOL_MATERIALS.get(job_key)
    expected_source = (tool or TOOL_MATERIALS[TOOL_JOB])["source"]
    if job_key == TOOL_SUCCESSOR_JOB:
        carrier_source = getattr(ops, "REAL_OPERATION_SUCCESSOR_SOURCE", None)
        carrier_root = getattr(ops, "REAL_OPERATION_SUCCESSOR_ROOT", None)
    elif job_key == TOOL_RECOVERY_JOB:
        carrier_source, carrier_root = getattr(ops, "REAL_RECOVERY_OPERATION", None) or (None, None)
    else:
        carrier_source = ops.REAL_OPERATION_SOURCE
        carrier_root = ops.REAL_OPERATION_ROOT if tool is not None else None
    need(ops.read_file(source, 262144, True) == source.read_bytes()
         and ops.read_file(bundle / "materialization-binding.json", 65536, True) == raw
         and ops.strict(raw) == binding and str(ops.ROOT) == FIRST_ROOT
         and carrier_source == expected_source and ops.SHARED_REAL_MANIFEST == RAW_MANIFEST
         and (tool is None or carrier_root == tool["root"]),
         "FIRST_MATERIAL_FIXED_CARRIER_TARGET_REQUIRED")
    return ops


def main():
    os.umask(0o022)
    sys.dont_write_bytecode = True
    job = Path(os.environ["ERP_SHARED_JOB_DIR"])
    need((job.name in (RAW_JOB, RAW_REMAINING_JOB) or job.name in TOOL_MATERIALS) and job.parent ==
         Path("/root/erp-release-20261006-01-worker/grant-5cc58239751e4e2a/jobs")
         and os.getuid() == os.geteuid() == 0 and os.environ.get("ERP_SHARED_TASK_ID") == "T45"
         and len(sys.argv) == 2, "ORIGINAL_T45_MATERIAL_JOB_REQUIRED")
    result = {"status": "STOP_OR_UNKNOWN_PARTIAL_MATERIAL_PRESERVED_NO_REPLAY", "jobId": job.name}
    progress = {"stage": "FROZEN_INPUT"}
    try:
        bundle = job / "bundle"
        raw = (bundle / "materialization-binding.json").read_bytes()
        need(sha(raw) == sys.argv[1], "FIRST_MATERIAL_EXTERNAL_BINDING_DIGEST_DIFFERS")
        binding = json.loads(raw)
        check_binding(binding, job.name, int(time.time() * 1000))
        ops = load_carrier(bundle, raw, binding, job.name)
        if job.name == RAW_REMAINING_JOB:
            result.update(materialize_raw_remaining(ops, job, binding, progress))
        else:
            phase = materialize_raw if job.name == RAW_JOB else materialize_tool
            result.update(phase(ops, job, binding))
    except Exception as error:
        result["safeCode"] = str(error) if isinstance(error, ValueError) and re.fullmatch("[A-Z0-9_]+", str(error)) else type(error).__name__
        if job.name == RAW_REMAINING_JOB:
            result["failureStage"] = error.stage if isinstance(error, RawSampleError) else progress["stage"]
    with (job / "results/first-r1-materialization.json").open("x") as stream:
        json.dump(result, stream, indent=2)
        stream.write("\n")
    return 0 if result["status"].startswith("FIRST_R1_") else 2


if __name__ == "__main__":
    raise SystemExit(main())
