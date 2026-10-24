import type { DocumentResponsibleStaffCapability } from '../../../../src/application/contracts.ts';
import { createCurrentFormHttpReader } from '../../../../src/current-form/http-reader.ts';
import { createSalesExistingPreparationHttpClient } from '../../../../src/current-form/existing-document-preparation.ts';
import { SalesProposalSession } from '../../../../src/current-form/sales-proposal.ts';
import { SalesNewDocumentSession, createSalesPreparationHttpClient } from '../../../../src/current-form/sales-create.ts';
import { createSalesHttpReader } from '../../../../src/sales/http-reader.ts';
import { createSalesPageController } from '../../../../src/sales/controller.ts';
import { createSalesCommandHttpClient } from '../../../../src/sales/commands/http-client.ts';
import { SalesEditorSession } from '../../../../src/sales/commands/editor-session.ts';
import type { ReplicaSession } from '../common/session.ts';

/** One session per actual Demo document workspace; retain it when its DOM is detached.
 * The original proposal/preparation/command owners retain exact money, SKU preparation,
 * immutable creator, responsibility and original-key recovery semantics.
 */
export function createReplicaSalesSession(runtime: ReplicaSession, options: {
  readonly instanceId: string;
  readonly newRequestKey: () => string;
  readonly responsibleStaff?: DocumentResponsibleStaffCapability;
}) {
  const principal = runtime.auth.getSnapshot().principal;
  if (!principal) throw new Error('An authenticated session is required to open sales.');
  const scope = runtime.reads.createScope(options.instanceId);
  const reader = createSalesHttpReader(runtime.http);
  const current = createCurrentFormHttpReader(runtime.http);
  const list = createSalesPageController(scope, reader);
  const proposal = new SalesProposalSession(scope, current, runtime.onAccessFailure);
  const editor = new SalesEditorSession({
    scope, principal, reader,
    client: createSalesCommandHttpClient(runtime.http),
    newRequestKey: options.newRequestKey,
    onAccessFailure: runtime.onAccessFailure,
    existingPreparation: createSalesExistingPreparationHttpClient(runtime.http),
    existingReader: current,
    ...(options.responsibleStaff ? { responsibleStaff: options.responsibleStaff } : {}),
  });
  const create = new SalesNewDocumentSession({ scope, proposal, editor,
    preparation: createSalesPreparationHttpClient(runtime.http),
    onAccessFailure: runtime.onAccessFailure,
  });
  return Object.freeze({ scope, reader, current, list, proposal, editor, create,
    dispose(): void { scope.dispose(); create.dispose(); proposal.dispose(); editor.dispose(); list.dispose(); },
  });
}

export type ReplicaSalesSession = ReturnType<typeof createReplicaSalesSession>;
