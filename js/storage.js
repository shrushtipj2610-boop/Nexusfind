// Cloudinary settings. Change CLOUD_NAME only if your Cloudinary cloud name changes.
const CLOUD_NAME = 'ntlghwez';
const UNSIGNED_UPLOAD_PRESET = 'Nexusfind_uploads';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function uploadItemImage(file) {
  if (!file) return null;
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Please select a PNG, JPG, or WEBP image.');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Image size must be 5MB or less.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UNSIGNED_UPLOAD_PRESET);
  formData.append('folder', 'nexusfind-reports');

  let response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData
    });
  } catch {
    throw new Error('Image upload could not be started. Check your internet connection and try again.');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Cloudinary returned an invalid upload response. Please try again.');
  }
  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message || 'Cloudinary could not upload this image.');
  }
  return result.secure_url;
}
