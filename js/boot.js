/* on browser load */

const BOOT_LINES = [
  "Kernel panic: not syncing: Attempted to kill init!",
  "Booting Linux 6.2.0-portfolio ...",
  "Initializing cgroup subsys cpuset",
  "Initializing cgroup subsys cpu",
  "Initializing cgroup subsys cpuacct",
  "Linux version 6.2.0-portfolio (panshi@portfolio) (gcc version 13.3.0) #1 SMP PREEMPT x86_64",
  "Command line: ro quiet splash",
  "Kernel command line: ro quiet splash",
  "Kernel command in: /boot/vmlinuz-portfolio",
  "Kernel loaded successfully.",
  "Starting initramfs ...",
  "Loading drivers...",
  "dracut: starting service...",  if (!powerButton) return;
  powerButton.textContent = powerOn ? "⏻" : "⏼";
  powerButton.classList.toggle("power-on", powerOn);
  powerButton.classList.toggle("power-off", !powerOn);
  powerButton.title = powerOn ? "Power off" : "Power on";
}

async function runGrubSequence() {
  Terminal.clear();
  for (const line of GRUB_LINES) {
    await Terminal.typeLine(line, 18);
    await Terminal.sleep(120);
  }
  await Terminal.sleep(300);
}

async function runBootSequence() {
  await Terminal.typeLines(BOOT_LINES, 22, 160);
  await Terminal.sleep(300);
}

async function runLogin() {
  Terminal.print("");
  await Terminal.readLine({ prefix: "login: " });
  await Terminal.readLine({ prefix: "Password: ", mask: "-" });
  Terminal.print("Authenticating...");
  await Terminal.sleep(650);
  Terminal.print("Access granted.");
  await Terminal.sleep(350);
  const config = window.PORTFOLIO_CONFIG || {};
  Terminal.print(config.welcomeMessage || "Welcome back, viewer.");
  await Terminal.sleep(600);
  Terminal.print("");
  if (Shell.helpText) {
    Terminal.print("Available commands:");
    Terminal.print(Shell.helpText);
    Terminal.print("");
  }
  Terminal.print("Connected to network.");
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
  // login -> shell -> (on "exit") back to a fresh login screen, forever.
  while (true) {
    await runLogin();
    await runShellLoop();
  }
}

window.addEventListener("DOMContentLoaded", main);
