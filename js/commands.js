//commands of this file globally

const Shell = (() => {
  const config = window.PORTFOLIO_CONFIG || {};
  const defaultHome = config.homeDirName || "panshi";
  let cwd = ["home", defaultHome];
  const cmdHistory = [];

  function getViewerIdentity() {
    const params = typeof window !== "undefined" && window.location
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();

    const requestedUser = params.get("user") || params.get("username") || params.get("who");
    const requestedHost = params.get("host") || params.get("hostname");

    return {
      username: requestedUser || config.ownerName || "viewer",
      hostname: requestedHost || config.hostname || window.location?.hostname || "portfolio",
    };
  }

  const { username: initialUsername, hostname: initialHostname } = getViewerIdentity();
  let currentUsername = initialUsername;
  let currentHostname = initialHostname;
  const HELP_TEXT =
`Available commands:

  help              show this help
  clear             clear the screen
  pwd               print working directory
  cd [dir]          change directory
  ls [-la] [dir]    list directory contents
  tree [dir]        show directory tree
  cat <file>        print file contents
  touch <file>      create an empty file
  mkdir <dir>        create a directory
  rm <file>         remove a file
  echo <text>       print text
  history           show command history
  date              show current date/time
  whoami            show current user
  hostname          show hostname
  uname [-a]        show system information
  neofetch          show system summary
  curl <target>     fetch / open a resource
  nano <file>       edit a file
  sudo <cmd>        try to elevate privileges
  reboot            restart the system
  exit              log out

  color <name>      change terminal color scheme (try 'color list')
  setfont [opt]      resize/switch font (try 'setfont' for usage)
  volume [level]    adjust global audio volume (0.0-1.0)
  matrix            enter the matrix
  tictactoe         play tic-tac-toe`;

  function splitArgs(raw) {
    return raw.trim().split(/\s+/).filter(Boolean);
  }

  function resolveNode(pathArg) {
    const parts = fsResolve(cwd, pathArg || "");
    return { parts, node: fsGetNode(parts) };
  }

  function getParent(pathParts) {
    const parentParts = pathParts.slice(0, -1);
    const name = pathParts[pathParts.length - 1];
    return { parent: fsGetNode(parentParts), name, parentParts };
  }

  function isCompactDisplay() {
    const width = window.innerWidth || screen.width || 0;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return width < 720 || coarse;
  }
//commands individually 
  function cmd_help() { Terminal.print(HELP_TEXT); }

  function cmd_pwd() { Terminal.print(fsPathString(cwd)); }

  function cmd_cd(args) {
    const target = args[0] || `/home/${defaultHome}`;
    const { parts, node } = resolveNode(target);
    if (!node) { Terminal.print(`cd: ${target}: No such file or directory`); return; }
    if (node.type !== "dir") { Terminal.print(`cd: ${target}: Not a directory`); return; }
    cwd = parts;
  }

  function cmd_ls(args) {
    const showAll = args.includes("-la") || args.includes("-l") || args.includes("-a");
    const pathArg = args.find(a => !a.startsWith("-"));
    const { node, parts } = resolveNode(pathArg);
    if (!node) { Terminal.print(`ls: cannot access '${pathArg}': No such file or directory`); return; }
    if (node.type === "file") { Terminal.print(pathArg); return; }
    const names = Object.keys(node.children);
    if (names.length === 0) return;
    if (showAll) {
      Terminal.print(`total ${names.length}`);
      for (const n of names) {
        const child = node.children[n];
        const type = child.type === "dir" ? "d" : "-";
        const perms = child.type === "dir" ? "rwxr-xr-x" : "rw-r--r--";
        const size = child.type === "file" ? String((child.content || "").length).padStart(5, " ") : "  4096";
        Terminal.print(`${type}${perms} 1 panshi panshi ${size} Jan 1 00:00 ${n}${child.type === "dir" ? "/" : ""}`);
      }
    } else {
      Terminal.print(names.map(n => node.children[n].type === "dir" ? n + "/" : n).join("   "));
    }
  }

  function cmd_tree(args) {
    const pathArg = args[0];
    const { node, parts } = resolveNode(pathArg);
    if (!node || node.type !== "dir") { Terminal.print(`tree: ${pathArg || "."}: not a directory`); return; }
    Terminal.print(fsPathString(parts));
    let dirCount = 0, fileCount = 0;

    function walk(n, prefix) {
      const names = Object.keys(n.children);
      names.forEach((name, i) => {
        const isLast = i === names.length - 1;
        const child = n.children[name];
        const branch = isLast ? "└── " : "├── ";
        Terminal.print(prefix + branch + name + (child.type === "dir" ? "/" : ""));
        if (child.type === "dir") {
          dirCount++;
          walk(child, prefix + (isLast ? "    " : "│   "));
        } else {
          fileCount++;
        }
      });
    }
    walk(node, "");
    Terminal.print(`\n${dirCount} directories, ${fileCount} files`);
  }

  function cmd_cat(args) {
    if (!args[0]) { Terminal.print("usage: cat <file>"); return; }
    const { node } = resolveNode(args[0]);
    if (!node) { Terminal.print(`cat: ${args[0]}: No such file or directory`); return; }
    if (node.type === "dir") { Terminal.print(`cat: ${args[0]}: Is a directory`); return; }
    Terminal.print(node.content || "");
  }

  function cmd_touch(args) {
    if (!args[0]) { Terminal.print("usage: touch <file>"); return; }
    const parts = fsResolve(cwd, args[0]);
    const { parent, name } = getParent(parts);
    if (!parent || parent.type !== "dir") { Terminal.print(`touch: cannot touch '${args[0]}'`); return; }
    if (!parent.children[name]) parent.children[name] = file("");
  }

  function cmd_mkdir(args) {
    if (!args[0]) { Terminal.print("usage: mkdir <dir>"); return; }
    const parts = fsResolve(cwd, args[0]);
    const { parent, name } = getParent(parts);
    if (!parent || parent.type !== "dir") { Terminal.print(`mkdir: cannot create directory '${args[0]}'`); return; }
    if (parent.children[name]) { Terminal.print(`mkdir: cannot create directory '${args[0]}': File exists`); return; }
    parent.children[name] = dir({});
  }

  function cmd_rm(args) {
    if (!args[0]) { Terminal.print("usage: rm <file>"); return; }
    const parts = fsResolve(cwd, args[0]);
    const { parent, name } = getParent(parts);
    if (!parent || !parent.children[name]) { Terminal.print(`rm: cannot remove '${args[0]}': No such file or directory`); return; }
    delete parent.children[name];
  }

  function cmd_echo(args) { Terminal.print(args.join(" ")); }

  function cmd_history() {
    cmdHistory.forEach((c, i) => Terminal.print(`  ${i + 1}  ${c}`));
  }

  function cmd_date() { Terminal.print(new Date().toString()); }

  function cmd_whoami() { Terminal.print(currentUsername); }

  function cmd_hostname() { Terminal.print(currentHostname); }

  function cmd_uname(args) {
    if (args.includes("-a")) {
      Terminal.print("Linux portfolio 6.2.0-panshi #1 SMP PREEMPT x86_64 GNU/Linux");
    } else {
      Terminal.print("Linux");
    }
  }

  async function cmd_neofetch() { await printNeofetch(); }

  async function cmd_start() {
    Terminal.print("Initializing system diagnostics...");
    await Terminal.sleep(400);
    await printNeofetch();
  }

  async function cmd_curl(args) {
    if (!args[0]) { Terminal.print("usage: curl <target>"); return; }
    const target = args[0].trim();
    const normalized = target.toLowerCase();

    if (normalized === "resume.pdf" || normalized === "resume") {
      Terminal.print("Downloading Resume.pdf ...");
      try {
        await downloadResume();
      } catch (error) {
        Terminal.print(`download failed: ${error.message}`);
      }
      return;
    }

    const { node } = resolveNode(target);
    if (node && node.type === "file" && node.url) {
      Terminal.print(`Connecting to ${node.url} ...`);
      window.open(node.url, "_blank");
      return;
    }
    if (node && node.type === "file") {
      Terminal.print(node.content || "");
      return;
    }
    Terminal.print(`curl: (6) Could not resolve host: ${target}`);
  }

  async function cmd_nano(args) {
    if (!args[0]) { Terminal.print("usage: nano <file>"); return; }
    const parts = fsResolve(cwd, args[0]);
    const node = fsGetNode(parts);
    const { parent, name } = getParent(parts);
    const content = node && node.type === "file" ? node.content : "";
    if (!node && (!parent || parent.type !== "dir")) {
      Terminal.print(`nano: cannot create '${args[0]}'`);
      return;
    }
    const result = await Terminal.nanoEdit(args[0], content || "");
    if (parent && parent.type === "dir") {
      parent.children[name] = file(result);
    }
  }

  function cmd_sudo(args) {
    Terminal.print("panshi is not in the sudoers file. This incident will be reported.");
  }

 //colors of terminal
 //bydefault the rgb animation and you can static by using color <colorname>
  function cmd_color(args) {
    const names = Terminal.THEME_NAMES.join(", ");
    if (!args[0] || args[0] === "list") {
      Terminal.print(`Available themes: ${names}`);
      Terminal.print(`Current theme: ${Terminal.getTheme()}`);
      Terminal.print("usage: color <name>");
      return;
    }
    const name = args[0].toLowerCase();
    if (Terminal.setTheme(name)) {
      Terminal.print(`Terminal color set to '${name}'.`);
    } else {
      Terminal.print(`color: unknown theme '${args[0]}'`);
      Terminal.print(`Available themes: ${names}`);
    }
  }

  // setfont - resize or switch the terminal font
  //   setfont            show current font + usage
  //   setfont + / ++     increase size (by 1 / 2 px)
  //   setfont - / --     decrease size (by 1 / 2 px)
  //   setfont -inc/-dec  same as + / -
  //   setfont <18>       set an exact pixel size
  //   setfont <family>   jetbrains | plex | space
  //   setfont reset      restore defaults

  function cmd_setfont(args) {
    const families = Object.keys(Terminal.FONT_FAMILIES).join(", ");
    const usage = `usage: setfont [+|++|-|--|<size>|<family>|reset]\n  families: ${families}\n  size range: ${Terminal.getFontInfo().min}-${Terminal.getFontInfo().max}px`;

    if (!args.length) {
      const info = Terminal.getFontInfo();
      Terminal.print(`Font: ${info.family}  Size: ${info.size}px`);
      Terminal.print(usage);
      return;
    }

    const arg = args[0].toLowerCase();

    if (arg === "reset") {
      Terminal.resetFont();
      Terminal.print("Font reset to default.");
      return;
    }
    if (arg === "+" || arg === "++" || arg === "-inc" || arg === "-i") {
      Terminal.adjustFontSize(arg === "++" ? 2 : 1);
      Terminal.print(`Font size: ${Terminal.getFontInfo().size}px`);
      return;
    }
    if (arg === "-" || arg === "--" || arg === "-dec" || arg === "-d") {
      Terminal.adjustFontSize(arg === "--" ? -2 : -1);
      Terminal.print(`Font size: ${Terminal.getFontInfo().size}px`);
      return;
    }
    if (/^\d+$/.test(arg)) {
      Terminal.setFontSize(parseInt(arg, 10));
      Terminal.print(`Font size: ${Terminal.getFontInfo().size}px`);
      return;
    }
    if (Terminal.setFontFamily(arg)) {
      Terminal.print(`Font family: ${arg}`);
      return;
    }
    Terminal.print(`setfont: unknown option '${args[0]}'`);
    Terminal.print(usage);
  }

  // volume - adjust global audio volume
  //   volume             show current volume
  //   volume <0.0-1.0>   set global volume

  function cmd_volume(args) {
    if (!args.length) {
      Terminal.print(`Current volume: ${TermAudio.getVolume().toFixed(2)}`);
      Terminal.print("usage: volume <0.0-1.0>");
      return;
    }

    const level = parseFloat(args[0]);
    if (isNaN(level) || level < 0 || level > 1) {
      Terminal.print(`volume: invalid level '${args[0]}'. Must be between 0.0 and 1.0.`);
      Terminal.print("usage: volume <0.0-1.0>");
      return;
    }

    TermAudio.setVolume(level);
    Terminal.print(`Volume set to ${TermAudio.getVolume().toFixed(2)}.`);
  }

  // fun commands (matrix, snake rn)

  async function cmd_matrix() {
    await Terminal.runMatrix();
    Terminal.print("Wake up, panshi...");
  }

  async function cmd_tictactoe() {
    const result = await Terminal.runTicTacToe();
    Terminal.print(result);
  }
//reboot
  async function cmd_reboot() {
    Terminal.print("Rebooting...");
    await Terminal.sleep(700);
    location.reload();
  }

  async function cmd_exit() {
    Terminal.print("logout");
    await Terminal.sleep(400);
    return "LOGOUT"; // signal boot.js to return to the login screen
  }

//neofetch and start
  const BOOT_TIME = Date.now();

  const ASCII_LOGO = [
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣤⣤⣄⠀⠀⢀⣀⣀⡀⠀⠀⠀⠀",
    "⠀⠀⠀⢠⡾⠛⠳⠶⣤⣀⣠⣤⣤⣴⡟⠁⠀⠙⣷⠟⠋⠉⠉⢿⡀⠀⠀⠀",
    "⠀⠀⠀⣾⠁⠀⠀⠀⠀⠉⠀⠀⠀⡿⠀⢠⣟⣿⠿⠳⢦⣤⡴⣼⣇⠀⠀⠀",
    "⠀⠀⠀⢻⣤⠀⠀⠀⠀⠀⠀⠀⠀⢿⣄⣀⣽⣏⠀⠀⢸⣷⡄⠀⣿⠀⠀⠀",
    "⠀⠀⠀⣼⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠀⠉⠓⢾⡟⠛⢁⣼⣟⠀⠀⠀",
    "⠀⢀⣼⣇⣀⣀⣀⣀⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣙⣿⣿⣥⣽⢤⠀⠀",
    "⣀⣈⣷⣏⣁⠀⠀⢀⠀⠉⠙⠻⣶⣾⣳⣶⠟⠉⠁⢀⠀⠀⠀⠶⢻⡟⠒⠒",
    "⠀⠀⠸⣇⣀⠀⠀⠛⠉⠂⠀⢀⡿⣉⣉⢿⡄⠀⠒⠉⠋⠀⠀⠠⣼⠧⢤⠀",
    "⠀⠐⠛⠻⣍⣀⡀⠀⠀⢀⣠⠞⠙⠧⠼⠈⠳⣄⡀⠀⠀⠀⣠⣴⣟⡀⠀⠀",
    "⠀⠀⣠⠴⠛⢿⣭⠿⠿⢯⡅⠀⠀⠀⠀⠀⠀⣠⣭⣩⣭⣭⣿⣋⠈⠙⠂⠀",
    "⠀⠀⠀⠀⢠⡟⠁⠀⠀⠀⣿⠶⠶⠶⠤⠶⣾⠇⠀⠘⣧⠀⠀⢹⡇⠀⠀⠀",
    "⠀⠀⠀⠀⠸⣇⠀⠀⣰⠾⠋⠀⠀⠀⠀⠀⣧⡀⠀⠀⢿⣄⣤⡾⠁⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠈⠛⠛⠁⠀⠀⠀⠀⠀⠀⠀⠈⠛⠒⠒⠚⠋⠁⠀⠀⠀⠀⠀",
    "⋆｡‧˚ʚ🍓ɞ˚‧｡⋆",
  ];

  const ASCII_LOGO_NARROW = [
    "  .--.   .--.",
    " (    )_(    )",
    "  \"--`  `--\"",
    "  panshiOS",
  ];

  const ASCII_LOGO_COMPACT = [
    "  /\\_/\\",
    " ( o.o )",
    "  > ^ <",
  ];

  function getAsciiLogo() {
    const width = window.innerWidth || screen.width || 0;
    const cols = Terminal.cols || 80;
    if (width < 560 || cols < 48) return ASCII_LOGO_COMPACT;
    if (width < 900 || cols < 90) return ASCII_LOGO_NARROW;
    return ASCII_LOGO;
  }

  function detectOS(ua) {
    if (/Windows/.test(ua)) return "Windows";
    if (/Mac OS X/.test(ua)) return "macOS";
    if (/Android/.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
    if (/Linux/.test(ua)) return "Linux";
    return "Unknown";
  }

  function detectBrowser(ua) {
    if (/Edg\//.test(ua)) return "Edge";
    if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "Safari";
    return "Unknown";
  }

  function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  }

  function countChildren(parts) {
    const node = fsGetNode(parts);
    return node && node.type === "dir" ? Object.keys(node.children).length : 0;
  }

  async function storageEstimateWithTimeout(timeout = 300) {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const estimatePromise = navigator.storage.estimate();
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), timeout));
    return Promise.race([estimatePromise, timeoutPromise]);
  }

  async function printNeofetch() {
    const ua = navigator.userAgent || "";
    const os = detectOS(ua);
    const browser = detectBrowser(ua);
    const cores = navigator.hardwareConcurrency || "unknown";
    const mem = navigator.deviceMemory ? `${navigator.deviceMemory} GB (approx)` : "unavailable";
    const res = `${screen.width}x${screen.height} @${window.devicePixelRatio || 1}x`;
    const lang = navigator.language || "unknown";
    const uptime = formatUptime(Date.now() - BOOT_TIME);

    let storageLine = "unavailable";
    try {
      const estimate = await storageEstimateWithTimeout(300);
      if (estimate && typeof estimate.usage === "number" && typeof estimate.quota === "number") {
        const usedGB = (estimate.usage / 1073741824).toFixed(2);
        const quotaGB = (estimate.quota / 1073741824).toFixed(2);
        const pct = estimate.quota ? Math.round((estimate.usage / estimate.quota) * 100) : 0;
        storageLine = `${usedGB} GiB / ${quotaGB} GiB (${pct}%)`;
      }
    } catch (e) {
      /* leave as unavailable */
    }

    const projects = countChildren(["home", defaultHome, "projects"]);
    const socials = countChildren(["home", defaultHome, "socials"]);
    const graphics = countChildren(["home", defaultHome, "graphics"]);

  // dot has independent colours
    // whichever terminal theme is currently active
    const dots = [];
    Terminal.DOT_HUES.forEach((hue, i) => {
      dots.push({ text: "●", hue });
      if (i < Terminal.DOT_HUES.length - 1) dots.push({ text: " " });
    });

    const info = [
      `${currentUsername}@${currentHostname}`,
      "-----------------",
      `OS:        ${os}`,
      `Browser:   ${browser}`,
      `CPU cores: ${cores}`,
      `Memory:    ${mem}`,
      `Storage:   ${storageLine}`,
      `Display:   ${res}`,
      `Language:  ${lang}`,
      `Uptime:    ${uptime}`,
      "-----------------",
      `Projects:  ${projects}`,
      `Socials:   ${socials}`,
      `Graphics:  ${graphics}`,
      "",
      dots,
    ];

    const ascii = getAsciiLogo();
    const useSplit = !isCompactDisplay() && window.innerWidth >= 860 && (window.innerHeight / Math.max(window.innerWidth, 1)) < 1.05;
    if (useSplit) {
      Terminal.printColumns(ascii, info, 5);
      return;
    }

    for (const line of ascii) Terminal.print(line);
    Terminal.print("");
    for (const line of info) Terminal.print(line);
  }

//resume.pdf
  function downloadResume() {
    return new Promise((resolve, reject) => {
      try {
        const a = document.createElement("a");
        a.href = "./js/assets/resume109.pdf";
        a.download = "resume109.pdf";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  // tab completion
  function tabComplete(typed) {
    const parts = typed.split(" ");
    const last = parts[parts.length - 1];
    const dirPart = last.includes("/") ? last.slice(0, last.lastIndexOf("/") + 1) : "";
    const prefix = last.includes("/") ? last.slice(last.lastIndexOf("/") + 1) : last;
    const { node } = resolveNode(dirPart);
    if (!node || node.type !== "dir") return null;
    const matches = Object.keys(node.children).filter(n => n.startsWith(prefix));
    if (matches.length === 1) {
      parts[parts.length - 1] = dirPart + matches[0] + (node.children[matches[0]].type === "dir" ? "/" : "");
      return parts.join(" ");
    }
    if (matches.length > 1) {
      Terminal.print(matches.join("   "));
    }
    return null;
  }

//dispatcher
  async function execute(raw) {
    const trimmed = raw.trim();
    if (trimmed === "") return;
    cmdHistory.push(trimmed);
    const args = splitArgs(trimmed);
    const cmd = args.shift();

    switch (cmd) {
      case "help": return cmd_help();
      case "clear": return Terminal.clear();
      case "pwd": return cmd_pwd();
      case "cd": return cmd_cd(args);
      case "ls": return cmd_ls(args);
      case "tree": return cmd_tree(args);
      case "cat": return cmd_cat(args);
      case "touch": return cmd_touch(args);
      case "mkdir": return cmd_mkdir(args);
      case "rm": return cmd_rm(args);
      case "echo": return cmd_echo(args);
      case "history": return cmd_history();
      case "date": return cmd_date();
      case "whoami": return cmd_whoami();
      case "hostname": return cmd_hostname();
      case "uname": return cmd_uname(args);
      case "neofetch": return await cmd_neofetch();
      case "start": return await cmd_start();
      case "curl": return cmd_curl(args);
      case "nano": return await cmd_nano(args);
      case "sudo": return cmd_sudo(args);
      case "reboot": return await cmd_reboot();
      case "exit": return await cmd_exit();
      case "color": return cmd_color(args);
      case "setfont": return cmd_setfont(args);
      case "volume": return cmd_volume(args);
      case "matrix": return await cmd_matrix();
      case "tictactoe": return await cmd_tictactoe();
      default:
        Terminal.print(`${cmd}: command not found`);
    }
  }

  function prompt() {
    const compact = isCompactDisplay();
    const path = fsDisplayPath(cwd);
    if (compact) {
      const userHost = `${(currentUsername || "u").charAt(0)}@${(currentHostname || "h").charAt(0)}`;
      const displayPath = path.length > 10 ? "~" : path;
      return `${userHost}:${displayPath}$ `;
    }
    return `${currentUsername}@${currentHostname}:${path}$ `;
  }

  return { execute, prompt, tabComplete, printNeofetch, ASCII_LOGO, cmdHistory, helpText: HELP_TEXT };
})();
