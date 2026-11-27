import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../tests/fixtures');

async function generateFinanceXlsx() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Alice Finance';
  wb.lastModifiedBy = 'Bob Controller';
  wb.company = 'Acme Holdings LLC';
  wb.title = 'Q3 Confidential Financial Report';

  // Sheet 1: Q3_Payroll (with formulas, custom column widths, rich text, hyperlink)
  const sheet1 = wb.addWorksheet('Q3_Payroll');
  sheet1.columns = [
    { header: 'Employee Email', key: 'email', width: 32 },
    { header: 'IBAN', key: 'iban', width: 30 },
    { header: 'Amount (USD)', key: 'amount', width: 18 },
    { header: 'Phone', key: 'phone', width: 22 },
  ];

  sheet1.addRow({
    email: 'alice.smith@acme-corp.com',
    iban: 'DE89 3704 0044 0532 0130 00',
    amount: 12000,
    phone: '+1-415-555-0199',
  });
  sheet1.addRow({
    email: 'bob.jones@acme-corp.com',
    iban: 'GB29 NWBK 6016 1331 9268 19',
    amount: 15000,
    phone: '(415) 555-0142',
  });
  sheet1.addRow({
    email: {
      richText: [
        { text: 'Lead: ', font: { bold: false } },
        { text: 'carol', font: { bold: true } },
        { text: '@acme-corp.com', font: { italic: true } },
      ],
    },
    iban: 'NL91 ABNA 0417 1643 00',
    amount: 8000,
    phone: '+44 20 7946 0958',
  });

  // Total row with real Excel formula
  const totalRow = sheet1.addRow({
    email: 'TOTAL',
    iban: '',
    amount: { formula: 'SUM(C2:C4)', result: 35000 },
    phone: '',
  });
  totalRow.font = { bold: true };

  // Sheet 2: Vendor_Payouts (reuses alice.smith@acme-corp.com to test cross-sheet consistency)
  const sheet2 = wb.addWorksheet('Vendor_Payouts');
  sheet2.columns = [
    { header: 'Approver', key: 'approver', width: 30 },
    { header: 'SWIFT', key: 'swift', width: 26 },
    { header: 'Tax SSN', key: 'ssn', width: 18 },
  ];
  sheet2.addRow({
    approver: 'alice.smith@acme-corp.com',
    swift: 'SWIFT: DEUTDEFF500',
    ssn: '123-45-6789',
  });

  const outPath = path.join(FIXTURES_DIR, 'sample-finance.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`Generated ${outPath}`);
}

async function generateContractDocx() {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
  );

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`,
  );

  // Deliberately splits email and phone across multiple <w:r><w:t> runs with bold/italic styling!
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r><w:t xml:space="preserve">Master Services Agreement — Primary Contact: </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>alice</w:t></w:r>
      <w:r><w:t>.smith@</w:t></w:r>
      <w:r><w:rPr><w:i/></w:rPr><w:t>acme-corp.com</w:t></w:r>
      <w:r><w:t xml:space="preserve"> (Direct: </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>+1-415</w:t></w:r>
      <w:r><w:t>-555-0199</w:t></w:r>
      <w:r><w:t>).</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Settlement IBAN</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>DE89 3704 0044 0532 0130 00</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Signatory SSN</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>123-45-6789</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId1"/>
      <w:footerReference w:type="default" r:id="rId2"/>
    </w:sectPr>
  </w:body>
</w:document>`,
  );

  zip.file(
    'word/header1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:r><w:t>CONFIDENTIAL — Legal Contact: legal@acme-corp.com</w:t></w:r>
  </w:p>
</w:hdr>`,
  );

  zip.file(
    'word/footer1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:r><w:t>Copy sent to alice.smith@acme-corp.com | Hotline: (415) 555-0142</w:t></w:r>
  </w:p>
</w:ftr>`,
  );

  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Acme Confidential Contract</dc:title>
  <dc:creator>Jane Counsel</dc:creator>
  <cp:lastModifiedBy>John Partner</cp:lastModifiedBy>
</cp:coreProperties>`,
  );

  zip.file(
    'docProps/app.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Company>Acme Legal LLP</Company>
  <Manager>Jane Counsel</Manager>
</Properties>`,
  );

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const outPath = path.join(FIXTURES_DIR, 'sample-contract.docx');
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated ${outPath}`);
}

await generateFinanceXlsx();
await generateContractDocx();
