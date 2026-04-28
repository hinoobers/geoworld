require("dotenv").config();
const nodeMailer = require("nodemailer");

const transporter = nodeMailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: false,
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false,
    },
});

const sendMail = (to, subject, text) => {
    const mailOptions = {
        from: process.env.MAIL_USER,
        to,
        subject,
        text,
    };
    return transporter.sendMail(mailOptions);
};

module.exports = { sendMail };