/* on browser load */

const GRUB_LINES = [
  "GNU GRUB 2.06",
  "Minimal BASH-like line editing is supported. For the first word, TAB lists possible command completions.",
  "For full documentation see \"info -f grub\" and \"info grub\".",
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
  "[    1.200000] systemd[1]: Started Getty on tty1.",
];

const TTY_LINES = [
  "\nWelcome to portfolio tty1.",
  "",
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

async function runGrubSequence() {
  Terminal.clear();
  for (const line of GRUB_LINES) {
    Terminal.print(line);
    await Terminal.sleep(140);
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

async function runTtyLogin() {
  Terminal.clear();
  for (const line of TTY_LINES) {
    Terminal.print(line);
    await Terminal.sleep(120);
  }
  await Terminal.print("tty1 login: ");
  await Terminal.readLine({ prefix: "tty1 login: " });
  await Terminal.readLine({ prefix: "Password: ", mask: "-" });
  Terminal.print("Login incorrect");
  await Terminal.sleep(500);
  Terminal.print("");
  Terminal.print("tty1 login: ");
  await Terminal.readLine({ prefix: "tty1 login: " });
  await Terminal.readLine({ prefix: "Password: ", mask: "-" });
  Terminal.print("Welcome to portfolio!");
  await Terminal.sleep(300);
  Terminal.print("");
  if (Shell.helpText) {
    Terminal.print("Available commands:");
    Terminal.print(Shell.helpText);
    Terminal.print("");
  }
  Terminal.print("Type 'start' to initialize.");
  Terminal.print("");
}

async function runShellLoop() {
  while (true) {
    const raw = await Terminal.readLine({
      prefix: Shell.prompt(),
      history: Shell.cmdHistory,
      onTab: Shell.tabComplete,
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
    powerResolve = resolve;
    powerButton = document.getElementById("power-button");
    if (powerButton) {
      powerButton.addEventListener("click", handlePowerClick);
      updatePowerButton();
    }
  });
}

async function main() {
  await Terminal.init();
  await waitForPowerOn();
  await runGrubSequence();
  await runBootSequence();
  await runTtyLogin();
  while (true) {
    await runShellLoop();
  }
}

window.addEventListener("DOMContentLoaded", main);
