import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Deliberately fixed to the sole administrator account requested for NexusFind.
const PROJECT_ID = 'nexusfind-7f8fc';
const DESIGNATED_EMAIL = 'shrushtipj2610@gmail.com';

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });

try {
  const auth = getAuth();
  let user;
  try {
    user = await auth.getUserByEmail(DESIGNATED_EMAIL);
  } catch (error) {
    if (error.code === 'auth/invalid-email' || error.code === 'auth/user-not-found') {
      throw new Error(`No Firebase Authentication account was found for the exact email ${DESIGNATED_EMAIL}. Use the account's actual Firebase Auth email; do not substitute a username or profile field.`);
    }
    throw error;
  }

  if (user.email?.toLowerCase() !== DESIGNATED_EMAIL.toLowerCase()) {
    throw new Error('Firebase Authentication returned an account whose email does not match the designated address. No role was changed.');
  }

  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
  const verified = await auth.getUser(user.uid);
  if (verified.email?.toLowerCase() !== DESIGNATED_EMAIL.toLowerCase() || verified.customClaims?.admin !== true) {
    throw new Error('The claim assignment could not be verified.');
  }
  console.log(`Verified admin claim for ${verified.email} (UID ${verified.uid}) in Firebase project ${PROJECT_ID}.`);
  console.log('The user must refresh their ID token by signing out and back in; NexusFind also forces a token refresh when checking admin access.');
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
