// Quick script to generate minimal PNG icons for the extension
// Run: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

// Minimal valid PNG generator (solid colored square)
function createPNG(size) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type (RGB)
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace

  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk - uncompressed image data
  // Each row: filter byte (0) + RGB pixels
  const rowSize = 1 + size * 3;
  const rawData = Buffer.alloc(rowSize * size);

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // No filter
    for (let x = 0; x < size; x++) {
      const pixOffset = rowOffset + 1 + x * 3;
      // VIA-like accent color: #5599ee
      rawData[pixOffset] = 0x55;     // R
      rawData[pixOffset + 1] = 0x99; // G
      rawData[pixOffset + 2] = 0xee; // B
    }
  }

  // Use zlib deflate
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const assetsDir = path.join(__dirname, '..', 'src', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const png = createPNG(size);
  fs.writeFileSync(path.join(assetsDir, `icon${size}.png`), png);
  console.log(`Created icon${size}.png`);
}
