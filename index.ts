import Args = require('arg-parser');
import * as cheerio from 'cheerio';
import * as chrono from 'chrono-node';
import * as fs from 'fs';
import readline = require('readline-sync');
import * as util from 'util';
import beautify = require('xml-beautifier');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const args = new Args('Inventory XML Parser', '1.0')
args.add({ name: 'input', desc: 'input inventory file', required: true, switches: [ '-i', '--input-file'], value: 'input_file'});
args.add({ name: 'output', desc: 'output inventory file', required: true, switches: [ '-o', '--output-file'], value: 'output_file'});
args.parse();

(async () => {
  const inputFile = args.params.input;
  const outputFile = args.params.output;

  if (!inputFile || !outputFile) return;

  const $ = cheerio.load(await readFile(inputFile), {
    xmlMode: true
  });

  const $2 = cheerio.load(await readFile(outputFile), {
    xmlMode: true
  });

  // Get the product ID we want to filter down to.
  const masterProdIDs = readline.question('Enter master product ID(s) to add to output file (comma separated):\n').split(',').map((id: string) => id.trim());

  // Ensure there are products to add, otherwise continue
  if (masterProdIDs.length) {
    // Generate a selector that matches all records except the ones specified
    const recordSelectors = masterProdIDs.map(id => `[product-id^="${id}"]`).join(', ');

    // Remove all irrelevant products based on generated selector
    $('records record').not(recordSelectors).remove();

    const $recordEls = $('records record');

    // Zero out allocations and ATS
    $recordEls.find('allocation').text('0');
    $recordEls.find('ats').text('0');

    // Add record els from the original file to the output file
    $2('records').append($recordEls);

    const outRecordEls = [...$2('record')];

    // Sort the record els by their product-id
    outRecordEls.sort((a, b) => {
      return Number($(a).attr('product-id') > $(b).attr('product-id'));
    });

    // Clear out the records and add in the sorted records
    $2('records').html('').append(outRecordEls);
  }

  // Set all allocation timestamp dates to today
  $2('records record allocation-timestamp').text(new Date().toISOString());

  // Ask to update any instock dates
  if (readline.keyInYN('Do you want to set any "back in stock" dates for any products?')) {
    const productIDs = readline.question('Enter product ID(s) you\'d like to update (comma separated):\n').split(',').map((id: string) => id.trim());

    // Add necessary "back in stock" elements, if missing, and update.
    const updateBISRecord = (productID: string, date: string) => {
      const $record = $2(`[product-id^=${productID}]`);

      if (!$record.length) throw new Error(`Product ${productID} not found in ${outputFile}`);

      // Try to find any current date and datetime elements for this record.
      let $recordDate: cheerio.Cheerio<any> = $record.find('in-stock-date');
      let $recordDateTime: cheerio.Cheerio<any> = $record.find('in-stock-datetime');
      const dateTime = chrono.parseDate(date);

      // If the date and datetime elements don't exist, create them.
      if (!$recordDate.length) $recordDate = $('<in-stock-date></in-stock-date>').insertBefore($record.find('ats'));
      if (!$recordDateTime.length) $recordDateTime = $('<in-stock-datetime></in-stock-datetime>').insertBefore($record.find('ats'));

      // Update the date and datetime elements with the specified date.
      $recordDate.text(dateTime.toISOString().replace(/T.*?Z/, 'Z'));
      $recordDateTime.text(dateTime.toISOString());
    }

    if (readline.keyInYN('Should the same "back in stock" date be used for all of these products?')) {
      const date = readline.question('Enter the "back in stock" date for these products:\n').trim();
      if (date) {
        productIDs.forEach((id: string) => updateBISRecord(id, date));
      }
    } else {
      for (const productID of productIDs) {
        const date = readline.question(`Enter the "back in stock" date for product ${productID}:\n`).trim();
        if (date) {
          updateBISRecord(productID, date);
        }
      }
    }
  }

  console.log(`Writing output to ${outputFile}`);
  writeFile(outputFile, beautify($2.html()));
})();