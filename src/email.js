/**
 * File: src/email.js
 * Software Engineering Project (COMP2140)
 * Student: Patrick Marsden (620169874)
 */

const nodemailer = require('nodemailer');

// Hardcoded Gmail config (using app password)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'pmarsden2k5@gmail.com',
        pass: 'zftl edbh isen dxcq' // Gmail App Password
    }
});

async function sendInvoiceEmail(toEmail, order, pdfPath) {
    if (!toEmail || !toEmail.includes('@')) return false;

    console.log(`📧 Attempting to send email to ${toEmail}...`);

    const mailOptions = {
        from: `"White Rose Interiors" <pmarsden2k5@gmail.com>`,
        to: toEmail,
        subject: `Invoice #${order.id} - White Rose Interiors`,
        text: `Dear Customer,\n\nPlease find attached your official invoice for Order #${order.id}.\n\nTotal Due: $${order.price}\n\nRegards,\nWhite Rose Interiors Team\n30-32 Red Hills Road`,
        attachments: [
            {
                filename: `Invoice_${order.id}.pdf`,
                path: pdfPath
            }
        ]
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully! Message ID: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error("❌ Email Error:", error);
        return false;
    }
}

module.exports = { sendInvoiceEmail };
