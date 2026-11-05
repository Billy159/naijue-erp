/** Only inputs consumed by measured Identity metadata / section description.
 * Subtotal/total are model choices and must not invalidate row geometry. */
export function inventoryMeasurementKey(settings:{category:boolean;supplier:boolean;fit:boolean;sizeGroup:boolean;season:boolean;sizeDescription:boolean}):string {
 return [settings.category,settings.supplier,settings.fit,settings.sizeGroup,settings.season,settings.sizeDescription].map(value=>value?'1':'0').join('');
}
