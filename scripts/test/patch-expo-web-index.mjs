import fs from 'node:fs';
import path from 'node:path';

const indexPath = path.resolve(process.cwd(), 'dist', 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error(`Missing exported web entry: ${indexPath}`);
  process.exit(1);
}

const original = fs.readFileSync(indexPath, 'utf8');
const patched = original.replace(/<script(?![^>]*type=\"module\")([^>]*)src=\"([^\"]+)\"([^>]*)><\/script>/g, '<script type="module"$1src="$2"$3></script>');

if (patched !== original) {
  fs.writeFileSync(indexPath, patched, 'utf8');
}