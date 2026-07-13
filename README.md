# Termanshi

A retro terminal-style portfolio website that behaves like a pseudo Linux shell. It is designed as a reusable template for anyone who wants to turn their portfolio into an interactive terminal like experience portfolio. 

## What it is

Termanshi is a browser-based terminal portfolio with:
- a pseudo login flow
- command-based navigation
- a built-in file system inspired by a Linux home directory
- fun terminal commands like matrix, neofetch, and tic-tac-toe
- a CRT-style visual effect layer using webgl rendering.

## How to use this as a template

1. Fork or copy this repository.
2. Edit the shared config in js/config.js to personalize the site.
3. Replace the filesystem entries in js/filesystem.js to match your own links, projects, socials, and content.
4. Update the HTML title and any text in the terminal if needed.
5. Open index.html in a browser to preview it locally.

## Customize the identity

Edit js/config.js and change:
- ownerName
- hostname
- welcomeMessage
- siteTitle
- homeDirName

Example:

```js
window.PORTFOLIO_CONFIG = {
  ownerName: "yourname",
  hostname: "portfolio",
  welcomeMessage: "Welcome back, yourname.",
  siteTitle: "My Terminal Portfolio",
  homeDirName: "yourname",
};
```

## Customize the content

The filesystem is defined in js/filesystem.js. That file controls:
- folders like projects, socials, and graphics
- files shown in the terminal
- links opened by curl
- any custom text content for cat and other commands

## Run locally

Because this is a simple static site, you can open index.html directly in a browser.

If you want to serve it from a local development server, you can use any static server, for example:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Notes

- The project is intentionally styled as a pseudo terminal rather than a full operating system more like an emulation of termux.
- You can add more commands by extending the shell logic in js/commands.js and the terminal UI in js/terminal.js.
- The CRT visuals are handled in js/effects.js.

