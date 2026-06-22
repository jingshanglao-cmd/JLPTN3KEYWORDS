import fs from 'node:fs';
import zlib from 'node:zlib';

const SOURCE = new URL('./source.pdf', import.meta.url);
const OUTPUT = new URL('./words.js', import.meta.url);
const pdf = fs.readFileSync(SOURCE);
const latin = pdf.toString('latin1');

const objects = new Map();
const matches = [...latin.matchAll(/(\d+)\s+(\d+)\s+obj\b/g)];
for (let i = 0; i < matches.length; i += 1) {
  const start = matches[i].index + matches[i][0].length;
  const end = i + 1 < matches.length ? matches[i + 1].index : latin.length;
  let body = latin.slice(start, end);
  const marker = body.lastIndexOf('endobj');
  if (marker >= 0) body = body.slice(0, marker);
  objects.set(Number(matches[i][1]), body);
}

function decodedStream(id) {
  const body = objects.get(id);
  const streamAt = body.indexOf('stream');
  let start = streamAt + 6;
  if (body.charCodeAt(start) === 13 && body.charCodeAt(start + 1) === 10) start += 2;
  else if (body.charCodeAt(start) === 10) start += 1;
  const end = body.lastIndexOf('endstream');
  const raw = Buffer.from(body.slice(start, end), 'latin1');
  return body.includes('/FlateDecode') ? zlib.inflateSync(raw) : raw;
}

function unicodeHex(hex) {
  const bytes = Buffer.from(hex, 'hex');
  let value = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    value += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  }
  return value;
}

function parseCMap(id) {
  const lines = decodedStream(id).toString('latin1').split(/\r?\n/);
  const map = new Map();
  let mode = '';
  for (const line of lines) {
    if (/beginbfchar/.test(line)) { mode = 'char'; continue; }
    if (/endbfchar/.test(line)) { mode = ''; continue; }
    if (/beginbfrange/.test(line)) { mode = 'range'; continue; }
    if (/endbfrange/.test(line)) { mode = ''; continue; }
    const hexes = [...line.matchAll(/<([0-9A-Fa-f]+)>/g)].map((item) => item[1]);
    if (mode === 'char' && hexes.length >= 2) {
      map.set(parseInt(hexes[0], 16), unicodeHex(hexes[1]));
    } else if (mode === 'range' && hexes.length >= 3 && !line.includes('[')) {
      const first = parseInt(hexes[0], 16);
      const last = parseInt(hexes[1], 16);
      const unicodeStart = parseInt(hexes[2], 16);
      for (let code = first; code <= last; code += 1) {
        map.set(code, String.fromCodePoint(unicodeStart + code - first));
      }
    }
  }
  return map;
}

const highFrequencyFonts = {
  FT14: parseCMap(20),
  FT19: parseCMap(25),
  FT24: parseCMap(30),
  FT29: parseCMap(35),
  FT9: parseCMap(40),
};

const singleFrequencyFonts = {
  FT14: parseCMap(83),
  FT19: parseCMap(88),
  FT9: parseCMap(93),
};

function decodeHex(hex, map) {
  let text = '';
  for (let i = 0; i < hex.length; i += 4) {
    text += map.get(parseInt(hex.slice(i, i + 4), 16)) || '�';
  }
  return text;
}

function pageItems(contentId, fonts = highFrequencyFonts) {
  const content = decodedStream(contentId).toString('latin1');
  const items = [];
  for (const match of content.matchAll(/BT([\s\S]*?)ET/g)) {
    const block = match[1];
    const fontMatch = block.match(/\/(FT\d+)\s+[\d.]+\s+Tf/);
    if (!fontMatch || !fonts[fontMatch[1]]) continue;
    const matrices = [...block.matchAll(/[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+([\d.-]+)\s+([\d.-]+)\s+Tm/g)];
    if (!matrices.length) continue;
    const matrix = matrices[matrices.length - 1];
    let text = '';
    for (const hex of block.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      text += decodeHex(hex[1], fonts[fontMatch[1]]);
    }
    const prefix = content.slice(Math.max(0, match.index - 1200), match.index);
    const rectangles = [...prefix.matchAll(/([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+re\s*W\* n/g)];
    const cell = rectangles[rectangles.length - 1];
    if (text) items.push({
      font: fontMatch[1], x: +matrix[1], y: +matrix[2], text,
      cellX: cell ? +cell[1] : null,
      cellY: cell ? +cell[2] : null,
    });
  }
  return items;
}

function rowsFrom(contentId) {
  const items = pageItems(contentId, highFrequencyFonts);
  const rows = [];
  const frequencies = items.filter((item) => item.font === 'FT24' && /^\d+$/.test(item.text));
  for (const frequency of frequencies) {
    const term = items.find((item) => item.font === 'FT19' && Math.abs(item.y - frequency.y) < 1.2);
    const meanings = items
      .filter((item) => item.font === 'FT29' && Math.abs(item.y - frequency.y) < 1.2)
      .sort((a, b) => a.x - b.x);
    if (term && meanings.length) {
      rows.push({ raw: term.text, frequency: Number(frequency.text), meaning: meanings.map((item) => item.text).join('') });
    }
  }
  return rows;
}

function singleFrequencyRowsFrom(contentId) {
  const items = pageItems(contentId, singleFrequencyFonts).filter((item) => item.cellX !== null);
  const cells = new Map();
  for (const item of items) {
    const key = `${item.cellX.toFixed(2)}|${item.cellY.toFixed(2)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(item);
  }
  const groups = [...cells.values()].map((cellItems) => ({
    cellX: cellItems[0].cellX,
    cellY: cellItems[0].cellY,
    font: cellItems[0].font,
    text: cellItems.sort((a, b) => a.y - b.y || a.x - b.x).map((item) => item.text).join(''),
  }));
  const rows = [];
  for (const term of groups.filter((group) => group.font === 'FT14')) {
    const meaning = groups
      .filter((group) => group.font === 'FT19' && Math.abs(group.cellY - term.cellY) < 0.1 && group.cellX > term.cellX)
      .sort((a, b) => a.cellX - b.cellX)[0];
    if (meaning) rows.push({ raw: term.text, frequency: 1, meaning: meaning.text });
  }
  return rows;
}

const repeatedPages = [13, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74];
const singlePages = [76, 95, 97, 99, 101, 103, 105, 107, 109, 111, 113, 115, 117, 119, 121];
const rows = [...repeatedPages.flatMap(rowsFrom), ...singlePages.flatMap(singleFrequencyRowsFrom)];
const words = rows.map((row, index) => {
  const parsed = row.raw.match(/^(.*?)（([^）]+)）$/);
  return {
    id: index + 1,
    word: parsed ? parsed[1] : row.raw,
    reading: parsed ? parsed[2] : '',
    meaning: row.meaning,
    frequency: row.frequency,
  };
});

if (words.length !== 1015) throw new Error(`Expected 1,015 words, extracted ${words.length}`);
fs.writeFileSync(OUTPUT, `window.WORDS = ${JSON.stringify(words, null, 2)};\n`, 'utf8');
console.log(`Extracted ${words.length} words to words.js`);

export { decodedStream, pageItems, parseCMap, highFrequencyFonts, singleFrequencyFonts };
