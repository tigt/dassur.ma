const lfsBucket = require("./lfs-bucket");
const BigCachedFunction = require("./big-cached-function");

const { readFile, writeFile, access } = require("fs").promises;
const { dirname, join } = require("path");
const { promisify } = require("util");

const mkdirp = require("mkdirp");
const { tmpName } = require("tmp");
const { convert } = require("imagemagick");
const exifParser = require("exif-parser");

const mkdirpP = promisify(mkdirp);
const tmpNameP = promisify(tmpName);
const convertP = promisify(convert);

const cache = new BigCachedFunction("photos");

async function exists(path) {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

async function downloadGalleryPhoto({ page, file }) {
  const { key, value: photo } = await cache.get(file, () =>
    lfsBucket.get(file)
  );
  const outputDir = dirname(page.outputPath);
  await mkdirpP(outputDir);
  const outputPath = join(outputDir, file);
  if (!(await exists(outputPath))) {
    await writeFile(outputPath, photo);
  }
  return key;
}
async function thumbGalleryPhoto({ file, quality, width, height, resolution }) {
  const key = `${file}:${width}:${height}:${quality}:${resolution}`;
  return cache.get(key, async () => {
    const { key: photoPath } = await cache.get(file, () => lfsBucket.get(file));
    const tmpName = await tmpNameP();
    await convertP([
      photoPath,
      "-resize",
      `${Math.floor(width * resolution)}x${Math.floor(height * resolution)}`,
      "-quality",
      `${quality}`,
      tmpName
    ]);
    return await readFile(tmpName);
  });
}
async function getEXIF({ file }) {
  const key = `${file}:EXIF`;
  const { value } = await cache.get(key, async () => {
    const { key: photoPath } = await cache.get(file, () => lfsBucket.get(file));
    const buffer = await readFile(photoPath);
    const parser = exifParser.create(buffer);
    parser.enableSimpleValues(false);
    const { tags: exif } = parser.parse();
    return JSON.stringify(exif);
  });
  return JSON.parse(value);
}

module.exports = { downloadGalleryPhoto, thumbGalleryPhoto, getEXIF };
