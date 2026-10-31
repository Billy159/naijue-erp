import ts from 'typescript';
/** Driver-free review helpers for the inventory membership rewrite. These do not execute SQL. */
const projection = "SELECT s.id, s.product_id, s.color_id, s.fit_id, s.size_id, p.size_group_id FROM naijue_erp.sku s JOIN matched_products p ON p.id = s.product_id";
const previousProjection = "SELECT s.id, s.product_id, s.color_id, s.fit_id, s.size_id FROM naijue_erp.sku s JOIN matched_products p ON p.id = s.product_id";
const membership = `EXISTS (SELECT 1 FROM filtered_skus s WHERE NOT EXISTS (
      SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = s.size_group_id AND m.size_id = s.size_id)) AS invalid_sku_size`;
const previousMembership = `EXISTS (SELECT 1 FROM filtered_skus s JOIN matched_products p ON p.id = s.product_id WHERE NOT EXISTS (
      SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = p.size_group_id AND m.size_id = s.size_id)) AS invalid_sku_size`;

/** Reconstruct exactly the reviewed preceding expression, not a second implementation or production fallback. */
export function previousInventoryMembershipSource(source: string): string {
  if (source.split(projection).length !== 2 || source.split(membership).length !== 2)
    throw new Error("Expected one reviewed projected group and one catalog-status membership expression");
  return source.replace(projection, previousProjection).replace(membership, previousMembership);
}

/** Extract only the actual finite catalogue/status SQL. No JavaScript evaluation or query execution. */
export function inventoryCatalogStatusSql(source: string, seasonArray = false): string {
  if(typeof seasonArray!=='boolean')throw new Error('Explicit finite season selector required');
  const sf=ts.createSourceFile('inventory-query-reader.ts',source,ts.ScriptTarget.Latest,true);
  let catalogue:ts.Expression|undefined,status:ts.Expression|undefined,catalogues=0,statuses=0;
  const visit=(node:ts.Node):void=>{
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='catalog'){
      catalogues++;
      const fn=node.initializer;
      if(!fn||!ts.isArrowFunction(fn)||fn.parameters.length!==1||fn.parameters[0]!.name.getText(sf)!=='seasonArray'||ts.isBlock(fn.body))throw new Error('Unreviewed catalogue function');
      catalogue=fn.body;
    }
    if(ts.isFunctionDeclaration(node)&&node.name?.text==='catalogStatus'){
      const queries:ts.Expression[]=[];
      const query=(child:ts.Node):void=>{if(ts.isCallExpression(child)&&ts.isIdentifier(child.expression)&&child.expression.text==='query'){
        if(child.arguments.length!==2||child.arguments[1]!.getText(sf)!=='values')throw new Error('Unreviewed catalog-status query');queries.push(child.arguments[0]!);
      }ts.forEachChild(child,query);};query(node);
      statuses++;if(queries.length!==1)throw new Error('Expected one bounded catalog-status query');status=queries[0];
    }
    ts.forEachChild(node,visit);
  };visit(sf);
  if(catalogues!==1||statuses!==1||!catalogue||!status||!ts.isTemplateExpression(catalogue)||catalogue.templateSpans.length!==1||!ts.isTemplateExpression(status)||status.templateSpans.length!==1)throw new Error('Expected the reviewed finite inventory catalogue and status query');
  const span=catalogue.templateSpans[0]!,condition=span.expression;
  if(!ts.isConditionalExpression(condition)||!ts.isIdentifier(condition.condition)||condition.condition.text!=='seasonArray'
    ||!ts.isStringLiteral(condition.whenTrue)||condition.whenTrue.text!=='p.season_ids && $7::uuid[]'
    ||!ts.isStringLiteral(condition.whenFalse)||condition.whenFalse.text!=='p.season_id = ANY($7::uuid[])')throw new Error('Unreviewed catalogue interpolation');
  const catalogSql=catalogue.head.text+(seasonArray?condition.whenTrue.text:condition.whenFalse.text)+span.literal.text;
  const statusSpan=status.templateSpans[0]!;
  if(statusSpan.expression.getText(sf)!=='catalog(seasonArray)'||!status.head.text.startsWith('/* inventory:catalog-status */ '))throw new Error('Unreviewed catalog-status interpolation');
  const sql=status.head.text+catalogSql+statusSpan.literal.text;
  if(sql.includes('${'))throw new Error('Unresolved query interpolation is not accepted');
  return sql;
}
