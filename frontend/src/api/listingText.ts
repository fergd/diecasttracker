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
  const series = [item.series, item.seriesNumber].filter(Boolean).join(' ');
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

/** Possessive form of a brand name for the intro sentence, e.g. "Hot Wheels'"
 * (already ends in s, so no extra "s") vs "Matchbox's". */
function possessive(brand: string): string {
  return /s$/i.test(brand) ? `${brand}'` : `${brand}'s`;
}

/** Strips a trailing parenthetical code (e.g. "10-spoke (10SP)" -> "10-spoke")
 * for use in prose - the Details list below shows the fuller raw value. */
function wheelPhrase(wheelType: string): string {
  const stripped = wheelType.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return /wheels?$/i.test(stripped) ? stripped : `${stripped} wheels`;
}

/** "The {casting} from {brand}' {year} {series} series, {specialSeries}
 * sub-series, Collector #{n}. {color} body, {wheels} wheels." - degrades
 * gracefully by dropping whichever pieces are missing. */
function introSentence(item: InventoryItem): string {
  const casting = item.castingName ?? 'This diecast';
  const brand = item.brand ? ` from ${possessive(item.brand)}` : '';
  const seriesBits = [item.year, item.series ? `${item.series} series` : ''].filter(Boolean).join(' ');
  const subSeries = item.specialSeries ? `, ${item.specialSeries} sub-series` : '';
  const collector = item.collectorNumber ? `, Collector #${item.collectorNumber}` : '';
  const sentence1 = `The ${casting}${brand}${seriesBits ? ' ' + seriesBits : ''}${subSeries}${collector}.`.replace(
    /\s+/g,
    ' ',
  );

  const bodyBits = [item.color ? `${item.color} body` : '', item.wheelType ? wheelPhrase(item.wheelType) : '']
    .filter(Boolean)
    .join(', ');
  const sentence2 = bodyBits ? `${bodyBits}.` : '';

  return [sentence1, sentence2].filter(Boolean).join(' ');
}

function conditionParagraph(item: InventoryItem): string {
  const grades: string[] = [];
  if (item.packagingType === 'carded') {
    if (item.conditionCardGrade) {
      grades.push(`Card/bubble: ${item.conditionCardGrade} (${CONDITION_GRADE_LABELS[item.conditionCardGrade]})`);
    }
    if (item.conditionCarGrade) {
      grades.push(`Car: ${item.conditionCarGrade} (${CONDITION_GRADE_LABELS[item.conditionCarGrade]})`);
    }
  } else if (item.conditionCarGrade) {
    grades.push(`${item.conditionCarGrade} (${CONDITION_GRADE_LABELS[item.conditionCarGrade]})`);
  }
  const base = item.packagingType === 'carded' ? 'New, unopened box/blister' : 'Used';
  const gradeText = grades.length ? `, ${grades.join(', ')}` : '';
  const photoNote = item.packagingType === 'carded' ? 'See photos for exact card condition.' : 'See photos for exact condition.';
  const note = item.condition ? ` ${item.condition}` : '';
  return `Condition: ${base}${gradeText}. ${photoNote}${note}`;
}

/** Full listing description: an intro sentence, a bulleted Details list,
 * condition (C-scale grade appended when graded), and a fixed shipping/
 * sign-off blurb. */
export function generateListingDescription(item: InventoryItem): string {
  const details: string[] = [`Vehicle: ${item.castingName ?? 'Unidentified casting'}`];
  const series = [item.series, item.specialSeries].filter(Boolean).join(', ');
  if (series) details.push(`Series: ${series}`);
  if (item.collectorNumber) details.push(`Collector #: ${item.collectorNumber}`);
  if (item.year) details.push(`Year: ${item.year}`);
  details.push('Scale: 1:64');
  if (item.color) details.push(`Color: ${item.color}`);
  if (item.wheelType) details.push(`Wheels: ${item.wheelType}`);
  if (item.sku) details.push(`Toy # ${item.sku}`);
  if (item.treasureHunt) details.push(item.treasureHunt);
  if (item.baseCountry) details.push(`Base: ${item.baseCountry}`);
  if (item.bodyBaseConstruction) details.push(item.bodyBaseConstruction);
  if (item.specialFlags.length) details.push(...item.specialFlags);

  return [
    introSentence(item),
    ['Details:', '', ...details.map((d) => `• ${d}`)].join('\n'),
    conditionParagraph(item),
    'Shipping: Ships fast in a protective box with tracking.',
    'From a smoke-free, pet-free home. Thanks for looking!',
  ].join('\n\n');
}
