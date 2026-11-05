# Product soft-delete safety: isolated PostgreSQL negative check

Status: the code still rejects every product with one or more SKUs. This entry checks that conservative behavior; it is not a successful delete or proof that SKU-bearing deletion is safe. It was not run against PostgreSQL as part of this change.

The test requires a separately prepared, disposable, exclusive synthetic database whose schema, runtime grants, published baseline and guards are already installed. It does not create databases, install schema, grant privileges, construct fixture data, or contact any non-loopback address. The runtime and observer must be distinct existing users. The observer needs already-authorized complete read access, including the legacy history tables; `row_security=off` fails rather than hiding rows. No new database permission is granted by this test.

Provide `PRODUCT_DELETE_SYNTHETIC_PG` as JSON in the environment with:

- `confirmedSynthetic: true`, `confirmedDisposable: true`;
- `host` exactly `127.0.0.1` or `::1`, a non-default unprivileged `port`, and a database named `synthetic_delete_<suffix>`;
- `runtime` and `observer`, each an object with the existing `user` and `password`, and distinct usernames;
- `productId` for a synthetic, undeleted product with at least one SKU, and `actorAccountId` for its authorized synthetic administrator;
- `scenario`, either `zero-no-references` or `hidden-reference`.

The selected product must have at least one real warehouse, a known zero for every SKU/warehouse pair, no SKU barcode and no inventory ledger. A present balance must be zero; a missing balance is accepted only when the existing authorized baseline helper returns EXPLICIT_ZERO. Missing or unknown proof never counts as zero. For `zero-no-references`, the observer must see no sales, transfer, or legacy history line referencing any SKU. For `hidden-reference`, the observer must see an existing sales or transfer line belonging to an unpublished batch while the runtime sees no product document references. This latter state may not be constructible under the approved atomic whole-package flow. Do not disable guards, alter RLS, fabricate production data, or weaken installation to create it. If no valid fixture exists, report it as untested rather than treating it as a pass.

Run explicitly, after the target and fixture are prepared:

    node --test tests/integration/product-delete-safety/hidden-reference.real-pg.test.mjs

No credentials belong in files, shell history or reports. The environment variable is mandatory; no default target or skipped success is provided. The test checks database name, literal loopback server, port and database identity and checks for other sessions once before opening its runtime connection. The operator must independently keep the database exclusive for the entire test; a one-time check cannot prevent later connections. It inspects real database rows with an observer and uses the existing V27 runtime issuer and product service. Any unexpected successful service operation is forced to roll back inside the real unit of work, and the observer compares the product, SKU, barcode, images, stock, document lines and product evidence snapshot afterward. A failed or uncertain connection/rollback is a failure, not a retry or acceptance.

The loopback/name/confirmation checks reduce accidental targeting but cannot prove that a database contains only disposable data. An operator must independently verify that before running it. The test cannot establish all concurrent writers, RLS-hidden state, or warehouse-creation lock behavior and must not be treated as release clearance. Complete SKU-bearing deletion remains blocked until the actual deployed role can establish all references and a complete, race-safe warehouse/SKU inventory matrix without guessing missing stock as zero.
