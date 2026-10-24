import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { ReplicaSession } from './common/session.ts';

export { createReplicaSession } from './common/session.ts';
export type { ReplicaSession } from './common/session.ts';

const SessionContext = createContext<ReplicaSession | null>(null);

/** C mounts this once with the copied Demo host. Identity updates never recreate its root. */
export function ReplicaSessionProvider({ session, children }: { readonly session: ReplicaSession; readonly children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useReplicaSession(): ReplicaSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('The copied Demo host must provide its session.');
  return session;
}

export function useReplicaAuthentication() {
  const { auth } = useReplicaSession();
  return useSyncExternalStore(auth.subscribe, auth.getSnapshot, auth.getSnapshot);
}

export { mountNormalReplica } from './common/runtime-host.tsx';
export type { ReadyPageOptions, MountedReplicaPage } from './common/ready-pages.tsx';

/** Original MATRIX_REPORT.create loads only on the output action. */
export async function createReplicaWorkbook(rows: readonly (readonly string[])[], title: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await (await import('./common/original-workbook.ts')).createOriginalWorkbook(rows, title));
}
