/** The normal workbench includes category by default. Only additional product
 * metadata and the optional size guide need the original wider identity. */
export function inventoryMatrixDimensions(settings: {
  readonly supplier: boolean; readonly fit: boolean; readonly sizeGroup: boolean;
  readonly season: boolean; readonly sizeDescription: boolean;
}) {
  const compact = !settings.supplier && !settings.fit && !settings.sizeGroup && !settings.season && !settings.sizeDescription;
  // 11 default size tracks, including 无尺码, fit a 1318px matrix.
  const fixedColumns = [compact ? 148 : 300, 116, 152, 76, 70] as const;
  return { compact, fixedColumns, fixedWidth: fixedColumns.reduce((sum, width) => sum + width, 0), minimumSizeWidth: compact ? 68 : 76 };
}
