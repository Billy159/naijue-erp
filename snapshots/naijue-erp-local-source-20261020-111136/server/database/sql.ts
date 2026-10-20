export function sqlLiteral(value: string): string { return "'" + value.replaceAll("'", "''") + "'"; }
export function sqlBlock(value: string): string {
  let tag = '$t08$';
  while (value.includes(tag)) tag = tag.replace('$t08', '$t08x');
  return tag + value + tag;
}
