// Run with: node --require ./tests/register.cjs scripts/benchmark-ocr.cjs manifest.json --confirm-anonymized
// The explicit flag authorizes sending the manifest's photos to configured providers.
const fs = require('node:fs/promises');
const path = require('node:path');
const {configuredProviders, parseReceipt} = require('../src/lib/receiptOcr.ts');
const {callReceiptProvider} = require('../src/lib/receiptProviders.ts');
const {scoreReceipt} = require('../src/lib/ocrBenchmark.ts');
const mime = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png'};
async function main() {
 const manifestPath = process.argv[2];
 if (!manifestPath || !process.argv.includes('--confirm-anonymized')) throw new Error('Usage: manifest.json --confirm-anonymized. Use anonymized photos only.');
 const manifest = JSON.parse(await fs.readFile(manifestPath,'utf8'));
 if (!Array.isArray(manifest) || !manifest.length || manifest.length > 50) throw new Error('Use 1–50 anonymized fixtures.');
 const base = path.dirname(path.resolve(manifestPath));
 // Validate all fixtures before any billable request. Neither extracted values nor images are logged.
 const fixtures = [];
 for (const row of manifest) {
  if (!row || typeof row.image !== 'string' || !row.expected || typeof row.expected !== 'object' || Array.isArray(row.expected)) throw new Error('Invalid fixture.');
  scoreReceipt(row.expected,{});
  const filename = path.resolve(base,row.image), relative = path.relative(base,filename);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Keep images inside the manifest directory.');
  const mimeType = mime[path.extname(filename).toLowerCase()];
  const bytes = await fs.readFile(filename);
  if (!mimeType || bytes.length > 4*1024*1024 || !bytes.length) throw new Error('Use JPG/PNG fixtures up to 4 MB.');
  fixtures.push({expected:row.expected,input:{mimeType,base64:bytes.toString('base64')}});
 }
 const providers = configuredProviders(process.env);
 if (!providers.length) throw new Error('No configured API providers. Export server variables first.');
 for (const provider of providers) {
  const times=[];let failed=0,correct=0,total=0;
  for (const fixture of fixtures) {
   total += Object.keys(fixture.expected).length;
   const start=performance.now();
   try {const result=parseReceipt(await callReceiptProvider(provider,fixture.input,new AbortController().signal));correct+=scoreReceipt(fixture.expected,result).correct;}
   catch {failed++;}
   times.push(Math.round(performance.now()-start));
  }
  times.sort((a,b)=>a-b);
  console.log(JSON.stringify({provider,fixtures:fixtures.length,failed,correctFields:correct,totalFields:total,accuracy:correct/total,medianMs:times.length%2 ? times[Math.floor(times.length/2)] : (times[times.length/2-1]+times[times.length/2])/2,p95Ms:times[Math.ceil(times.length*.95)-1]}));
 }
}
main().catch(()=>{console.error('Benchmark failed. Check arguments, anonymized fixtures and server configuration. No receipt contents are printed.');process.exitCode=1;});
