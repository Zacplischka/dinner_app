# Native development

Implementation of [spec #459](https://github.com/Zacplischka/dinner_app/issues/459) is in progress. See [the evidence ledger](mobile-implementation-status.md) for passes and outstanding work. Generating projects or compiling an unsigned simulator app is not a physical-device, beta or release pass.

## Toolchain and configuration

Use Node 22+, Xcode with the matching iOS platform components, Java 21, and Android SDK platform 36. The current Android Gradle plugin also requests Build-Tools **35.0.0**; the platform/API number and build-tools version are separate. Capacitor and its native plugins are pinned in the workspace lockfile. Install with `npm ci` from the repository root; do not run separate package installs inside native projects.

The current package identity is provisional: `it.com.dinder.app` for release and `it.com.dinder.app.dev` for Debug. Confirm the legal publisher and permanent IDs before signing. Debug and release apps can coexist. The public name is YupCrew and new public links use `https://yupcrew.com`. Existing Dinder links remain supported; internal package and service identifiers are unchanged.

Create an ignored `frontend/.env.development.local` with the public service settings used by your test environment:

```dotenv
VITE_BACKEND_URL=http://localhost:3458
VITE_API_BASE_URL=http://localhost:3458/api
VITE_PUBLIC_ORIGIN=https://yupcrew.com
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Blank authentication settings deliberately leave guest flows usable. Native bridge logging is disabled because it can expose secure-plugin arguments. CSS owns safe-area spacing; iOS automatic content insets are disabled to avoid applying the same inset twice. For Android's emulator, use `10.0.2.2` to reach this Mac, or `adb reverse tcp:3458 tcp:3458` with localhost. The Android Debug configuration permits HTTP only to those loopback development destinations. Production retains cleartext denial. Physical devices need a reachable test backend; they cannot reach this Mac through their own localhost.

```sh
npm run build --workspace=shared
npm run mobile:sync --workspace=frontend -- development
```

This applies the pinned Android secure-storage correction, typechecks, builds bundled assets and syncs both projects. It never sets Capacitor `server.url`. Set corresponding public HTTPS endpoints and the Supabase publishable/anon key in `.env.staging.local` or `.env.production.local`, then substitute `staging` or `production`. Release configurations reject missing settings, loopback/private development hosts, embedded URL credentials, and secret/service-role keys. No operator key belongs in a `VITE_` variable.

Run `mobile:sync` after every clean `npm ci` before Android compilation. The [storage patch](../patches/capacitor-secure-storage-plugin+0.13.0.patch) removes the upstream dependency's plaintext fallback and makes storage failures observable. The preparation script requires Git and checks the pinned package version; Gradle checks the reviewed source hash and refuses an unpatched or unexpected helper. A web/backend-only install does not need native patch preparation. After any plugin or patch update, review the native source and update the guard deliberately.

With an Android emulator or test phone connected, run `./gradlew connectedDebugAndroidTest` from `frontend/android`. Set `ANDROID_SERIAL` to the intended device when more than one is connected. The storage tests use their own preference file/Keystore alias and verify encryption/corruption, failed initialization and failed disk commits. All three pass on the local `heykeen_api36` AOSP ARM64 emulator. An emulator run does not replace the physical mixed-client and process-termination checklist below.

## Compile without publishing

From `frontend`:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ../output/mobile/ios CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build
cd android
./gradlew assembleDebug
```

On this Mac, Homebrew installed Java 21 at `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` and the Android SDK at `/opt/homebrew/share/android-commandlinetools`; set `JAVA_HOME` and `ANDROID_HOME` to those paths for the Gradle command. No global shell configuration was changed.

Open the iOS project in Xcode or install the Android debug APK on a test device for native checks. The generated iOS target uses Swift Package Manager; its resolved dependency pins are included. The simulator command signs ad hoc to run locally; it does not contact a store or create distribution credentials. An unsigned build compiled but could not save secure recovery in the simulator. Use real developer signing for physical-device verification. Missing platform components must be installed through Xcode. The user authorized Android SDK licence acceptance and installation; Platform 36, Build-Tools 35.0.0 and platform-tools are installed, and the Debug app and instrumentation APKs compile successfully.

The available iPhone is an iPhone 12 Pro Max running iOS 26.6, connected by USB with Developer Mode enabled. The user has only a free Apple Personal Team. That supports the basic test install, but Associated Domains and Sign in with Apple require the paid Apple Developer Program. Any basic Personal Team prototype must be recorded separately from the required signed universal-link/authentication checks; do not remove those release entitlements to report a pass. [Apple capability availability](https://developer.apple.com/help/account/reference/supported-capabilities-ios/).

A separate **Heykeen Test** artifact is installed under the Debug ID. For this artifact only, the build used an empty Associated Domains entitlement file and a temporary Info.plist enabling local networking to this Mac's `.local` backend, with a local-network usage description. The project Info.plist was restored after compilation; the regular entitlement file retains its domains. The Personal Team profile expires on 15 September 2026. The first launch attempt returned iOS's security/trust denial; after the user trusted the developer, the app launched successfully. Keep both devices on the same Wi-Fi, and allow local-network access when testing the Mac backend. iPhone Mirroring needs Bluetooth enabled and the phone locked; if its controls fail, use direct phone interaction and label user-reported observations separately from automated evidence. Artifact/signing/install evidence is in `output/mobile/iphone-personal/`. This local build has deliberately blank authentication configuration and does not prove verified app links or provider callbacks.

Signed archive/AAB automation, signing recovery, build-number and artifact/symbol provenance remain outstanding. Native compile CI has been added as described below; its first hosted run is still pending. No command in this document submits to a store.

## Native compile CI

[Native compile checks](../.github/workflows/mobile-checks.yml) runs on pull requests targeting `main`, pushes to `main` and manual dispatch. Automatic runs are restricted to changes in frontend/shared code, workspace manifests and lockfile, npm configuration, mobile scripts, dependency patches and the workflow itself. It uses read-only repository permissions, does not retain checkout credentials and has no signing secrets. A newer run cancels the superseded run for the same PR/ref; failure on one platform does not cancel the other.

Both jobs use Node **22.23.2** and `npm ci` from the repository root. They run `node --test scripts/mobile-config.test.mjs scripts/mobile-associations.test.mjs`, build `@dinder/shared`, then run `npm run mobile:sync --workspace=@dinder/frontend -- development`. That existing command applies the storage patch, typechecks, bundles and syncs both native projects. CI uses public development settings with blank authentication configuration and needs no live backend.

| Job     | Runner/toolchain                                                          | Compilation                                                                                                               |
| ------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| iOS     | `macos-15`, Xcode **26.3**                                                | Generic iOS simulator Debug build with `CODE_SIGNING_ALLOWED=NO`, using the checked-in Swift Package Manager resolutions. |
| Android | `ubuntu-24.04`, Temurin **21.0.12+8**, SDK **36**, Build-Tools **35.0.0** | Checked-in Gradle wrapper runs `:app:assembleDebug :app:assembleDebugAndroidTest`.                                        |

The iOS output is unsigned and is only a compilation check; it does not establish Keychain access, entitlements, app links or physical installation. The local simulator command above uses ad hoc signing to permit runtime checks, and a physical iPhone needs developer signing. Android generates ordinary Debug-signed app and instrumentation APKs; compiling the instrumentation APK does not execute its tests. Neither job launches an app, creates a signed iOS archive/Android release bundle, uploads release artifacts or publishes anything.

The workflow definition passed local YAML, shell syntax, manifest/path and formatting checks, and the existing configuration/association tests passed. Those checks do not establish a successful GitHub run: the workflow is still local work and no hosted compile has been recorded. Establish its hosted behavior before treating it as a release gate or configuring required checks; its path filters must be accounted for in the repository's required-check policy. Signed distribution, controlled release credentials, crash symbols and artifact provenance remain separate work.

## Installed-client compatibility

[ADR 0007](adr/0007-contracts-evolve-additively-across-deployments.md#installed-clients) extends the additive backend contract to supported installed versions. There is no released native baseline yet. The first actual release must preserve its artifact identity and HTTP/Socket.IO contract fixtures; subsequent backend changes must test the oldest supported released contract, deploy compatible server behavior before app changes and prove a usable update/recovery path before retiring support. The compile workflow above does not perform this released-client compatibility check.

## Link and identity setup

Both native projects declare `/join`, `/session/…`, `/list/…` and `/auth/callback` for the existing canonical and legacy HTTPS hosts. Client parsing rejects unrelated hosts, credentials, fragments and malformed resource identifiers. Browser fallback retains its existing Join flow. A second Session still passes through the existing confirmation; a rejected resume requires deliberate new admission.

Prepare association files with real public signing identities:

```sh
APPLE_TEAM_ID=YOURTEAMID IOS_APP_ID=it.com.dinder.app \
ANDROID_APP_ID=it.com.dinder.app ANDROID_CERT_SHA256='YOUR:SHA256:FINGERPRINT' \
node scripts/mobile-associations.mjs
```

The example intentionally fails validation until replaced with actual IDs/fingerprints. The output is local in `output/mobile/associations`. Android production needs the **Play app-signing certificate**, not just the upload key. A locally signed/debug build needs its own matching application ID and signing certificate. Generate separately for the environment being verified.

Once approved for the intended environment, include those files under `frontend/public/.well-known/` in the website build. Both hostnames must serve their files as JSON over HTTPS without redirects or Cloudflare challenges; Caddy now returns a genuine 404 when absent. Association-file hosting has not been changed in production.

Native Google sign-in uses Supabase PKCE and the system browser, returning to the canonical `/auth/callback`. Configure that exact redirect in Supabase/provider settings and verify association delivery in a signed app. Authentication and the verifier use OS secure storage; guest recovery does not wait for Supabase. Apple sign-in, explicit provider linking, account deletion and live provider validation remain outstanding.

## Prototype checks

Use a physical iPhone, physical Android phone and browser Participant in one Session. Complete a Watch round, then exercise all Branches, Comparison streaming, sharing/cancellation, coarse/denied location, external handoffs and sign-in/cancellation. For recovery, background, lock, change network and terminate the process; test a missed Restart, expiry, Leave and an unknown mutation outcome. Confirm one identity, no stale Selections and no duplicate paid work.

The native store keeps only the current Participant, local Selection progress/round and Group Order reference; it refetches authoritative data. The single rejoin credential lives in secure storage. Cook View saves one list's progress until that list expires, and releases its native wake lock in the background or on exit. Browser identities remain isolated per tab.

Record physical hardware/OS, exact build and scenario result in the evidence ledger. The full security, social, safety, accessibility, reviewer and release matrices in the spec still apply after this prototype.
