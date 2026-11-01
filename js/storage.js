// Store user-selected images as compact data URLs in the item's Firestore
// document. This avoids Firebase Storage (and its Blaze billing requirement).
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_STORED_IMAGE_SIZE = 650 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateItemImage(file) {
  if (!(file instanceof File)) throw new Error('Please choose an image file.');
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) throw new Error('Please select a JPG, JPEG, PNG, or WEBP image.');
  if (!file.size || file.size > MAX_FILE_SIZE) throw new Error('Image size must be 5MB or less.');
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the selected image.'));
    reader.onerror = () => reject(reader.error || new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file) {
  const source = await readDataUrl(file);
  const image = new Image();
  image.src = source;
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('The selected file is not a valid image.')); });
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image processing is unavailable in this browser.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.82, 0.68, 0.54, 0.4]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_STORED_IMAGE_SIZE) return dataUrl;
  }
  throw new Error('This image cannot be compressed small enough to save. Choose a smaller image.');
}

export async function uploadItemImage(file) {
  if (!file) return null;
  validateItemImage(file);
  return compressImage(file);
}
