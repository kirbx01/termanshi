/* on browser load */

const BOOT_LINES = [
  "Initializing BIOS...",
  "Loading kernel...",
  "Loading initramfs...",
  "Mounting filesystem...",
  "Starting services...",
  "Network online.",
  "Loading shell...",
  "Ready.",
];


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
  Terminal.clear();
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

async function main() {
  await Terminal.init();
  await runBootSequence();
  // login -> shell -> (on "exit") back to a fresh login screen, forever.
  while (true) {
    await runLogin();
    await runShellLoop();
  }
}

window.addEventListener("DOMContentLoaded", main);
