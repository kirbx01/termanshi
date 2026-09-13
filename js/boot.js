const GRUB_LINES = [
  "GNU GRUB 2.06",
  "Loading Linux 6.2.0-portfolio ...",
  "Loading initial ramdisk ...",
  "Booting default entry from /boot/grub/grub.cfg...",
  "vmlinuz-portfolio root=/dev/sda1 ro quiet splash",
  "Loading kernel modules...",
  "Loading initial ramdisk ... done.",
  "Boot successful.",
];

const BOOT_LINES = [
  "[    0.000000] Linux version 6.2.0-portfolio (panshi@portfolio) (gcc version 13.3.0) #1 SMP PREEMPT x86_64",
  "[    0.000000] Command line: ro quiet splash",
  "[    0.000000] x86/fpu: Supporting XSAVE feature 0x001: 'x87 floating point registers'",
  "[    0.000000] x86/fpu: Supporting XSAVE feature 0x002: 'SSE registers'",
  "[    0.000000] x86/fpu: Supporting XSAVE feature 0x004: 'AVX registers'",
  "[    0.000000] BIOS-provided physical RAM map:",
  "[    0.000000] BIOS-e820: [mem 0x0000000000000000-0x000000000009ffff] usable",
  "[    0.000000] BIOS-e820: [mem 0x0000000000100000-0x00000000bffdffff] usable",
  "[    0.000000] NX (Execute Disable) protection: active",
  "[    0.000000] ACPI: RSDP 0x00000000000F05B0 000014 (v00 BOCHS )",
  "[    0.000000] ACPI: FACP 0x00000000BFBF1000 0000F4 (v03 BOCHS )",
  "[    0.000000] e820: update [mem 0x00000000-0x00000fff] usable ==> reserved",
  "[    0.000000] e820: remove [mem 0x000a0000-0x000fffff] usable",
  "[    0.000000] last_pfn = 0xbffe0 max_arch_pfn = 0x400000000",
  "[    0.000000] Using GB pages for direct mapping",
  "[    0.000000] RAMDISK: [mem 0xbc7f6000-0xbdffffff]",
  "[    0.000000] ACPI: Early table checksum verification disabled",
  "[    0.000000] ACPI: Reserving FACP table memory at [mem 0xbfbf1000-0xbfbf10f3]",
  "[    0.000000] No NUMA configuration found",
  "[    0.000000] Faking a node at [mem 0x0000000000000000-0x00000000bffdffff]",
  "[    0.000000] SMP: Allowing 4 CPUs, 0 hotplug CPUs",
  "[    0.000000] PM: hibernation: Registered nosave memory",
  "[    0.000000] random: crng done (trusting local entropy)",
  "[    0.000000] printk: console [tty0] enabled",
  "[    0.500000] systemd[1]: systemd 253.5-1 running in system mode. (+PAM +AUDIT +SELINUX +APPARMOR +IMA)",
  "[    0.600000] systemd[1]: Detected kernel command line parameters: ro quiet splash",
  "[    0.700000] systemd[1]: Reached target Local File Systems.",
  "[    0.800000] systemd[1]: Started Journal Service.",
  "[    0.900000] systemd[1]: Started udev Kernel Device Manager.",
  "[    1.000000] systemd[1]: Started Load Kernel Modules.",
  "[    1.100000] systemd[1]: Reached target Network.",
  "[    1.200000] systemd[1]: Started getty service.",
];

let powerOn = false;
let powerButton = null;
let powerResolve = null;

function updatePowerButton() {
  if (!powerButton) return;
  powerButton.textContent = powerOn ? "⏻" : "⏼";
  powerButton.classList.toggle("power-on", powerOn);
  powerButton.classList.toggle("power-off", !powerOn);
  powerButton.title = powerOn ? "Power off" : "Power on";
}

function isTerminalActive() {
  const login = document.getElementById("login-screen");
  return !login || login.classList.contains("done");
}

let loginReadyResolve = null;
const loginReadyPromise = new Promise((resolve) => {
  loginReadyResolve = resolve;
});

function hideLoginScreen() {
  const login = document.getElementById("login-screen");
  const user = document.getElementById("login-user");
  const pwd = document.getElementById("login-pwd");
  if (!login || login.classList.contains("done")) return;
  login.classList.add("done");
  if (user) user.blur();
  if (pwd) pwd.blur();
}

function handleLoginSubmit(event) {
  if (event) event.preventDefault();
  const login = document.getElementById("login-screen");
  const user = document.getElementById("login-user");
  const pwd = document.getElementById("login-pwd");
  if (!user || !pwd) return;

  const userValue = user.value.trim();
  const pwdValue = pwd.value.trim();

  if (!userValue || !pwdValue) {
    if (login) login.classList.add("invalid");
    (userValue ? pwd : user).focus({ preventScroll: true });
    return;
  }
  if (login && login.classList.contains("done")) return;

  login.classList.add("done");
  if (user) user.blur();
  if (pwd) pwd.blur();
  window.setTimeout(() => {
    if (loginReadyResolve) {
      loginReadyResolve();
      loginReadyResolve = null;
    }
  }, 350);
}

function initLogin() {
  const card = document.getElementById("login-card");
  const submit = document.getElementById("login-submit");
  const pwd = document.getElementById("login-pwd");

  if (card) card.addEventListener("submit", handleLoginSubmit);
  if (submit) submit.addEventListener("click", handleLoginSubmit);
  if (pwd) pwd.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLoginSubmit();
    }
  });
}

const MENU_COMMANDS = {
  file: "ls",
  format: "start",
  blogs: "blogs",
  help: "help",
};

function initMenuBar() {
  const bar = document.getElementById("menu-bar");
  if (!bar) return;
  bar.querySelectorAll(".menu-item").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isTerminalActive()) return;
      const menu = button.dataset.menu;
      const cmd = MENU_COMMANDS[menu];
      if (cmd) {
        Terminal.clear();
        Terminal.runCommand(cmd);
      } else {
        Terminal.focusInput();
      }
    });
  });
}

async function runGrubSequence() {
  Terminal.clear();
  const targetRows = Terminal.rows || 24;
  let printed = 0;
  while (printed < targetRows) {
    for (const line of GRUB_LINES) {
      Terminal.print(line);
      printed++;
      await Terminal.sleep(140);
      if (printed >= targetRows) break;
    }
  }
  await Terminal.sleep(300);
}

async function runBootSequence() {
  Terminal.clear();
  for (const line of BOOT_LINES) {
    Terminal.print(line);
    await Terminal.sleep(120);
  }
  await Terminal.sleep(300);
}

async function runLogin() {
  Terminal.clear();
  const config = window.PORTFOLIO_CONFIG || {};
  Terminal.print(config.welcomeMessage || "Welcome back, viewer.");
  await Terminal.sleep(450);
}

async function runShellLoop() {
  while (true) {
    const raw = await Terminal.readLine({
      prefix: Shell.prompt(),
      history: Shell.cmdHistory,
      onTab: Shell.tabComplete,
      onSuggest: Shell.getCompletions,
    });
    const result = await Shell.execute(raw);
    if (result === "LOGOUT") return;
  }
}

function handlePowerClick() {
  if (powerOn) {
    Terminal.print("");
    Terminal.print("Powering off...");
    setTimeout(() => window.location.reload(), 250);
    return;
  }
  powerOn = true;
  updatePowerButton();
  if (powerResolve) {
    powerResolve();
    powerResolve = null;
  }
}

function waitForPowerOn() {
  return new Promise((resolve) => {
    powerOn = true;
    powerButton = document.getElementById("power-button");
    updatePowerButton();
    resolve();
  });
}

async function waitForLogin() {
  await loginReadyPromise;
}

async function main() {
  const loginEl = document.getElementById("login-screen");
  const menuBar = document.getElementById("menu-bar");
  await Terminal.init();
  await runGrubSequence();
  await runBootSequence();
  if (loginEl) loginEl.classList.add("login-visible");
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) {
    const user = document.getElementById("login-user");
    if (user) user.focus({ preventScroll: true });
  }
  await waitForLogin();
  hideLoginScreen();
  if (menuBar) menuBar.classList.add("visible");
  while (true) {
    await runLogin();
    await runShellLoop();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initLogin();
  initMenuBar();
  main();
});