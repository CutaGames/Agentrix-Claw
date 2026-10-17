/**
 * 生成 Expo 所需的占位符资源文件
 * 使用纯色 PNG 作为占位符
 */
const fs = require('fs');
const path = require('path');

// 简单的 PNG 生成函数 (1x1 像素，然后让 Expo 处理)
// 这是一个最小的有效 PNG 文件

// 创建简单的纯色 PNG (使用 Agentrix 品牌色 #0B1220)
function createPlaceholderPNG(width, height, color = { r: 11, g: 18, b: 32 }) {
  // 最小有效 PNG 头
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  
  // IHDR chunk
  const IHDR_DATA = Buffer.alloc(13);
  IHDR_DATA.writeUInt32BE(width, 0);
  IHDR_DATA.writeUInt32BE(height, 4);
  IHDR_DATA[8] = 8; // bit depth
  IHDR_DATA[9] = 2; // color type (RGB)
  IHDR_DATA[10] = 0; // compression method
  IHDR_DATA[11] = 0; // filter method
  IHDR_DATA[12] = 0; // interlace method
  
  const IHDR = createChunk('IHDR', IHDR_DATA);
  
  // IDAT chunk (compressed image data)
  const zlib = require('zlib');
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 3)] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const offset = y * (1 + width * 3) + 1 + x * 3;
      rawData[offset] = color.r;
      rawData[offset + 1] = color.g;
      rawData[offset + 2] = color.b;
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const IDAT = createChunk('IDAT', compressed);
  
  // IEND chunk
  const IEND = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([PNG_SIGNATURE, IHDR, IDAT, IEND]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xffffffff;
  const table = makeCRCTable();
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCRCTable() {
  const table = new Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

// 生成资源文件
const assetsDir = path.join(__dirname);

const assets = [
  { name: 'icon.png', width: 1024, height: 1024 },
  { name: 'adaptive-icon.png', width: 1024, height: 1024 },
  { name: 'splash.png', width: 1242, height: 2436 },
  { name: 'favicon.png', width: 48, height: 48 },
];

console.log('🎨 生成 Expo 资源文件...');

assets.forEach(asset => {
  const filePath = path.join(assetsDir, asset.name);
  if (!fs.existsSync(filePath)) {
    const png = createPlaceholderPNG(asset.width, asset.height);
    fs.writeFileSync(filePath, png);
    console.log(`  ✅ 创建 ${asset.name} (${asset.width}x${asset.height})`);
  } else {
    console.log(`  ⏭️  跳过 ${asset.name} (已存在)`);
  }
});

console.log('✨ 资源文件生成完成！');
console.log('💡 提示: 请用实际的品牌图标替换这些占位符文件');
