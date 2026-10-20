# Device checklist

What automated tests cannot reach: real capture, permissions, other apps' shortcuts, meeting software, sleep and real updates. Everything else runs in `npm test`, `npm run test:database`, `npm run test:e2e` and `npm run test:smoke` (see [VERIFICATION.md](VERIFICATION.md)).

`setContentProtection` requests OS capture exclusion; it is not an invisibility or detection guarantee. Electron documents that newer macOS ScreenCaptureKit capture can include protected windows. Hide/show only changes window visibility. No process concealment or proctoring bypass is implemented.

**Before you start.** Use a build that includes the fixes in [TEST-FINDINGS.md](TEST-FINDINGS.md) (0.1.10, or a local `npm run package:mac` with the release variables, then `npm run verify:release`). Use a consenting mock call. For each run, record the app version, macOS version, meeting app and version, displays, and audio devices.

## 1. Install, permissions, sign-in

1. **Fresh install.** Install from the DMG, open from Applications, approve **Open Anyway**. *Expect:* the app opens and shows "Allow screen and audio access".
2. **Grant screen access.** Click **Open System Settings**, turn on Ctrue, then click **Restart Ctrue**. *Expect:* it restarts once, the access panel is gone, and the Dock icon stays.
3. **Saved-data prompt.** When asked for "@ctrue/desktop Safe Storage", choose **Always Allow**. *Expect:* no prompt on the next launch.
4. **Sign in.** Click **Sign in**, finish Google sign-in, then click **Connect desktop** on the website. *Expect:* Ctrue comes to the front, shows "Signed in securely." and shows your email in the sidebar.
5. **Revoked login (REN-5).** Sign out of the desktop from the website, or wait 30 days, then use the app. *Expect:* the app returns to **Connect your Ctrue account**, not an app that looks signed in while every request fails.
6. **A link from another account (SEC-4).** While signed in, open a `ctrue://auth?code=…` link created from a *different* Google account. *Record:* whether it silently switches accounts. Known behaviour, kept open in the findings.
7. **API key.** Add your key in Preferences, quit and reopen. *Expect:* "saved on this Mac, encrypted" both times. **Remove key** clears it.

## 2. Listening (⌘L)

8. **Call audio.** Play a call through speakers, then wired headphones, then Bluetooth, and press ⌘L. *Expect:* the pop-up shows "● Listening", the level meter moves, and "Hearing…" fills with the other person's words.
9. **Auto answer.** Ask "What is a hash map?" and pause. *Expect:* an answer within a few seconds of the pause, with no answer to filler such as "okay" or "thank you" (REN-8, record how often).
10. **Silence (API-7).** Listen through 60 s of silence. *Expect:* no invented lines such as "Thank you." in the transcript.
11. **Microphone.** Tick **Include microphone**, then listen. *Expect:* the pop-up shows the microphone notice. **Turn off mic** keeps listening without it.
12. **Device change.** Unplug headphones mid-call. *Expect:* listening continues, or stops with a clear message, never silently.
13. **Network.** Switch Wi-Fi networks mid-listen (API-13). *Expect:* listening resumes after pressing ⌘L again, with no "Transcription is already active".
14. **Short stall (REN-9).** Block the network for 5 s with the Network Link Conditioner, then restore it. *Expect:* listening carries on.

## 3. Screenshots, walkthrough and the pop-up

15. **Screenshot answer.** ⌘J on each display (put the pointer on it first). *Expect:* the answer is about that display's content.
16. **Collected screenshots.** On a long page, press ⌘⇧J three times while scrolling, then ⌘J. *Expect:* "3 screenshots ready", then one answer that uses all four.
17. **Other shortcuts.** Use ⌘↩ to answer what was just said, and ⌘H to hide and show the pop-up. *Expect:* both work from any app. Tray → **Show Ctrue** restores the window.
18. **Walkthrough navigation.** Start a walkthrough, then step with ⌥⇧N and ⌥⇧B. *Expect:* steps move in both windows.
19. **Spoken follow-up vs new problem (REN-1, REN-13).** Mid-walkthrough, say "How would you design the cache?", then "Now design Uber". *Expect:* the first explains the current step, and the second starts a new walkthrough. ⌘↩ with a typed follow-up also stays on the step.
20. **Copy (ELEC-7).** Press **Copy** in the main window and in the pop-up, then paste elsewhere. *Expect:* the answer text pastes.
21. **Accidental keys (ELEC-22).** Press ⌘R in the main window, and look for View → Toggle Developer Tools. *Record:* whether ⌘R wipes the conversation and whether DevTools opens. Kept open in the findings.
22. **Shortcut collisions (ELEC-8).** While Ctrue runs, try ⌘H (hide) and ⌘L (browser address bar) in other apps. *Record:* which system shortcuts Ctrue takes over. Recording Shift+K as a shortcut must be refused.

## 4. Meetings and capture exclusion

23. **Zoom, Teams and Meet.** In each, share a window, then the full display, then record. Have the pop-up visible over a full-screen meeting. *Record:* whether the pop-up and main window appear in the share and in the recording.
24. **QuickTime.** Run a screen recording with protection on, then off (Preferences → **Request capture protection**). *Record:* visibility in each case.
25. **Displays.** Use two displays with different scaling and move the pop-up between them. *Expect:* it stays readable and opens on the display under the pointer.

## 5. Resilience and updates

26. **Sleep and wake.** Close the lid while listening and reopen it after 2 minutes. *Expect:* a clear "Connection lost" or paused state, and **Resume** works.
27. **Soak.** Listen for 60 minutes. *Record:* memory in Activity Monitor at 0, 30 and 60 minutes, and answer latency.
28. **Quit.** Use tray → **Quit Ctrue**. *Expect:* the app exits and global shortcuts stop working in other apps.
29. **Self-update.** With 0.1.9 installed, publish 0.1.10. *Expect:* "Downloading…", then **Restart to update**. After the restart, it is version 0.1.10 and Screen Recording is still granted. A failed background check later must not replace **Restart to update** (REN-11).
30. **Website sign-out while the API is down (WEB-3).** Sign out on the website with the network to the API blocked. *Expect:* you are signed out anyway.

## Results

| # | macOS / app version | Pass, fail or note | Date |
| --- | --- | --- | --- |
| 1–30 | | | |

macOS packaged builds include the microphone, screen and `NSAudioCaptureUsageDescription` entries. A terminal- or IDE-launched development build may lack the audio usage description, so validate the packaged app. Older macOS system-audio support differs; see [Electron's documented caveats](https://www.electronjs.org/docs/latest/api/desktop-capturer/).
