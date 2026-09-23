#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");

function includeFile(relativePath, parents = []) {
  const file = path.resolve(root, relativePath);
  if (!file.startsWith(root + path.sep)) throw new Error(`Include is outside the site: ${relativePath}`);
  if (parents.includes(file)) throw new Error(`Circular include: ${relativePath}`);
  const source = fs.readFileSync(file, "utf8");
  return source.replace(/^[ \t]*<!-- include: ([^>]+?) -->[ \t]*$/gm, (_, child) =>
    includeFile(child.trim(), [...parents, file]).trimEnd()
  );
}

const html = includeFile("src/page.html")
  .replace(/\b(href|src)="(assets\/[^"?]+\.(?:css|js))"/g, (_, attribute, asset) => {
    const version = fs.readFileSync(path.join(root, asset))
      .reduce((checksum, byte) => Math.imul(checksum ^ byte, 16777619) >>> 0, 2166136261);
    return `${attribute}="${asset}?v=${version}"`;
  });
fs.writeFileSync(path.join(root, "index.html"), html);
console.log("index.html written from src/page.html and src/sections/");
