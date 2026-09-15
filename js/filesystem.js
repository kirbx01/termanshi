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

        mx3ro: file(
`A BFS traversal implementation in go also focusing on the capped dfs since it has to render a minimum of 5 routes. This uses lipgloss for rendering and beautifying the terminal and termenv so to have consistent colours across xterm standards`,
          "https://github.com/kirbx01/mx3ro/"),

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
        Instagram: file("Graphic design & visual work.\ncurl Instagram -> opens profile", "https://www.instagram.com/vyox3l")
      }),
//media (music,video streaming)
      media: dir({
        Spotify: file("What I listen to while soldering.\ncurl Spotify -> opens profile", "https://open.spotify.com/user/615hglvwo1oe64zlk8matve1b?si=7284840f2b5c4fb5"),
      }),
//socials
      socials: dir({
        GitHub: file("Code & firmware repos.\ncurl GitHub -> opens profile", "https://github.com/kirbx01"),
      }),
//blogs -- your blog posts live here
//Update the title (the key before the colon), the text content, and the
//url (second arg of file()) and the Blogs menu will pick them up +
//clicking one in the terminal opens the url in a new tab.
//To edit a post (or write a new one) type `sm` in the terminal.
      blogs: dir({
        "blog-1-hasi-mazak": file(
`## Blog #1 - Hello soldering world

I just hope to know something when i complete these`),

        "blog-2-hasi-mazak2-since-ihavencluewhattoput": file(
`## Blog #2 - How I riced my setup

HI`),

        "blog-3-idontwriteblogssoewu-infutureill": file(
`## Blog #3 - Kei, Osaka and engineering

Short one today. **Kei**, **Osaka** and engineering keep me going.

- **Kei** - feelings are hard, firmware is easy
- **Osaka** - too powerful for this world
- **DIO BRANDO** - menace in a scarf

Until next time.`),
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
