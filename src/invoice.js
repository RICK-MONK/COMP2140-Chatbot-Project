/**
 * File: src/invoice.js
 * Software Engineering Project (COMP2140)
 * Student: Patrick Marsden (620169874)
 * Feature: Invoice Generator (Fixed Layout & Spacing)
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function drawRow(doc, y, columns) {
    const colWidths = [180, 160, 80, 80]; // ACTIVITY | DESC | RATE | AMOUNT
    let x = 50;
    let maxHeight = 0;

    columns.forEach((col, i) => {
        const options = i >= 2 ? { width: colWidths[i], align: "right" } : { width: colWidths[i] };
        const height = doc.heightOfString(col, options);
        if (height > maxHeight) maxHeight = height;
        doc.text(col, x, y, options);
        x += colWidths[i];
    });

    return maxHeight + 10; // padding after row
}

function generateInvoicePDF(order, filename, docType = "INVOICE") {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const folderPath = path.join(__dirname, '../public/invoices');
        const filePath = path.join(folderPath, filename);
        
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // --- 1. HEADER ---
        doc.fillColor('#333333');
        doc.fontSize(20).font('Helvetica-Bold').text('WHITE ROSE', 50, 50);
        doc.fontSize(10).font('Helvetica').text('INTERIORS', 50, 75);
        
        doc.fontSize(10).text('Unit 32, The Trade Centre', 300, 50, { align: 'right' });
        doc.text('30-32 Red Hills Road', 300, 65, { align: 'right' });
        doc.text('Kingston 10, Jamaica', 300, 80, { align: 'right' });
        doc.text('+1 876 929 7688', 300, 95, { align: 'right' });
        doc.text('whiteroseinteriors@outlook.com', 300, 110, { align: 'right' });

        doc.moveDown();
        doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, 140).lineTo(550, 140).stroke();

        // --- 2. INFO ---
        const topInfo = 160;
        doc.fontSize(20).font('Helvetica-Bold').text(docType, 50, topInfo);
        
        doc.fontSize(10).font('Helvetica-Bold').text('BILL TO', 50, topInfo + 35);
        doc.font('Helvetica').text(order.name || "Valued Customer", 50, topInfo + 50);
        doc.text(`Phone: ${order.phone}`, 50, topInfo + 65);
        if (order.email && order.email !== 'N/A') {
            doc.text(order.email, 50, topInfo + 80);
        }

        doc.font('Helvetica-Bold').text(`${docType} #`, 400, topInfo + 35);
        doc.font('Helvetica').text(order.id, 500, topInfo + 35, { align: 'right' });
        doc.font('Helvetica-Bold').text('DATE', 400, topInfo + 50);
        doc.font('Helvetica').text(order.date, 500, topInfo + 50, { align: 'right' });

        // --- 3. TABLE HEADERS ---
        const tableTop = 290;
        doc.font('Helvetica-Bold');
        drawRow(doc, tableTop, ['ACTIVITY', 'DESCRIPTION', 'RATE', 'AMOUNT']);
        doc.moveTo(50, tableTop + 20).lineTo(550, tableTop + 20).stroke();

        // --- 4. ITEMS ---
        let y = tableTop + 35;
        doc.font('Helvetica');

        const basePrice = parseFloat(order.priceBreakdown?.base || 0);
        const installPrice = parseFloat(order.priceBreakdown?.install || 0);
        const subtotal = parseFloat(order.priceBreakdown?.subtotal || 0);
        const gct = parseFloat(order.priceBreakdown?.gct || 0);
        const total = parseFloat(order.price || 0);

        const safeWidth = order.width || 0;
        const safeHeight = order.height || 0;

        const basePriceTxt = basePrice.toLocaleString(undefined, { minimumFractionDigits: 2 });
        const installPriceTxt = installPrice.toLocaleString(undefined, { minimumFractionDigits: 2 });

        y += drawRow(doc, y, [
            order.product || "Custom Blind",
            `Size: ${safeWidth}" x ${safeHeight}"`,
            basePriceTxt,
            basePriceTxt
        ]);

        y += drawRow(doc, y, [
            'Installation',
            'Standard Install Fee',
            installPriceTxt,
            installPriceTxt
        ]);

        doc.moveTo(50, y).lineTo(550, y).stroke();
        y += 20;

        // --- 5. TOTALS ---
        doc.font('Helvetica-Bold');
        y += drawRow(doc, y, [
            '', '', 'SUBTOTAL', subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})
        ]);
        y += drawRow(doc, y, [
            '', '', 'TAX (GCT 15%)', gct.toLocaleString(undefined, {minimumFractionDigits: 2})
        ]);

        doc.fontSize(12).font('Helvetica-Bold');
        y += drawRow(doc, y, [
            '', '', 'TOTAL', 'JMD ' + total.toLocaleString(undefined, {minimumFractionDigits: 2})
        ]);
        y += 20;

        // --- 6. FOOTER ---
        if (docType === "INVOICE") {
            doc.fontSize(10).font('Helvetica-Bold').text('Payment can be remitted to:', 50, y);
            doc.font('Helvetica');
            y += 15;
            doc.text('Bank: FirstCaribbean Int\'l Bank', 50, y);
            y += 15;
            doc.text('Account Type: Current', 50, y);
            y += 15;
            doc.text('Account #: 1001638808', 50, y);
            y += 15;
            doc.text('Branch: Liguanea', 50, y);
        } else {
            doc.fontSize(10).font('Helvetica-Oblique').text('This is an estimate only. Prices subject to change.', 50, y);
        }

        doc.end();
        writeStream.on('finish', () => resolve(filePath));
        writeStream.on('error', reject);
    });
}

module.exports = { generateInvoicePDF };
