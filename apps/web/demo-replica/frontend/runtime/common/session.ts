import { createAuthHttpClient } from '../../../../src/authentication/http-client.ts';
import { AuthenticationController, readContextAuthenticationLifecycle } from '../../../../src/authentication/model.ts';
import { ReadContext } from '../../../../src/loading/read-scope.ts';
import type { HttpQueryOptions } from '../../../../src/transport/http-query.ts';

/** The copied Demo's host supplies the same-origin backend explicitly. No reads at import/construction. */
export function createReplicaSession(options: HttpQueryOptions) {
  const http = Object.freeze({ ...options });
  const reads = new ReadContext();
  const auth = new AuthenticationController({
    client: createAuthHttpClient(http),
    onIdentityChange: readContextAuthenticationLifecycle(reads),
  });
  return Object.freeze({
    http, reads, auth,
    /** A forbidden scope must be reverified on explicit re-entry, never reused or retried here. */
    onAccessFailure(error: { readonly kind: string }): void {
      if (error.kind === 'unauthenticated') auth.expire();
      else if (error.kind === 'forbidden') reads.clear();
    },
    dispose(): void { auth.dispose(); reads.clear(); },
  });
}

export type ReplicaSession = ReturnType<typeof createReplicaSession>;
