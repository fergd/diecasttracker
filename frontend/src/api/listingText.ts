import { CONDITION_GRADE_LABELS, type InventoryItem } from './inventory';

const EBAY_TITLE_MAX = 80;

/** Collector-precise eBay title, e.g. "1998 Hot Wheels First Editions #17
 * Pontiac Rageous Blue TH" - generic titles get buried, exact terms get found.
 * Progressively drops the lowest-priority optional segments (series, then
 * car make, then color) to stay under eBay's 80-char title limit. */
export function generateListingTitle(item: InventoryItem): string {
  const year = item.year ?? '';
  const brand = item.brand ?? '';
  const casting = item.castingName ?? 'Diecast Car';
  const thSuffix = item.treasureHunt ?? '';
  const collectorTag = item.collectorNumber ? `#${item.collectorNumber}` : '';
  const series = item.series ?? '';
  const carMake = item.carMake && !casting.includes(item.carMake) ? item.carMake : '';
  const color = item.color ?? '';

  function build(includeSeries: boolean, includeCarMake: boolean, includeColor: boolean): string {
    return [
      year,
      brand,
      includeSeries ? series : '',
      collectorTag,
      includeCarMake ? carMake : '',
      casting,
      includeColor ? color : '',
      thSuffix,
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  let title = build(true, true, true);
  if (title.length > EBAY_TITLE_MAX) title = build(false, true, true);
  if (title.length > EBAY_TITLE_MAX) title = build(false, false, true);
  if (title.length > EBAY_TITLE_MAX) title = build(false, false, false);
  if (title.length > EBAY_TITLE_MAX) title = title.slice(0, EBAY_TITLE_MAX).trim();
  return title;
}

/** Full listing description: identity, variation details, and condition in
 * collector C-scale terms - signals hobby knowledge, builds buyer trust. */
export function generateListingDescription(item: InventoryItem): string {
  const lines: string[] = [];

  const identityHeader = [item.year, item.brand, item.series].filter(Boolean).join(' ');
  lines.push(`${identityHeader ? identityHeader + ' — ' : ''}${item.castingName ?? 'Unidentified casting'}`.trim());

  const details: string[] = [];
  if (item.collectorNumber) details.push(`Collector #${item.collectorNumber}`);
  if (item.carMake) details.push(item.carMake);
  if (item.color) details.push(item.color);
  if (item.treasureHunt) details.push(item.treasureHunt);
  if (item.baseCountry) details.push(`${item.baseCountry} base`);
  if (details.length) lines.push(details.join(' · '));

  const conditionLines: string[] = [];
  if (item.packagingType === 'carded') {
    if (item.conditionCardGrade) {
      conditionLines.push(`Card/bubble condition: ${item.conditionCardGrade} (${CONDITION_GRADE_LABELS[item.conditionCardGrade]})`);
    }
    if (item.conditionCarGrade) {
      conditionLines.push(`Car condition: ${item.conditionCarGrade} (${CONDITION_GRADE_LABELS[item.conditionCarGrade]})`);
    }
  } else if (item.conditionCarGrade) {
    conditionLines.push(`Condition: ${item.conditionCarGrade} (${CONDITION_GRADE_LABELS[item.conditionCarGrade]})`);
  }
  if (item.condition) conditionLines.push(item.condition);
  if (conditionLines.length) lines.push(conditionLines.join('\n'));

  return lines.join('\n\n');
}
