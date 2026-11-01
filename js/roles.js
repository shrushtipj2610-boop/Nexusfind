// A Firestore users/{uid} role is trusted only when all identity fields match
// the signed-in Firebase Authentication account. Firestore rules enforce the
// same check before granting any administrative operation.
export function matchesAdminUserProfile(profile, uid, email) {
  return Boolean(uid && email && profile
    && profile.uid === uid
    && profile.email === email
    && profile.role === 'admin');
}
