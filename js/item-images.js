// Project images inspected from /images. Saved uploads or explicitly saved
// image URLs always take priority over these bundled defaults.
const itemTypes = [
  { id: 'laptop-charger', aliases: ['laptop charger', 'charger laptop', 'notebook charger', 'laptop adapter', 'power adapter', 'charger'] },
  { id: 'college-id', aliases: ['college id', 'collegeid', 'student id', 'identity card', 'id card', 'idcard'] },
  { id: 'powerbank', aliases: ['powerbank', 'power bank', 'portable charger', 'portable power bank'] },
  { id: 'airpods', aliases: ['airpods', 'airpod', 'air pods', 'air pod'] },
  { id: 'earbuds', aliases: ['earbuds', 'earbud', 'ear buds', 'ear bud', 'earphones', 'earphone', 'wireless buds', 'headphones', 'headphone'] },
  { id: 'bottle', aliases: ['water bottle', 'bottle', 'flask', 'thermos'] },
  { id: 'keys', aliases: ['bunch of keys', 'keychain', 'key chain', 'keys', 'key'] },
  { id: 'document', aliases: ['documents', 'document', 'personal file', 'folder', 'file'] }
];

// Colors reflect the actual image contents. Generic fallbacks are only used
// when the requested color has no exact bundled match for the same item type.
const imageCatalog = [
  { src: '/images/black%20earbuds.png', type: 'earbuds', colors: ['black'], terms: ['black earbuds', 'black ear buds'], generic: false },
  { src: '/images/earbuds.jpeg', type: 'earbuds', colors: ['white'], terms: ['earbuds', 'earphones'], generic: true },
  { src: '/images/airpods.jpeg', type: 'airpods', colors: ['white'], brands: ['apple'], terms: ['airpods'], generic: true },
  { src: '/images/powerbank_mobile.png', type: 'powerbank', colors: ['black'], terms: ['powerbank', 'power bank'], generic: true },
  { src: '/images/bottle.jpeg', type: 'bottle', colors: ['green'], terms: ['bottle', 'water bottle'], generic: true },
  { src: '/images/charger%20laptop.png', type: 'laptop-charger', colors: ['black'], brands: ['hp'], terms: ['laptop charger', 'laptop adapter', 'charger'], generic: true },
  { src: '/images/keys.jpeg', type: 'keys', colors: ['silver', 'black'], terms: ['keys', 'keychain'], generic: true },
  { src: '/images/document.jpeg', type: 'document', colors: ['tan', 'brown'], terms: ['document', 'folder', 'file'], generic: true },
  { src: '/images/collegeid.png', type: 'college-id', colors: ['green', 'white'], terms: ['college id', 'student id', 'id card'], generic: true }
];

const normalize = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const includesPhrase = (text, phrase) => (` ${normalize(text)} `).includes(` ${normalize(phrase)} `);
const colorAliases = {
  black: ['black', 'charcoal'], white: ['white', 'ivory'], blue: ['blue', 'navy', 'cobalt'],
  red: ['red', 'maroon', 'crimson'], green: ['green', 'olive'], silver: ['silver', 'grey', 'gray', 'metallic'],
  brown: ['brown', 'tan', 'beige'], pink: ['pink'], purple: ['purple', 'violet']
};
function readColor(value = '') {
  const text = normalize(value);
  return Object.entries(colorAliases).find(([, aliases]) => aliases.some((alias) => includesPhrase(text, alias)))?.[0] || '';
}
function detectType(report) {
  const fields = [report.itemName, report.category, report.description, report.brand, report.identifyingDetails].filter(Boolean);
  for (const field of fields) {
    const match = itemTypes.find((type) => type.aliases.some((alias) => includesPhrase(field, alias)));
    if (match) return match.id;
  }
  return '';
}
function detectBrand(report) {
  const text = normalize([report.brand, report.itemName, report.description, report.identifyingDetails].filter(Boolean).join(' '));
  return imageCatalog.flatMap((image) => image.brands || []).find((brand) => includesPhrase(text, brand)) || '';
}

export function getReportImageMatch(report = {}) {
  const type = detectType(report);
  if (!type) return null;
  const requestedColor = readColor(report.color) || readColor(report.itemName) || readColor(report.description) || readColor(report.identifyingDetails);
  const requestedBrand = detectBrand(report);
  const candidates = imageCatalog.filter((image) => image.type === type);
  if (!candidates.length) return null;
  return candidates.map((image) => {
    let score = image.generic ? 10 : 0;
    if (requestedColor && image.colors.includes(requestedColor)) score += 100;
    else if (requestedColor && !image.generic) score -= 20;
    if (requestedBrand && image.brands?.includes(requestedBrand)) score += 35;
    if (image.terms.some((term) => includesPhrase(report.itemName, term))) score += 12;
    if (image.terms.some((term) => includesPhrase(report.description, term))) score += 3;
    return { ...image, score, matchedBy: [requestedColor && image.colors.includes(requestedColor) ? requestedColor : '', requestedBrand && image.brands?.includes(requestedBrand) ? requestedBrand : '', type].filter(Boolean) };
  }).sort((a, b) => b.score - a.score)[0];
}

export function getReportImageUrl(report = {}) {
  const saved = [report.imageUrl, report.image].find((value) => typeof value === 'string' && value.trim());
  if (saved) return saved.trim();
  return getReportImageMatch(report)?.src || null;
}
