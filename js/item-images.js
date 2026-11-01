// One report image resolver shared by student and admin report views.
// Saved user photos stay first; same-item local assets are ordered by fit.
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

const imageCatalog = [
  { src: '/images/black%20earbuds.png', type: 'earbuds', colors: ['black'], terms: ['earbuds', 'ear buds', 'earphones'], generic: true },
  { src: '/images/earbuds.jpeg', type: 'earbuds', colors: ['white'], terms: ['earbuds', 'ear buds', 'earphones'], generic: true },
  { src: '/images/airpods.jpeg', type: 'airpods', colors: ['white'], brands: ['apple'], terms: ['airpods', 'air pod'], generic: true },
  { src: '/images/powerbank_mobile.png', type: 'powerbank', colors: ['black'], terms: ['powerbank', 'power bank'], generic: true },
  { src: '/images/bottle.jpeg', type: 'bottle', colors: ['green'], terms: ['bottle', 'water bottle'], generic: true },
  { src: '/images/charger%20laptop.png', type: 'laptop-charger', colors: ['black'], brands: ['hp'], terms: ['laptop charger', 'laptop adapter', 'charger'], generic: true },
  { src: '/images/keys.jpeg', type: 'keys', colors: ['silver', 'black'], terms: ['keys', 'keychain'], generic: true },
  { src: '/images/document.jpeg', type: 'document', colors: ['tan', 'brown'], terms: ['document', 'folder', 'file'], generic: true },
  { src: '/images/collegeid.png', type: 'college-id', colors: ['green', 'white'], terms: ['college id', 'student id', 'id card'], generic: true }
];

const normalize = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const includesPhrase = (text, phrase) => !!normalize(phrase) && (` ${normalize(text)} `).includes(` ${normalize(phrase)} `);
const colorAliases = {
  black: ['black', 'charcoal'], white: ['white', 'ivory'], blue: ['blue', 'navy', 'cobalt'],
  red: ['red', 'maroon', 'crimson'], green: ['green', 'olive'], silver: ['silver', 'grey', 'gray', 'metallic'],
  brown: ['brown', 'tan', 'beige'], pink: ['pink'], purple: ['purple', 'violet']
};
const knownBrands = [...new Set(imageCatalog.flatMap((image) => image.brands || []))];

function readColor(value = '') {
  const text = normalize(value);
  return Object.entries(colorAliases).find(([, aliases]) => aliases.some((alias) => includesPhrase(text, alias)))?.[0] || '';
}

function reportText(report) {
  return [report.itemName, report.category, report.description, report.brand, report.model, report.modelNumber, report.identifyingDetails].filter(Boolean).join(' ');
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
  return knownBrands.find((brand) => includesPhrase(text, brand)) || normalize(report.brand);
}

function isUsableImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const url = value.trim();
  if (/^data:image\/(?:png|jpe?g|webp|gif|avif|svg\+xml);/i.test(url)) return true;
  try {
    const parsed = new URL(url, 'https://nexusfind.invalid/');
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isBundledImageUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.startsWith('data:image/')) return false;
  try { return new URL(value, 'https://nexusfind.invalid/').pathname.startsWith('/images/'); }
  catch { return false; }
}

function scoreImage(report, image, requestedColor, requestedBrand, requestedModel) {
  const decodedPath = decodeURIComponent(image.src.split('/').pop() || '').replace(/\.[^.]+$/, '');
  const filename = normalize(decodedPath);
  const name = normalize(report.itemName);
  const allText = normalize(reportText(report));
  let score = 0;
  if (requestedColor && image.colors.includes(requestedColor)) score += 100;
  if (requestedBrand && image.brands?.includes(requestedBrand)) score += 80;
  if (requestedModel && image.models?.some((model) => includesPhrase(allText, model))) score += 60;
  if (image.terms.some((term) => includesPhrase(name, term))) score += 25;
  if (includesPhrase(allText, filename)) score += 20;
  if (image.terms.some((term) => includesPhrase(report.description, term))) score += 5;
  if (image.generic) score += 1;
  return score;
}

export function getReportImageCandidates(report = {}) {
  const candidates = [];
  // Prioritize uploaded URLs; locally bundled defaults are re-ranked against
  // the report fields so a stale default cannot override a better exact match.
  const saved = [report.imageUrl, report.image].find((value) => isUsableImageUrl(value) && !isBundledImageUrl(value));
  if (saved) candidates.push(saved.trim());

  const type = detectType(report);
  if (!type) return [...new Set(candidates)];
  const requestedColor = readColor(report.color) || readColor(report.itemName) || readColor(report.description) || readColor(report.identifyingDetails);
  const requestedBrand = detectBrand(report);
  const requestedModel = normalize(report.model || report.modelNumber);
  const matches = imageCatalog
    .filter((image) => image.type === type)
    // A known color or brand on an asset is meaningful. Do not show a
    // conflicting variant when the report specifies a different one.
    .filter((image) => !requestedColor || !image.colors.length || image.colors.includes(requestedColor))
    .filter((image) => !requestedBrand || !image.brands?.length || image.brands.includes(requestedBrand))
    .map((image) => ({ image, score: scoreImage(report, image, requestedColor, requestedBrand, requestedModel) }))
    .sort((a, b) => b.score - a.score);
  candidates.push(...matches.map(({ image }) => image.src));
  return [...new Set(candidates)];
}

export function getReportImageMatch(report = {}) {
  const firstLocal = getReportImageCandidates({ ...report, imageUrl: '', image: '' })[0];
  return imageCatalog.find((image) => image.src === firstLocal) || null;
}

export function getReportImageUrl(report = {}) {
  return getReportImageCandidates(report)[0] || null;
}

// Reuse this load-error behavior in all report card/detail views. Each image
// tries its ranked same-item fallbacks before exposing a neutral placeholder.
export function bindReportImageFallback(container = document) {
  container.querySelectorAll('img[data-report-image]').forEach((image) => {
    if (image.dataset.fallbackBound === 'true') return;
    image.dataset.fallbackBound = 'true';
    image.addEventListener('error', () => {
      let failedUrl = image.currentSrc || image.src;
      try { const parsed = new URL(failedUrl); parsed.search = ''; failedUrl = parsed.href; } catch { /* Preserve data or relative URL for diagnostics. */ }
      console.warn('[REPORT IMAGE] Image failed to load:', {
        reportId: image.dataset.reportId || null,
        itemName: image.alt,
        imageUrl: failedUrl
      });
      let fallbacks = [];
      try { fallbacks = JSON.parse(image.dataset.imageFallbacks || '[]'); } catch { /* Malformed fallback data ends at placeholder. */ }
      const next = fallbacks.shift();
      if (typeof next === 'string' && next) {
        image.dataset.imageFallbacks = JSON.stringify(fallbacks);
        image.src = next;
        return;
      }
      const placeholder = document.createElement('span');
      placeholder.className = 'image-placeholder image-placeholder-error';
      placeholder.setAttribute('role', 'img');
      placeholder.setAttribute('aria-label', 'No image available');
      placeholder.textContent = 'No image available';
      image.replaceWith(placeholder);
    });
  });
}
