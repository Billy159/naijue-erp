import { useEffect, useMemo } from 'react';
import { SalesPageHost } from '../../src/sales/sales-route.tsx';
import { createAcceptanceSales } from '../fixtures.ts';
import { acceptanceStylesheet } from '../styles.ts';
import type { AcceptanceRouteProps } from '../contracts.ts';
export function View({ scope, report }: AcceptanceRouteProps) {
  const fixture = useMemo(() => createAcceptanceSales(report), [report]);
  const styles = useMemo(() => acceptanceStylesheet(document, 'sales-detail.css'), [scope]);
  useEffect(() => () => styles.dispose(), [styles]);
  return <SalesPageHost scope={scope} reader={fixture.reader} references={fixture.references} loadDetailStyles={styles.load} />;
}
