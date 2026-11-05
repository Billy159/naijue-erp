/** Public refusal diagnostics only. This module cannot admit a target, read an
 * installation record, load a package, or choose a historical host fallback. */
export const FRESH35_RECEIVER_TARGET_PROFILE = 'FRESH35_RETIRED152_V1';
export const FRESH35_RECEIVER_BLOCK_CODE = 'FRESH35_FIXED_RECORD_INSTALLER_AND_HOST_NOT_WIRED';

export const FRESH35_RECEIVER_CAPABILITY = Object.freeze({
  diagnostic_version: 'FRESH35_RECEIVER_DIAGNOSTIC_V1',
  target_profile: FRESH35_RECEIVER_TARGET_PROFILE,
  selection_option: '--target-profile',
  state: 'NOT_WIRED',
  code: FRESH35_RECEIVER_BLOCK_CODE,
  installation_ready: false,
  target_admitted: false,
  host_wired: false,
  fixed_installation_record_implemented: false,
  public_cli_end_to_end_validated: false,
  automatic_fallback: false,
  message: 'Fresh35 has source-only preparation, but no reviewed fixed installation record or connected import host. Selecting it stops before reading package or private inputs. It never falls back to a historical177/178 host.',
});

/** Exact explicit selection is diagnostic, never execution authorization. */
export function fresh35ReceiverBlocked(profile: string) {
  if (profile !== FRESH35_RECEIVER_TARGET_PROFILE) throw new Error('OPTION_INVALID');
  return Object.freeze({
    ...FRESH35_RECEIVER_CAPABILITY,
    state: 'NOT_STARTED',
    business_database_writes: false,
    connection_attempted: false,
    package_read: false,
    private_inputs_read: false,
    report_written: false,
    postgresql_acceptance: 'NOT_RUN',
    verification: Object.freeze({ state: 'NOT_RUN' }),
  });
}
