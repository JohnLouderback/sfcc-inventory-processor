import Args = require('arg-parser');
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import readline = require('readline-sync');
import * as util from 'util';
import beautify = require('xml-beautifier');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const args = new Args('Inventory XML Parser', '1.0')
args.add({ name: 'input', desc: 'input inventory file', required: true, switches: [ '-i', '--input-file'], value: 'file' });
args.add({ name: 'output', desc: 'output inventory file', required: true, switches: [ '-o', '--output-file'], value: 'file' });
args.parse();

(async () => {
  const inputFile = args.params.input;
  const outputFile = args.params.output;

  const $ = cheerio.load(await readFile(inputFile), {
    xmlMode: true
  });

  // Get the product ID we want to filter down to.
  const masterProdID = readline.question('Enter master product ID:\n').trim();

  // Remove all irrelevant products
  $('records record').not(`[product-id^="${masterProdID}"]`).remove();

  const $recordEls = $('records record');

  // Zero out allocations and ATS
  $recordEls.find('allocation').text('0');
  $recordEls.find('ats').text('0');

  // Set allocation timestamp date to today
  $recordEls.find('allocation-timestamp').text(new Date().toISOString());

  const $2 = cheerio.load(await readFile(outputFile), {
    xmlMode: true
  });

  // Add record els from the original file to the output file
  $2('records').append($recordEls);

  const outRecordEls = [...$2('record')];

  // Sort the record els by their product-id
  outRecordEls.sort((a, b) => {
     return Number($(a).attr('product-id') > $(b).attr('product-id'));
  });

  // Clear out the records and add in the sorted records
  $2('records').html('').append(outRecordEls);

  // console.log(beautify($2.html()));
  writeFile(outputFile, beautify($2.html()));
})();