"""Preflight the final bundle, request and authority argument before using the original client."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
CLIENT = REPO.parent / "monitor/normal-admission-20261112-01/admin_client-t45-code-transport-v2.py"
CLIENT_SHA256 = "846e3dd51c7607b01c7e73b36f73c6edec03d3be981b2f40bf2bed14db7d2e54"
RULES_SHA256 = '5d0ab4760c08e3614b6b0914e69d09c8e53a37348d2aaa1a8cd31e92335bf2cf'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def need(condition, code):
    if not condition:
        raise ValueError(code)


def canonical_request(policy, prepared, phase, bundle):
    rule = policy["jobs"][phase]
    baseline = prepared["jobs"][phase]
    pins = rule["bundlePins"]
    extra = set(prepared["externallyIssuedStaticLeaves"].get(phase, []))
    need({k: v for k, v in rule.items() if k != "bundlePins"}
         == {k: v for k, v in baseline.items() if k != "bundlePins"}
         and set(pins) == set(baseline["bundlePins"]) | extra
         and all(pins[k] == v for k, v in baseline["bundlePins"].items()),
         "FROZEN_RULE_DIFFERS")
    leaf = rule["authorityLeaf"]
    need(bundle.resolve() == bundle and bundle.is_dir(), "EXACT_BUNDLE_DIRECTORY_REQUIRED")
    need({p.name for p in bundle.iterdir()} == set(pins) | {leaf}, "EXACT_BUNDLE_FILES_REQUIRED")
    rows = []
    for path in sorted(bundle.iterdir()):
        need(path.is_file() and not path.is_symlink(), "REGULAR_MEMBER_REQUIRED")
        raw = path.read_bytes()
        need(len(raw) <= 4 * 1024**2 and raw.decode().encode() == raw and b"\r" not in raw,
             "EXACT_CLIENT_TEXT_BYTES_REQUIRED")
        pin = digest(raw)
        rows.append(dict(name=path.name, bytes=len(raw), sha256=pin))
        if path.name == leaf:
            authority = json.loads(raw)
            authority_pin = pin
        else:
            need(pins[path.name] == pin, "STATIC_MEMBER_DIFFERS")
    key = rule["jobId"]
    now = time.time_ns() // 1000000
    need(type(authority["startsAt"]) is int and type(authority["expiresAt"]) is int
         and authority["requestKey"] == key and policy["startsAt"] <= authority["startsAt"] <= now
         and now + rule["timeoutSeconds"] * 1000 < authority["expiresAt"] <= policy["expiresAt"],
         "EXACT_DYNAMIC_AUTHORITY_OR_BUDGET_DIFFERS")
    manifest = (json.dumps(dict(taskId="T45", jobId=key, files=rows), sort_keys=True) + "\n").encode()
    request = dict(taskId="T45", jobId=key, grantId=policy["grantId"], scope="ERP_EXISTING_TASKS_THROUGH_T51",
                   script=rule["script"], args=[authority_pin], timeoutSeconds=rule["timeoutSeconds"],
                   manifestSha256=digest(manifest), gateEvidence={}, taskEvidence={}, businessCutoverConfirmed=False)
    return request, authority_pin


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=("materialize", "apply", "start", "install", "writer", "stop", "restore"))
    parser.add_argument("policy", type=Path)
    parser.add_argument("policy_sha256")
    parser.add_argument("authority_sha256")
    parser.add_argument("bundle", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--execute", action="store_true")
    params = parser.parse_args()
    policy = params.policy.read_bytes()
    prepared = (HERE / "PHASES31.UNISSUED.json").read_bytes()
    need(digest(policy) == params.policy_sha256 and digest(prepared) == RULES_SHA256
         and digest(CLIENT.read_bytes()) == CLIENT_SHA256, "EXACT_LOCAL_INPUT_PINS_REQUIRED")
    policy = json.loads(policy)
    need(policy["grantId"] == "b16447fbc81f4d64", "EXACT_GRANT_REQUIRED")
    request, authority_pin = canonical_request(policy, json.loads(prepared), params.phase, params.bundle)
    need(authority_pin == params.authority_sha256, "EXTERNALLY_ISSUED_AUTHORITY_PIN_REQUIRED")
    argv = ["run", "--task", "T45", "--job-id", request["jobId"], "--source-dir", str(params.bundle),
            "--script", request["script"], "--output-dir", str(params.output),
            "--timeout-seconds", str(request["timeoutSeconds"]), "--phase-arg", authority_pin]
    actual_args = [argv[i+1] for i, value in enumerate(argv[:-1]) if value == "--phase-arg"]
    need(request["args"] == actual_args == [authority_pin], "CLI_AUTHORITY_DIGEST_ARGUMENT_REQUIRED")
    print(json.dumps({"status": "EXACT_MANIFEST_AND_REQUEST_PREFLIGHT", "request": request}), flush=True)
    if not params.execute:
        return 0
    with (params.output / "SUBMISSION-PREFLIGHT.json").open("x") as out:
        json.dump(request, out, indent=2)
        out.write("\n")
    result = subprocess.run([sys.executable, str(CLIENT), *argv])
    if result.returncode:
        return result.returncode
    receipt = params.output / ("release-submission-" + request["jobId"] + ".json")
    need(json.loads(receipt.read_bytes()) == request, "SUBMITTED_REQUEST_DIFFERS_READ_ORIGINAL_KEY")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
