# QuPai for desktop

The research agent for science labs, in its own window on your Mac or PC.

**[Download the latest beta](https://github.com/QuSpect/qupai-desktop/releases/latest)**

| Your computer | The file to download |
|---|---|
| Mac with Apple silicon (M1 or later) | `QuPai-<version>-arm64.dmg` |
| Mac with an Intel processor | `QuPai-<version>.dmg` |
| Windows 10 or 11, 64-bit | `QuPai-<version>-Setup-x64.exe` |

The other files in a release (`.zip` and `update-mac.json`) are how QuPai updates itself; you
don't need them.

## On a Mac

Open the `.dmg` and drag QuPai to Applications. The beta is not notarized by Apple yet, so the
first time you open it macOS says it can't check it for malicious software. Open **System
Settings → Privacy & Security**, find "QuPai was blocked to protect your Mac" and click **Open
Anyway**. You only do this once.

QuPai asks on its first screen how you want to work:

- **QuPai Cloud**: sign in with your QuPai account; your conversations live on the platform.
- **This Mac**: the agent works on your computer, in folders you choose, with your own model
  key (DeepSeek and others). No account and no server.

New betas arrive in the app: an **Update** button appears beside your avatar when one is ready,
and nothing restarts until you click it.

## On Windows

Run the installer. It installs QuPai for you (no administrator needed) and adds it to the Start
menu. The beta is not code-signed yet, so Windows SmartScreen may say it protected your PC: click
**More info**, then **Run anyway**.

On Windows QuPai works with QuPai Cloud: sign in with your QuPai account. Working on the computer
itself is Mac-only for now. To update, download the newest installer and run it over the old one.

## Found a problem?

[Open an issue](https://github.com/QuSpect/qupai-desktop/issues/new) and tell us what you did,
what you expected, and your computer (Mac or Windows, and which version).

QuPai is made by QuSpect. This repository holds the desktop downloads only.
