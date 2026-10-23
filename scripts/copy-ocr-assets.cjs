#!/usr/bin/env node
'use strict';

/**
 * Copies the pinned Tesseract.js browser engine, LSTM WASM variants and the
 * official Spanish language package into public/ocr. The app loads these from
 * its own origin only; tesseract.js is never allowed to fall back to a CDN.
 *
 * Generated files are ignored by git. Run automatically before dev/build, or
 * manually with: npm run ocr:assets
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'public', 'ocr');
const checkOnly = process.argv.includes('--check');

const CORE_FILES = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];
const LANGUAGE_FILE = 'spa.traineddata.gz';
const LANGUAGE_DIRECTORY = '4.0.0_best_int';

function packageRoot(specifier) {
  return path.dirname(require.resolve(`${specifier}/package.json`));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function requireFile(file, label) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Falta ${label}: ${path.relative(root, file)}. Ejecuta npm install antes de generar los activos.`);
  }
  if (fs.statSync(file).size === 0) throw new Error(`${label} está vacío: ${path.relative(root, file)}.`);
}

function buildPlan() {
  const tesseractRoot = packageRoot('tesseract.js');
  const coreRoot = packageRoot('tesseract.js-core');
  const languageRoot = packageRoot('@tesseract.js-data/spa');
  const tesseractPackage = readJson(path.join(tesseractRoot, 'package.json'));
  const corePackage = readJson(path.join(coreRoot, 'package.json'));
  const languagePackage = readJson(path.join(languageRoot, 'package.json'));

  const files = [
    {
      source: path.join(tesseractRoot, 'dist', 'worker.min.js'),
      target: 'worker.min.js',
      label: 'worker de Tesseract.js',
    },
    ...CORE_FILES.map((name) => ({
      source: path.join(coreRoot, name),
      target: path.posix.join('core', name),
      label: `núcleo LSTM ${name}`,
    })),
    {
      source: path.join(languageRoot, LANGUAGE_DIRECTORY, LANGUAGE_FILE),
      target: path.posix.join('lang', LANGUAGE_FILE),
      label: 'datos de idioma español',
    },
    {
      source: path.join(tesseractRoot, 'LICENSE.md'),
      target: path.posix.join('licenses', 'tesseract.js-LICENSE.md'),
      label: 'licencia de Tesseract.js',
    },
    {
      source: path.join(coreRoot, 'LICENSE'),
      target: path.posix.join('licenses', 'tesseract.js-core-LICENSE'),
      label: 'licencia de Tesseract.js core',
    },
  ];

  for (const file of files) requireFile(file.source, file.label);

  const notice = [
    'Activos OCR locales generados por scripts/copy-ocr-assets.cjs',
    '',
    `tesseract.js ${tesseractPackage.version} (${tesseractPackage.license})`,
    `tesseract.js-core ${corePackage.version} (${corePackage.license})`,
    `@tesseract.js-data/spa ${languagePackage.version} (${languagePackage.license})`,
    `Idioma: ${LANGUAGE_DIRECTORY}/${LANGUAGE_FILE}`,
    '',
    'Estos archivos se sirven únicamente desde el mismo origen de la aplicación.',
    'No se descargan modelos desde CDN ni desde orígenes desconocidos en tiempo de ejecución.',
    '',
  ].join('\n');

  return { files, notice, packages: {
    'tesseract.js': tesseractPackage.version,
    'tesseract.js-core': corePackage.version,
    '@tesseract.js-data/spa': languagePackage.version,
  } };
}

function verifyExisting(plan) {
  const missing = plan.files.filter((file) => !fs.existsSync(path.join(destination, file.target)));
  const manifestFile = path.join(destination, 'assets.json');
  if (!fs.existsSync(manifestFile)) missing.push({ target: 'assets.json' });
  if (missing.length) {
    throw new Error(`Activos OCR incompletos: ${missing.map((file) => file.target).join(', ')}. Ejecuta npm run ocr:assets.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  for (const file of plan.files) {
    const expected = manifest.files?.[file.target];
    const actual = sha256(path.join(destination, file.target));
    if (!expected || expected.sha256 !== actual) {
      throw new Error(`El activo ${file.target} no coincide con el manifiesto generado. Ejecuta npm run ocr:assets.`);
    }
  }
  console.log(`Activos OCR verificados (${plan.files.length} archivos) en public/ocr.`);
}

function writeAssets(plan) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  const manifest = { generatedBy: 'scripts/copy-ocr-assets.cjs', packages: plan.packages, files: {} };
  for (const file of plan.files) {
    const target = path.join(destination, file.target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.source, target);
    const bytes = fs.statSync(target).size;
    manifest.files[file.target] = { bytes, sha256: sha256(target) };
  }
  fs.writeFileSync(path.join(destination, 'NOTICE.txt'), plan.notice, 'utf8');
  fs.writeFileSync(path.join(destination, 'assets.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const totalBytes = Object.values(manifest.files).reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(`Activos OCR generados en public/ocr (${(totalBytes / (1024 * 1024)).toFixed(1)} MB, ${plan.files.length} archivos).`);
}

try {
  const plan = buildPlan();
  if (checkOnly) verifyExisting(plan);
  else writeAssets(plan);
} catch (error) {
  console.error(`No se pudieron preparar los activos OCR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
