# Ctrue

A free, open-source macOS assistant for practice and for calls where help is welcome. Press a shortcut and a private, see-through pop-up transcribes what is being said, reads what is on your screen, and drafts an answer using your own OpenAI API key.

**Website:** [ctrue.monishpatalay.dev](https://ctrue.monishpatalay.dev)

**Download:** [ctrue.monishpatalay.dev/downloads](https://ctrue.monishpatalay.dev/downloads) · macOS on Apple Silicon (M1 and later) · [all releases](https://github.com/monishpatalay/ctrue/releases)

## Get started

1. **Install.** Open the DMG and drag Ctrue into Applications. Then eject the installer: in Finder's sidebar, click the eject button (⏏) next to **Ctrue**. Always open Ctrue from Applications, not from the installer.
2. **First launch.** Ctrue is not notarized by Apple yet. When macOS says it couldn't verify the app, click **Done**, then go to **System Settings → Privacy & Security** and click **Open Anyway**.
3. **Allow screen and audio access.** Ctrue opens the right page in System Settings for you. Turn on **Ctrue** under **Screen & System Audio Recording**.
4. **Restart Ctrue.** macOS only applies the permission after a restart. Click **Restart Ctrue** in the app (or **Quit & Reopen** if macOS offers it). If it still asks for permission, quit Ctrue completely (Ctrue menu → **Quit**, not just closing the window) and open it again from Applications.
5. **Allow access to saved data.** If macOS asks for your password so Ctrue can use "@ctrue/desktop Safe Storage", enter it and click **Always Allow** (not just Allow). This is where Ctrue keeps your sign-in and API key encrypted.
6. **Sign in** with Google from the app and click **Connect desktop** on the website.
7. **Add your OpenAI API key** when the app asks ([create one here](https://platform.openai.com/api-keys); your OpenAI account needs credit). The key stays encrypted on your Mac.

**Updates** install themselves from version 0.1.6 on: Ctrue downloads new versions in the background and shows **Restart to update**, and your permissions carry over. Coming from 0.1.5 or earlier, install 0.1.6 by hand once and repeat steps 1 to 5.

**Still asked for permission after turning it on?** An older copy of Ctrue may own the switch. Remove **Ctrue** from the Screen & System Audio Recording list with the **−** button (or run `tccutil reset ScreenCapture dev.ctrue.desktop` in Terminal), then repeat steps 3 and 4.

## Shortcuts

| Shortcut | What it does |
| --- | --- |
| ⌘L | Listen to the call and answer each question when the speaker stops |
| ⌘J | Screenshot the screen under your pointer and answer it (with recent speech, if listening) |
| ⌘⇧J | Add a screenshot without answering, for problems that need scrolling; ⌘J then answers with all of them |
| ⌘↩ | Answer what was just said |
| ⌘H | Show or hide the pop-up |
| ⌥⇧N / ⌥⇧B | Walkthrough mode: next / previous step |

Change any shortcut in **Preferences** by pressing the new keys.

## Privacy

- Your OpenAI key never leaves your Mac except inside requests, and the server never stores it.
- Audio and screenshots go to OpenAI only while you capture or ask. Transcripts and answers live in the app's memory and are not saved on the server.
- Resume facts you choose to save are stored with your account so behavioral answers can use them. You can delete them at any time.

## Use it responsibly

Only capture or transcribe other people when they know and have agreed; many places require everyone's consent. Don't use Ctrue in exams, proctored assessments or interviews whose rules forbid outside help. Its screen-capture exclusion depends on macOS and the sharing app and is not a guarantee.

## Project layout

| Path | What it is |
| --- | --- |
| `apps/desktop` | Electron app: main window, pop-up, capture and shortcuts |
| `apps/web` | Next.js website: sign-in (Neon Auth with Google), dashboard, downloads, legal pages |
| `apps/api` | Node API: sessions, desktop sign-in handoff, transcription relay and answer streaming |
| `database` | PostgreSQL migrations and tests |

## Run it yourself

Requires Node 24.

```sh
npm ci
npm run dev:demo   # simulated answers, no accounts or keys needed
```

Website at http://localhost:3000, API at http://localhost:4318. In the desktop app choose **Try local demo**.

For the real thing:

1. Create a [Neon](https://neon.com) project with Auth enabled and the Google provider, then apply `database/migrations/*.sql` in order.
2. Copy each app's `.env.example` to `.env` (the website uses `.env.local`) and fill in `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` and an `OPENAI_API_KEY` for the owner account. Set `METERING=false` for the free, bring-your-own-key mode.
3. Run `npm run dev`.

To deploy, `render.yaml` describes the API for [Render](https://render.com) and `apps/web` deploys to Vercel. Build the Mac app with `npm run package:mac`, setting `CTRUE_API_URL` and `CTRUE_WEBSITE_URL` to your deployed addresses.

## Checks

```sh
npm run typecheck
npm test
npm run test:smoke      # demo API over HTTP, SSE and WebSocket
npm run test:database   # disposable PostgreSQL; needs Postgres installed
```

## License

[MIT](LICENSE)
