# Assign NexusFind's designated administrator

Admin authorization uses the Firebase Authentication custom claim `admin: true`. Firestore Security Rules check the signed ID token claim directly. A profile field, local storage value, client email comparison, or `/admins/{uid}` document does not grant access. Public signup cannot assign custom claims.

The provisioner is deliberately hardcoded to the designated address `shrushtipj2610@gmail.com` and Firebase project `nexusfind-7f8fc`. It resolves the account through Firebase Authentication, checks the exact email, assigns only that account's admin claim, then reloads the user record and verifies the claim. It preserves any existing custom claims. If Firebase reports `user-not-found`, stop and verify the exact email stored in Firebase Authentication. Do not use a display name or Firestore profile value as a substitute.

## Run the trusted provisioning script

Run this from a trusted operator workstation with project-owner permissions. The Firebase Admin SDK credentials stay outside the website and repository.

1. Install the Admin SDK for the one-time script: `npm install --prefix scripts firebase-admin`.
2. Authenticate Application Default Credentials for an operator identity authorized to manage Firebase Authentication in project `nexusfind-7f8fc`. For example, use `gcloud auth application-default login` with the authorized Google account. Do not put a service-account key in the web app or commit it.
3. Run: `node scripts/grant-designated-admin.mjs`.
4. Confirm the output says it verified the exact account and UID. If it errors, the account has not been configured.
5. Deploy Firestore rules: `firebase deploy --only firestore:rules`.
6. Sign out and back in to NexusFind. The app forces an ID-token refresh while checking access, and the user must sign in again to obtain the new claim.

To revoke access, use a trusted Firebase Admin SDK operation to remove only the `admin` custom claim from this account (preserving other claims), then have the user refresh/sign in again. The updated rules and dashboard no longer trust legacy `/admins/{uid}` documents.

## Claim and match workflows

Admin ownership claims in `claims` are separate from reporter-to-reporter match confirmation records in `matches`. A match request remains pending until the other reporter confirms it. For linked lost/found matches, the lost-report owner can submit a distinct ownership claim for administrator review; the My Claims UI explains this next action. Admin claim approval reserves the found item under the existing pickup workflow. The item becomes recovered only after the claimant confirms receipt.

## Backend scope

Claim decisions, notifications, report access, user listing, and admin audit writes are guarded by Firestore Rules using the custom claim. User account suspension still requires a trusted backend using the Firebase Admin SDK and is not exposed as a client action.
