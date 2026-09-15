import { getDownloadURL, ref, uploadBytesResumable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { auth, isConfigured, storage } from './firebase.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png'];

export function validateItemImage(file) {
  if (!(file instanceof File)) throw new Error('Please choose an image file.');
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error('Please select a PNG or JPG image.');
  if (file.size > MAX_FILE_SIZE) throw new Error('Image size must be 5MB or less.');
}

export async function uploadItemImage(file, onProgress) {
  if (!file) return null;
  if (!isConfigured || !storage || !auth) throw new Error('Firebase Storage is not configured.');
  validateItemImage(file);
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Please sign in before uploading an image.');

  // Refresh the Firebase Auth token before creating the Storage task. This is
  // important immediately after sign-in, when Storage otherwise may begin a
  // request without the authenticated token required by storage.rules.
  await user.getIdToken();
  const objectPath = `item-images/${user.uid}/${crypto.randomUUID()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
  const task = uploadBytesResumable(ref(storage, objectPath), file, { contentType: file.type });

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      const message = error?.message || 'Firebase Storage could not upload this image.';
      reject(new Error(message));
    };

    task.on('state_changed',
      (snapshot) => {
        const total = snapshot.totalBytes || file.size;
        const progress = total ? Math.round((snapshot.bytesTransferred / total) * 100) : 0;
        onProgress?.(Math.min(100, Math.max(0, progress)));
      },
      fail,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const parsedUrl = new URL(url);
          if (!/^https?:$/.test(parsedUrl.protocol)) throw new Error('Firebase returned an invalid image URL.');
          if (settled) return;
          settled = true;
          onProgress?.(100);
          resolve(url);
        } catch (error) {
          fail(error);
        }
      }
    );
  });
}
