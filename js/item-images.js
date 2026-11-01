// Shared report image resolver: saved image references always win; legacy
// reports with null/empty imageUrl use their matching original project asset.
const imageRules = [
  { aliases: ['college id', 'collegeid', 'student id', 'identity card', 'id card', 'idcard'], src: '/images/collegeid.png' },
  { aliases: ['laptop charger', 'charger laptop', 'notebook charger', 'laptop adapter'], src: '/images/charger%20laptop.png' },
  { aliases: ['powerbank', 'power bank', 'portable power bank'], src: '/images/powerbank_mobile.png' },
  { aliases: ['airpods', 'airpod'], src: '/images/airpods.jpeg' },
  { aliases: ['earbuds', 'earbud', 'ear buds', 'ear bud', 'earphones', 'earphone', 'headphones', 'headphone'], src: '/images/earbuds.jpeg' },
  { aliases: ['keys', 'keychain', 'key chains', 'bunch of keys', 'key'], src: '/images/keys.jpeg' },
  { aliases: ['bottle', 'water bottle'], src: '/images/bottle.jpeg' },
  { aliases: ['document', 'documents', 'personal file', 'file'], src: '/images/document.jpeg' }
];

const normalize = (value = '') => ` ${String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')} `;
function matchKnownImage(value) {
  const text = normalize(value);
  return imageRules.find((rule) => rule.aliases.some((alias) => text.includes(normalize(alias))))?.src || null;
}

export function getReportImageUrl(report = {}) {
  const saved = [report.imageUrl, report.image].find((value) => typeof value === 'string' && value.trim());
  if (saved) return saved.trim();
  // Item name is authoritative. Search description only when the name itself
  // does not identify one of the known original assets.
  return matchKnownImage(report.itemName) || matchKnownImage(report.description) || null;
}

