# Capture acceptance matrix

`setContentProtection` requests OS capture exclusion; it is not an invisibility or detection guarantee. Electron documents that newer macOS ScreenCaptureKit capture can include protected windows. Hide/show only changes window visibility. No process concealment or proctoring bypass is implemented.

Record the actual app version, OS version, meeting version, display configuration, and audio devices for every test. Use a consenting mock call.

| Test | macOS | Windows |
| --- | --- | --- |
| Selected screen / selected window / cropped region | Pending real-device check | Pending real-device check |
| Call audio through speakers / wired headset / Bluetooth | Pending | Pending |
| Microphone on/off and input-device change | Pending | Pending |
| Permission denied, then granted after restart | Pending | Pending |
| Multiple monitors, mixed DPI, moved overlay | Pending | Pending |
| Zoom: window share / full display / recording | Pending | Pending |
| Teams: window share / full display / recording | Pending | Pending |
| Meet: window share / full display / recording | Pending | Pending |
| Hide/show via shortcut and tray restore | Pending | Pending |
| Network lost, pause, credit exhaustion, reconnect | Pending | Pending |
| 60-minute capture: memory, latency, audio stability | Pending | Pending |

macOS packaged builds include microphone, screen, and `NSAudioCaptureUsageDescription` entries. The parent terminal/IDE may lack the audio usage description during development; validate the packaged app. Older macOS system-audio support differs; see [Electron's documented caveats](https://www.electronjs.org/docs/latest/api/desktop-capturer/).
