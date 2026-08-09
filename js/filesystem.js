const HOME_NAME = (window.PORTFOLIO_CONFIG && window.PORTFOLIO_CONFIG.homeDirName) || "panshi";

function dir(children) {
  return { type: "dir", children };
}
function file(content, url) {
  return { type: "file", content: content || "", url: url || null };
}

const FS_ROOT = dir({
  home: dir({
    [HOME_NAME]: dir({
      "Resume.pdf": file("Binary file - use `curl Resume.pdf` to download.", null),

      
//You can edit your details here and however you'd like to put your site
//about
"about.txt": file(
`Priyanshi, 19F, Delhi, India
Exploring Technologia :brokenheartemoji: 𓇢𓆸
I AM A HUGE FAN OF REI AMI AND SANRIO AND OSAKA AND DIO BRANDO!!!!
I have some nice projects on ricing and discord bot (only one each) but if you check them out I'd love it <3.
I like to make things, mostly electronics and software. I like to make them work, but I also like to make them look nice while doing it, but it never looks so, well....`),  

//skills
      "skills.txt": file(
`Languages:      C, C++, Rust, Python, JavaScript, PSQL
Embedded:       ARM Cortex-M, AVR, RTOS, Bare-metal firmware
Hardware:       PCB Design, KiCad, Signal Integrity, Debugging w/ scope+LA
Graphics:       OpenGL, GLSL, Real-time rendering, Computational geometry
Systems:        Linux, Bootloaders, Device Drivers, Memory-mapped I/O
Tools:          Git, GDB, JTAG/SWD, Oscilloscope, Logic Analyzer`),
      
//contact
"contact.txt": file(
`Email:    priyanshiiroy@proton.me
  GitHub:   https://github.com/kirbx01
  LinkedIn: https://linkedin.com/in/priyanshiroy

Feel free to reach out >///< `),

//projects
      projects: dir({
        Termanshi: file(
` What youre seeing right now. 

curl Termanshi  ->  opens the GitHub repository`,
          "https://github.com/kirbx01/termanshi"),

        Discoring: file(
`Discoring
A Discord music bot written in Rust with native audio playback, avoiding FFmpeg entirely. Built as a learning project focused on performance, simplicity, and low dependencies. Still a work in progress.
curl Discoring  ->  opens the GitHub repository`,
          "https://github.com/kirbyandluigixxcf/discoring"),

        Port0000: file(
`Port0000
A terminal chat app made through go where you can message others through the TCP/IP also uses rfcomm for bluetooth.

Resources

curl Port0000  ->  opens the GitHub repository`,
          "https://github.com/kirbx01/Port0000"),
      }),
      
//graphics
      graphics: dir({
        Artstation : file("Digital art & 3D work.\ncurl Artstation -> opens profile", "https://www.artstation.com/pansgotnocakes/"),
        Behance: file("Graphic design & visual work.\ncurl Behance -> opens profile", "https://www.behance.net/priyanshi--")
      }),
//media (music,video streaming)
      media: dir({
        Spotify: file("What I listen to while soldering.\ncurl Spotify -> opens profile", "https://open.spotify.com/user/615hglvwo1oe64zlk8matve1b?si=7284840f2b5c4fb5"),
      }),
//socials
      socials: dir({
        GitHub: file("Code & firmware repos.\ncurl GitHub -> opens profile", "https://github.com/kirbx01"),
      }),
    }),
  }),
  etc: dir({}),
  usr: dir({}),
  var: dir({}),
  opt: dir({}),
  bin: dir({}),
  dev: dir({}),
  proc: dir({}),
});

//filesystem helpers
function fsNormalize(path) {
  // Resolve "." and ".." segments into a clean array of parts.
  const parts = path.split("/").filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out;
}

function fsResolve(cwdParts, inputPath) {
  if (!inputPath || inputPath === "") return cwdParts.slice();
  if (inputPath.startsWith("/")) return fsNormalize(inputPath);
  return fsNormalize(cwdParts.concat(inputPath.split("/")).join("/"));
}

function fsGetNode(parts) {
  let node = FS_ROOT;
  for (const p of parts) {
    if (!node || node.type !== "dir" || !node.children[p]) return null;
    node = node.children[p];
  }
  return node;
}

function fsPathString(parts) {
  return "/" + parts.join("/");
}

function fsDisplayPath(parts) {
  //real linux imitation sort of thing here since ~follows the arch or fedoran distinguish
  const full = fsPathString(parts);
  const homePath = `/home/${HOME_NAME}`;
  if (full === homePath) return "~";
  if (full.startsWith(homePath + "/")) return "~" + full.slice(homePath.length);
  return full;
}
