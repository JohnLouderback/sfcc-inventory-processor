import Args = require('arg-parser');
import * as cheerio from 'cheerio';
import * as chrono from 'chrono-node';
import * as fs from 'fs';
import readline = require('readline-sync');
import * as util from 'util';
import beautify = require('xml-beautifier');
import * as moment from 'moment';

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const args = new Args('Inventory XML Parser', '1.0')
args.add({ name: 'input', desc: 'input inventory file', required: true, switches: [ '-i', '--input-file'], value: 'input_file'});
args.add({ name: 'output', desc: 'output inventory file', required: true, switches: [ '-o', '--output-file'], value: 'output_file'});
args.parse();

const now = (): string => {
  return `[${moment().format('h:mm:ss a')}]`;
}

(async () => {
  const inputFile = args.params.input;
  const outputFile = args.params.output;

  if (!inputFile || !outputFile) return;

  console.log(now() + ' Loading and parsing input/output files');
  const $ = cheerio.load(await readFile(inputFile), {
    xmlMode: true
  });

  const $2 = cheerio.load(await readFile(outputFile), {
    xmlMode: true
  });

  // Get the product ID we want to filter down to.
  const masterProdIDs: Array<string> = readline.question('Enter master product ID(s) to add to output file (comma separated):\n').split(',').map((id: string) => id.trim());

  // Ensure there are products to add, otherwise continue
  if (masterProdIDs.length) {
    console.log(now() + ' Gettings all records');

    const $records = $('records record');

    console.log(now() + ` There are ${$records.length} inventory records in the input inventory file`);

    const $outputRecords = $2('records');

    console.log(now() + ' Removing irrelevant records');
    // Remove all irrelevant products based on generated selector
    $records.each((i, el) => {
      const $el = $(el);
      const currentProductID = $el.attr('product-id');

      if (masterProdIDs.some(prodID => currentProductID.trim().startsWith(prodID))) {
        // Zero out allocations and ATS
        $el.find('allocation').text('0');
        $el.find('ats').text('0');

        // Add this record to the output file records
        $outputRecords.append($el);
      }
    })

    console.log(now() + ` There are ${$outputRecords.find('record').length} records matching ID(s) ${masterProdIDs.join(', ')}`);

    console.log(now() + ' Adding records to output file');

    const outRecordEls = [...$2('record')];

    console.log(now() + ' Sorting records in output file');

    // Sort the record els by their product-id
    outRecordEls.sort((a, b) => {
      if($(a).attr('product-id') < $(b).attr('product-id')) { return -1; }
      if($(a).attr('product-id') > $(b).attr('product-id')) { return 1; }
      return 0;
    });

    console.log(now() + ' Replacing records in output file with sorted records');

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

    if (readline.keyInYN(`Should the same "back in stock" date be used for all of these products? There are ${productIDs} matching products.`)) {
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