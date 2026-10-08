# Release signing and crash reporting

## Android release key

Release APKs are signed with Tekmadev's own key. Versions up to 0.4.1 were signed with the
shared Android debug key, which every React Native developer has, so anyone could have
built an "update" that a phone would accept. Only Tekmadev can sign updates now.

### Where it lives

The key is in `credentials/android/` at the project root:

- `tekmadev-release.keystore`: the key itself (PKCS12, alias `tekmadev`, RSA 4096, valid until 2054).
- `keystore.properties`: where the keystore is, its alias and its password.

The `credentials/` folder is in `.gitignore`: it is never committed or pushed. `npm run apk`
reads it on every build (`plugins/withReleaseSigning.js`). If the folder is missing, the build
still works but signs with the debug key and prints a warning, and that APK will not install
over the app on your phone.

### Never lose it

Android only installs an update when it is signed with the same key as the app already on
the phone. **If this key is lost, the app can never be updated again**: every phone would have
to uninstall it and install a new app from scratch. There is no way to recover or reset the
key. If it leaks, someone else could sign an update, so keep it private.

### Back it up now

Back up the whole `credentials/` folder (both files together: the password is inside
`keystore.properties`). Keep at least two copies, one of them off this Mac. Either:

- **Password manager**: create a secure note named "Tekmadev Admin Android release key" and
  attach both files (1Password, Bitwarden and most others accept attachments).
- **Encrypted drive**: on the Mac, Disk Utility > File > New Image > Blank Image, choose
  128-bit or 256-bit AES encryption, copy the folder in, and keep the image on a USB drive or
  in cloud storage. The image password goes in your password manager.

To check a backup, restore it to a temporary folder and run (it asks for the password in
`keystore.properties`; it should print `tekmadev, ... PrivateKeyEntry`):

```bash
keytool -list -keystore credentials/android/tekmadev-release.keystore
```

On a new Mac, copy the folder back to `credentials/` at the project root before building.

### One-time uninstall on phones with the old app

A phone that has a debug-signed version (0.4.1 or earlier) cannot update to a version signed
with the new key. Once per phone:

1. Uninstall Tekmadev Admin (long-press the icon, then Uninstall).
2. Install the new APK.

When the phone is connected, `npm run apk` detects this case and prints
`INSTALL_NEEDS_UNINSTALL`. After uninstalling, install the same APK again (no new version needed):

```bash
adb install -r dist/tekmadev-admin-<version>.apk
```

You sign in again afterwards, and app settings (biometric unlock, theme) start fresh.
Nothing on the server changes.

## Sentry setup (crash reporting)

The app reports crashes and unexpected errors to Sentry. It sends no names, emails, client
or lead details, screenshots or screen recordings: only the error, the device model and OS,
the app version, and the signed-in admin's id. Development builds never report.

1. **Account**: create a free account at sentry.io (the Developer plan is enough).
2. **Project**: create a project, platform React Native, named for example `tekmadev-admin`.
   Note the organization slug and the project slug (both appear in the project's URL).
3. **DSN**: in Sentry, Project Settings > Client Keys (DSN), copy the DSN and add it to `.env`:

   ```bash
   EXPO_PUBLIC_SENTRY_DSN=https://...ingest.sentry.io/...
   ```

   The DSN can only send reports, so it is safe inside the app. The next `npm run apk` turns
   reporting on. To check it works, open that build once: its version appears under Releases
   in Sentry within a few minutes.
4. **Auth token** (readable stack traces): in Sentry, Settings > Developer Settings >
   Organization Tokens > Create New Token. Copy `.env.sentry.local.example` to
   `.env.sentry.local` at the project root and fill in the token, the organization slug and
   the project slug. The file is gitignored; never commit the token. From then on, every
   `npm run apk` and `scripts/ios-device.sh` uploads the source maps (and the iOS debug
   symbols) for that build. Without the file, builds still work: they just skip the upload.
5. **Privacy settings** (recommended): in Sentry, Project Settings > Security & Privacy, turn
   on "Prevent Storing of IP Addresses" and keep the data scrubbers on.

## In-app updates (publishing a build)

Every `npm run apk` also publishes the new APK so phones offer it ("Update available" on Home
and About, and "Check for updates"). Tapping Download asks the server for a fresh link, the
phone downloads the APK, and Android installs it over the old version (same Tekmadev key, so
sign-in and data stay; the first time, Android asks to allow installs from the browser).

How it works:

- `scripts/publish-apk.mjs` uploads the APK to the private Supabase bucket `app-releases` as
  `android/tekmadev-admin.apk` (replaced each time), then writes `latestVersion` and
  `apkPath` into the `site_settings` row `mobile_app`. It refuses to go back to an older
  version than the one the server already offers.
- The website's GET /me (signed-in staff only) answers `app.apkUrl` with a signed link to that
  file, valid six hours. The bucket is private: nobody downloads the app without signing in.
- The free Supabase plan takes files up to 50 MB. Native libraries are compressed in the APK
  (`useLegacyPackaging`), which keeps it near 36 MB. If a build ever passes 50 MB, the publish
  step says so and the APK is still in `dist/` to share by hand.

One-time setup (owner):

1. Run `supabase/migrations/20261008000100_app_releases_bucket.sql` (website repo) in the
   Supabase SQL editor. It creates the private bucket.
2. In `.env.release.local` at this project's root (gitignored; `.env.release.local.example`
   shows the shape), paste the server key after `SUPABASE_SERVICE_ROLE_KEY=`. It is in
   Supabase > Project Settings > API Keys (the secret or `service_role` key). Never commit it.
3. Put the website change live (branch `app-updates`).

`NO_PUBLISH=1 npm run apk -- minor` builds without publishing. To publish an APK that is
already built: `node scripts/publish-apk.mjs dist/tekmadev-admin-<version>.apk <version>`.
