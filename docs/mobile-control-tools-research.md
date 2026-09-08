# YupCrew mobile control research

Researched 8 September 2026. This note concerns development and testing controls, not application features. The historical installed test bundle is still labelled **Heykeen Repro**. No tools were installed and no device actions were performed by this research task.

## Authorized trial results, 8 September 2026

After the research, the user authorized setup. **AXe 1.8.0 now works on this Mac** with the iPhone 17 simulator (`FB56546B-EFCD-488F-A6E1-5BE9438EAA62`, iOS 26.3.1). Simulator.app was closed throughout; CoreSimulator was booted through `simctl`. Label and coordinate taps, scrolling, text entry, Home navigation and Home Screen page swiping produced verified changes. In the existing app, physical-style touch opened Watch setup, typing entered `AXe proof`, and Back returned Home. Screenshots and six assertions over saved accessibility trees provide the evidence in `output/mobile/control-proof/`.

The installed app's WebView content is absent from AXe's accessibility tree, so its controls currently require coordinates derived from a fresh screenshot. AXe coordinates use simulator points (402×874 here); screenshots use pixels (1206×2622). Wait for animations and reread state before declaring success. The first immediate Home snapshot was stale; the settled snapshot confirmed Home. No Session was submitted during this control proof.

Appium 3.7.0, XCUITest 12.10.0 and UiAutomator2 8.6.1 are installed locally. Both driver doctor checks report zero required fixes. A WDA runner with bundle ID `it.com.dinder.automation.WebDriverAgentRunner.xctrunner` builds successfully for the connected iPhone, signed by Personal Team `K96UNY9D9R`; its profile includes that phone and expires 15 September 2026.

**Physical iPhone control is also verified.** The first runner launch failed with `Timed out while enabling automation mode`. The user enabled Settings → Developer → Enable UI Automation; the otherwise identical session then connected in about 11 seconds. This setting is separate from Developer Mode. [Appium device preparation](https://appium.github.io/appium-xcuitest-driver/latest/getting-started/device-setup/).

On the iPhone 12 Pro Max running iOS 26.6, Appium scrolled Settings from 0% to 25%, tapped General, navigated back, entered `Wallpaper` into Search and returned to SpringBoard. In **Heykeen Test**, a native coordinate tap opened Watch setup, native text input entered `Appium proof`, Create session became enabled, Back returned to app Home, and Home returned to SpringBoard. The test text was cleared; no Session was submitted. Appium exposes the physical app's WebView accessibility labels without enabling Web Inspector. Saved XML assertions, active-app IDs and inspected screenshots support the result. Initial snapshots during Home/launch animations were stale; assertions use settled state.

The app was terminated after this short proof and the Appium session/server and WDA runner were stopped. The setup bypasses the Mac CUA error; it does not repair that service. The earlier freeze did not recur during this proof, but its cause and the full physical mixed-client journeys remain unverified. Android has passed toolchain checks only; no physical Android input pass is claimed.

Run `axe --help` for simulator commands and `appium --help` for the device server. Appium uses `~/.appium`; app workspace dependencies and shell startup configuration were not changed. Start the server bound to `127.0.0.1`. For Android, supply `ANDROID_HOME=/opt/homebrew/share/android-commandlinetools` and `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`. The local WDA project only has its runner bundle ID changed; its original project is backed up in `output/mobile/control-proof/WebDriverAgent.project.pbxproj.original`.

The reusable physical-device request is `output/mobile/control-proof/iphone-session-request.json`; it targets Settings and reuses the signed WDA under `wda-build`. Start `appium server --address 127.0.0.1 --port 4723`, then POST that JSON to `/session` with the phone unlocked. Each new session returns a new ID; do not reuse the ended proof session. Rebuild/re-sign the runner after its profile expires. Local proof artifacts include screen content from the owner's phone and remain ignored.

## Recommendation

Use **AXe for the immediate iOS Simulator control proof**, then **Appium XCUITest plus UiAutomator2 for repeatable mixed physical-device testing**. AXe is the narrowest packaged CLI for inspecting, tapping, swiping, typing and capturing a simulator. Appium has an explicit documented route for the user's free Apple Personal Team. These are recommendations inferred from their interfaces and setup requirements; neither has yet been proved on this Mac or the iPhone 12 Pro Max running iOS 26.6.

A current packaged **idb** installation is also a credible immediate option, especially if its broader device tooling is wanted. The existing pipx client is broken and lacks its companion; it is not a ready alternative. Do not install all the candidates together. Prove one route with a short observed interaction loop first.

## What is failing now

The coordinating investigation reports Codex **26.901.51231**, helper **26.831.1000926**, enabled permissions, working accessibility reads and screenshots, but coordinate actions failing with `noWindowsAvailable` before input delivery. It affects Simulator and System Settings. After a full restart, one Settings-icon tap succeeded; failures then returned on both iPhone 17 Pro and iPhone 17 simulators, including SpringBoard. Restarting has **not** established a fix. The Mac runs macOS **26.1**, with Xcode **26.3**, Node **24.14.1** and npm **11.11.0**; the phone runs iOS **26.6**. The same-build issue reporter has a different macOS version.

Related reports are in OpenAI's repository: [#43119](https://github.com/openai/codex/issues/43119) includes the same Codex build and Simulator reports; [#36459](https://github.com/openai/codex/issues/36459) includes the same helper version; [#38508](https://github.com/openai/codex/issues/38508) reports the iPhone Mirroring split between readable screens and failed input. The coordinator checked their live GitHub status: all three remained open, without a maintainer-confirmed fix. One reporter's manual foregrounding workaround did not work here. A comment reports an older host build working for Mirroring, but an unofficial rollback is unverified for this setup. Binary repacking and interposition wrappers are not proposed.

A simulator/device driver targets the mobile runtime directly. **Inference:** it avoids this particular Mac-window-discovery dependency; it does not automatically fix or explain the separate physical-phone freeze.

## Comparison

| Option | Supported targets relevant here | Interaction model and setup | Fit |
| --- | --- | --- | --- |
| **AXe** | iOS Simulator only; no physical iPhone or Android | Local CLI, simulator UDID, JSON accessibility tree, label/identifier or coordinate taps, gestures, typing, screenshots. Homebrew package includes its IDB framework integration. | Best narrow immediate candidate. Xcode 26 support is stated, with an explicitly tested 26.5 pairing; local Xcode 26.3 still needs verification. [Docs](https://www.axe-cli.com/docs), [installation](https://www.axe-cli.com/docs/installation). |
| **idb** | iOS simulators and devices, with command-specific differences | Python CLI plus native companion. Current accessibility operations are simulator-only; only a subset of HID operations work on devices. | Useful if repaired; not a replacement for a verified physical-iPhone gesture driver. [UI command support](https://fbidb.io/docs/idb/ui/), [architecture and installation](https://github.com/facebook/idb/blob/v1.5.2/README.md). |
| **Maestro** | iOS Simulator; Android emulator and physical device | YAML flows, CLI and bundled `maestro mcp`; accessibility hierarchy, native input, screenshots, assertions and automatic waits. Needs Java 17+, Xcode/Android tools. | Good concise journey tests and agent interaction; **physical iOS remains explicitly unsupported**. [iOS limitation](https://docs.maestro.dev/get-started/supported-platform/ios/uikit), [Android](https://docs.maestro.dev/get-started/supported-platform/android), [CLI](https://github.com/mobile-dev-inc/Maestro), [MCP](https://docs.maestro.dev/get-started/maestro-mcp). |
| **Appium XCUITest + UiAutomator2** | iOS simulator/physical and Android emulator/physical | Local Appium 3 server with two drivers; WebDriver clients or HTTP commands. XCUITest uses an installed WebDriverAgent test runner; Android uses UiAutomator2/ADB. | Broadest fit for one persistent agent/test API, native gestures and optional DOM contexts. More setup and signing than AXe. [iOS architecture](https://appium.github.io/appium-xcuitest-driver/latest/overview/), [Android requirements](https://github.com/appium/appium-uiautomator2-driver/tree/v8.6.1). |
| **Apple XCUITest directly** | Apple simulator/device test destinations; no Android | Swift/Objective-C UI tests compiled and run with Xcode or `xcodebuild test`; native element queries, tap/swipe/type/screenshot APIs. | No additional automation framework, but test-target setup and compile/run cycles make it less convenient for exploratory agent control. [XCUIAutomation](https://developer.apple.com/documentation/XCUIAutomation), [XCUIElement](https://developer.apple.com/documentation/xcuiautomation/xcuielement), [command-line tests](https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results). |
| **Mobile Next Mobile MCP** | Claims all four mobile target types | Structured device tools for screenshots, hierarchy, tap/swipe/type/buttons. Released 1.0.2 defaults to `mobilecli`; its older WDA/go-ios path is retained as legacy. | Credible optional MCP, but another backend/helper stack to qualify. Current setup differs from older wiki instructions; does not remove Apple signing requirements. [Released dispatcher](https://github.com/mobile-next/mobile-mcp/blob/1.0.2/src/server.ts), [mobilecli prerequisites](https://github.com/mobile-next/mobilecli). |

Android also already has ADB installed locally. It remains useful for simple device commands; UiAutomator2 adds element queries and a maintained automation session. That can be evaluated independently of the Mac coordinate-control failure.

## Apple signing and iOS 26.6

Appium explicitly supports **free and paid Apple accounts** for WebDriverAgent. Its automatic provisioning recipe is paid-account-only; a free account can use the documented **manual Xcode configuration**, assigning a unique runner bundle identifier and the Personal Team. This is separate from signing YupCrew. Developer Mode, pairing/trust and valid runner provisioning remain necessary. [Appium provisioning guide](https://appium.github.io/appium-xcuitest-driver/latest/getting-started/provisioning-profile/).

Apple documents Personal Team limits of 10 App IDs, three registered devices and three installed apps per device, with seven-day provisioning expiry. Plan for a runner app slot and periodic rebuild/reinstall. A paid membership is **not required just to establish local tap automation**; it remains relevant to App Store distribution and advanced capabilities. [Apple account overview](https://developer.apple.com/help/account/basics/about-your-developer-account).

The current Appium matrix lists iOS 26.4+ with XCUITest driver 10.23.2+/WDA 11.1.5+, and current driver releases use Appium 3. It also requires checking the device OS against Xcode's SDK support. The current Mac's Xcode 26.3 and phone's iOS 26.6 therefore need a compatibility check before promising a successful WDA build/run. A matrix entry is not a local test result. [Compatibility matrix](https://appium.github.io/appium-xcuitest-driver/latest/getting-started/system-requirements/).

## Capacitor and WebViews

Start with **native input and the exposed accessibility tree**. These routes observe the visible application and system prompts. Whether every WKWebView control is exposed usefully must be checked in the actual app; do not assume CSS IDs appear as native accessibility identifiers.

For Appium **DOM-level** automation on iOS, WKWebView must have `isInspectable = true`, and physical-device Safari Web Inspector must be enabled. Appium can then switch between `NATIVE_APP` and `WEBVIEW` contexts. Its new simulator-only WebKit automation-session path currently documents unreliable W3C Actions; avoid that optional path initially. Native gestures and DOM clicks should not be reported as equivalent evidence of touch handling. [Hybrid requirements and limitations](https://appium.github.io/appium-xcuitest-driver/latest/guides/hybrid/).

Android DOM control requires a debuggable WebView and a Chromedriver version matching its engine. Maestro also documents missing WebView accessibility content, with `androidWebViewHierarchy: devtools` as an Android workaround. Neither is needed merely to attempt native-coordinate taps. [UiAutomator2 hybrid mode](https://github.com/appium/appium-uiautomator2-driver/tree/v8.6.1#hybrid-mode), [Maestro known issues](https://docs.maestro.dev/extra-materials/troubleshooting/known-issues).

The project currently disables WebView inspection in release configuration. If DOM inspection becomes necessary, enable it only in an explicit development/test build and retain the release restriction. This research does not propose changing application security settings to work around a Mac input service error.

## Existing idb repair candidate

The coordinator found `/Users/zacharyplischka/.local/bin/idb`, backed by a Python 3.14 pipx environment. Even `idb --help` raises `RuntimeError` at the old `asyncio.get_event_loop()` entry point, and `idb_companion` is absent. The official **v1.5.2** source instead enters through `asyncio.run(gen_main(...))`; this removes that specific old startup path. [Current entry point](https://github.com/facebook/idb/blob/v1.5.2/idb/cli/main.py).

The current official package installs both pieces with `brew install facebook/fb/idb`. If chosen, verify the executable path so the old pipx shim cannot shadow the new package, then verify client/companion versions and simulator discovery before input. This is a documented upgrade candidate, **not yet a verified repair**. No custom patch to the installed Python package is needed. [Packaged installation](https://github.com/facebook/idb/blob/v1.5.2/README.md).

## Maintenance and cost snapshot

Live GitHub release API checks were used because search indexes returned stale releases. These are latest non-prerelease tags reported on 8 September 2026, not compatibility guarantees.

| Project | Release | Licence/cost for local testing |
| --- | --- | --- |
| AXe | [1.8.0, 20 July 2026](https://github.com/cameroncooke/AXe/releases/tag/v1.8.0) | MIT; free local use. [Licence](https://github.com/cameroncooke/AXe/blob/v1.8.0/LICENSE). |
| idb | [1.5.2, 1 September 2026](https://github.com/facebook/idb/releases/tag/v1.5.2) | MIT; free local use. Its recent release and source activity contradict stale search results showing only 2022 releases. [Licence](https://github.com/facebook/idb/blob/v1.5.2/LICENSE). |
| Maestro | [2.10.0, 31 August 2026](https://github.com/mobile-dev-inc/Maestro/releases/tag/cli-2.10.0) | CLI Apache-2.0; local CLI/MCP use does not require a cloud purchase. Cloud execution is separately priced. [Repository](https://github.com/mobile-dev-inc/Maestro). |
| Appium XCUITest | [12.10.0, 3 September 2026](https://github.com/appium/appium-xcuitest-driver/releases/tag/v12.10.0) | Apache-2.0; free local server/driver. [Package](https://github.com/appium/appium-xcuitest-driver/blob/v12.10.0/package.json). |
| Appium UiAutomator2 | [8.6.1, 5 September 2026](https://github.com/appium/appium-uiautomator2-driver/releases/tag/v8.6.1) | Apache-2.0; free local driver. [Package](https://github.com/appium/appium-uiautomator2-driver/blob/v8.6.1/package.json). |
| Apple XCUITest | Shipped with Xcode | Apple tooling; personal on-device testing is available free. [Membership comparison](https://developer.apple.com/support/compare-memberships/). |
| Mobile MCP | [1.0.2, 9 August 2026](https://github.com/mobile-next/mobile-mcp/releases/tag/1.0.2) | MCP Apache-2.0; its default mobilecli backend has FSL-1.1-Apache-2.0 terms permitting internal use but restricting competing services. [MCP package](https://github.com/mobile-next/mobile-mcp/blob/1.0.2/package.json), [mobilecli licence](https://github.com/mobile-next/mobilecli/blob/main/LICENSE). |

Mobile MCP's current backend automatically installs its simulator agent; physical iOS installation requires a provisioning profile. Its older wiki describes manually running WDA, a go-ios tunnel and port forwarding. Treat the versioned implementation as authoritative when preparing setup, not an assumption that the old wiki describes the default. Telemetry can be disabled with `MOBILEMCP_DISABLE_TELEMETRY=1`. [Current backend](https://github.com/mobile-next/mobile-mcp/blob/1.0.2/src/server.ts), [agent installation](https://github.com/mobile-next/mobilecli#agent-management), [legacy physical guide](https://github.com/mobile-next/mobile-mcp/wiki/Getting-Started-with-iOS-Real-Device).

## First proof before resuming app testing

1. Choose one simulator CLI, pin the tested version, and target an explicit simulator UDID.
2. Capture the simulator screen and hierarchy. Tap a harmless visible control, then require a visible state change; an exit code alone is insufficient.
3. Prove swipe, text entry and Home navigation, rereading state after each action. Repeat with Simulator unfocused to test independence from Mac window focus.
4. Only after this passes, run the app's guest journey. Keep the physical-phone freeze investigation separate.
5. For physical-device expansion, qualify a signed WDA runner and Appium session on the iPhone, then UiAutomator2 on Android. Capture exact toolchain, OS, device and runner versions alongside results.

The smallest immediate AXe command shape is `axe describe-ui --udid <UDID>`, followed by `axe tap --label <observed-label> --udid <UDID>`, and a fresh screenshot. A coordinate tap should use coordinates from the current simulator screen, not the surrounding Mac window. [Command reference](https://www.axe-cli.com/docs/command-reference).
