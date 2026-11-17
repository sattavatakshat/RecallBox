#!/usr/bin/env node
/** Lightweight source-policy check, not a UI or behavior test suite. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const failures = [];
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => entry.isDirectory()
    ? files(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
}
for (const file of [...files(path.join(root, 'app')), ...files(path.join(root, 'src'))]) {
  const relative = path.relative(root, file);
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const issue = (node, message) => {
    const {line} = ast.getLineAndCharacterOfPosition(node.getStart(ast));
    failures.push(`${relative}:${line + 1}: ${message}`);
  };
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const module = node.moduleSpecifier.text;
      if (module.startsWith('lucide-react-native') && relative !== 'src/icons.tsx') issue(node, 'Use the shared Icon wrapper.');
      if (module === 'expo-font' && relative !== 'src/theme.tsx') issue(node, 'Fonts load once in DesignSystemProvider.');
      if (module === 'react-native' && relative !== 'src/ui.tsx' && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        for (const spec of node.importClause.namedBindings.elements) {
          const original = spec.propertyName?.text ?? spec.name.text;
          if (['Text', 'TextInput', 'ActivityIndicator'].includes(original)) issue(spec, `Use shared ${original === 'Text' ? 'Type' : original === 'TextInput' ? 'Input' : 'LoadingIndicator'}.`);
        }
      }
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(ast).replace(/['"]/g, '');
      const value = node.initializer;
      if (ts.isStringLiteral(value) && /^(#[\da-f]{3,8}|rgba?\()/i.test(value.text)) issue(value, 'Colors belong in design-tokens.json.');
      if (['fontSize', 'lineHeight', 'fontFamily', 'letterSpacing'].includes(name) &&
          (ts.isNumericLiteral(value) || ts.isStringLiteral(value)) && relative !== 'src/theme.tsx') issue(value, 'Use a shared typography role.');
      if (['elevation', 'shadowOpacity', 'shadowRadius', 'shadowOffset'].includes(name) && relative !== 'src/theme.tsx') issue(value, 'Use tokens.elevation.');
    }
    if ((ts.isStringLiteral(node) || ts.isJsxText(node)) && /^[★☆◷☼◇◉▤▧≡↗✓✕☰☑□⌘›⌄×]$/.test(node.text.trim())) issue(node, 'Use an outline Icon, not a Unicode UI glyph.');
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const tokens = require('../src/design-tokens.json');
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
const pairs = [['primaryText', 'background'], ['primaryText', 'surface'], ['secondaryText', 'background'],
  ['mutedText', 'background'], ['onAccent', 'accent'], ['selectedText', 'selectedSurface'],
  ['error', 'background'], ['success', 'background'], ['warning', 'background'], ['information', 'background']];
for (const [mode, palette] of Object.entries(tokens.colors)) {
  for (const [foreground, background] of pairs) {
    const a = luminance(palette[foreground]), b = luminance(palette[background]);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < 4.5) failures.push(`${mode}: ${foreground}/${background} contrast ${ratio.toFixed(2)} is below 4.5:1.`);
  }
}
const native = spawnSync(process.execPath, [path.join(__dirname, 'sync-design-system.cjs'), '--check'], {stdio: 'inherit'});
if (native.status !== 0) failures.push('Regenerate native resources with npm run design:sync.');
if (failures.length) {console.error(failures.join('\n')); process.exitCode = 1;}
else console.log('Design-system source, icon, font, contrast and native-resource checks passed.');
