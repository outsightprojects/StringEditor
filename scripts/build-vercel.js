const fsp = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const BUILD_DIR = path.join(ROOT, "build");

const STATIC_FILES = ["index.html", "app.js", "styles.css"];

async function copyIfExists(source, destination) {
  try {
    await fsp.copyFile(source, destination);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function main() {
  await fsp.rm(BUILD_DIR, { recursive: true, force: true });
  await fsp.mkdir(BUILD_DIR, { recursive: true });
  await fsp.mkdir(path.join(BUILD_DIR, "public"), { recursive: true });

  for (const file of STATIC_FILES) {
    await fsp.copyFile(path.join(ROOT, file), path.join(BUILD_DIR, file));
  }

  await copyIfExists(
    path.join(ROOT, "public", "screenshot.jpeg"),
    path.join(BUILD_DIR, "public", "screenshot.jpeg")
  );

  console.log("Built Vercel static output in build/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
