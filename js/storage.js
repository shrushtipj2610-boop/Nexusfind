import { getDownloadURL, getStorage, ref, uploadBytesResumable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { app, auth, isConfigured } from './firebase.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png'];

export function validateItemImage(file) {
  if (!(file instanceof File)) throw new Error('Please choose an image file.');
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error('Please select a PNG or JPG image.');
  if (file.size > MAX_FILE_SIZE) throw new Error('Image size must be 5MB or less.');
}

export async function uploadItemImage(file, onProgress) {
  if (!file) return null;
  if (!isConfigured || !app || !auth) throw new Error('Firebase Storage is not configured.');
  validateItemImage(file);
  if (!auth.currentUser?.uid) throw new Error('Please sign in before uploading an image.');
  const storage = getStorage(app);
  const objectPath = `item-images/${auth.currentUser.uid}/${crypto.randomUUID()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
  const task = uploadBytesResumable(ref(storage, objectPath), file, { contentType: file.type });
  await new Promise((resolve, reject) => task.on('state_changed', (snapshot) => onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)), (error) => reject(new Error(error.message || 'Firebase Storage could not upload this image.')), resolve));
  return getDownloadURL(task.snapshot.ref);
}
