/* Builds dist/cinderwake.html: the whole game in one self-contained file.
   Usage: node tools/bundle.js */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => "<style>\n" + css + "</style>");
const files = [];
html = html.replace(/<script src="js\/([\w-]+\.js)"><\/script>\n?/g, (m, f) => { files.push(f); return ""; });
const js = files.map((f) => "/* ---- " + f + " ---- */\n" + fs.readFileSync(path.join(root, "js", f), "utf8")).join("\n");
if (/<\/script/i.test(js)) throw new Error("a script close tag inside the JavaScript would break the bundle");
html = html.replace("</body>", () => '<script>\n' + js + "\n</script>\n</body>");
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/cinderwake.html"), html);
console.log("dist/cinderwake.html", Math.round(html.length / 1024) + " kB from", files.length, "scripts");
