const normalize = (value = '') => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/\bear\s+buds?\b/g, 'earbuds');

const synonyms = {
  mobile: 'phone', cellphone: 'phone', handset: 'phone',
  sneakers: 'shoes', spectacles: 'glasses',
  earphone: 'earbuds', earphones: 'earbuds', earbud: 'earbuds'
};

const tokens = (value = '') => new Set(normalize(value).split(' ')
  .filter((word) => word.length > 1)
  .map((word) => synonyms[word] || word));

function similarity(a, b) {
  const left = tokens(a), right = tokens(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  left.forEach((word) => { if (right.has(word)) common += 1; });
  return common / Math.max(left.size, right.size);
}

function readDate(value) {
  if (value?.toDate instanceof Function) return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value.trim()) return NaN;
  const date = value.trim();
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : date);
}

function dateScore(lost, found) {
  const lostDate = readDate(lost.dateLost || lost.date);
  const foundDate = readDate(found.dateFound || found.date);
  if (!Number.isFinite(lostDate) || !Number.isFinite(foundDate)) return 0;
  const days = Math.floor(Math.abs(lostDate - foundDate) / 86400000);
  if (days === 0) return 5;
  if (days <= 7) return 4;
  if (days <= 30) return 3;
  if (days <= 60) return 2;
  if (days <= 90) return 1;
  return 0;
}

// The weights total 100. Missing values add no points; dates and locations
// influence confidence but never prevent otherwise similar reports matching.
export function calculateMatchScore(lost, found) {
  const matchedFields = [];
  let score = 0;
  const add = (field, points) => {
    const value = Math.max(0, Math.round(points));
    score += value;
    if (value > 0) matchedFields.push(field);
  };

  const lostCategory = normalize(lost.category);
  add('category', lostCategory && lostCategory === normalize(found.category) ? 25 : 0);
  add('itemName', similarity(lost.itemName, found.itemName) * 25);
  add('color', similarity(lost.color, found.color) * 15);
  add('description', similarity(lost.description, found.description) * 20);
  add('location', similarity(lost.location, found.location) * 10);
  add('date', dateScore(lost, found));

  return {
    score: Math.min(100, score),
    matchLevel: score >= 80 ? 'strong' : score >= 60 ? 'possible' : 'none',
    matchedFields
  };
}
