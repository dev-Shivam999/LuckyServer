
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

import { v2 as cloudinary } from "cloudinary";
import {  PDFDocument, rgb } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';
import twilio from 'twilio';
import dotenv from 'dotenv';
import os from "os"
import cluster from 'cluster';

dotenv.config();
const accountSid = `${process.env.AccountSid}`;
const authToken = `${process.env.AuthToken}`;
const fromWhatsAppNumber = 'whatsapp:+14155238886';
const client = twilio(accountSid, authToken);
cloudinary.config({
    cloud_name: `${process.env.CloudName}`,
    api_key: `${process.env.CloudApi}`,
    api_secret: `${process.env.CloudSecret}`
});





const totalCpus =os.cpus().length
console.log(totalCpus);


if (cluster.isPrimary) {


    for (let i = 0; i < totalCpus; i++) {
        cluster.fork();
    }

    cluster.on("exit", (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} exited, starting a new one...`);
        cluster.fork();
    });
    
}else{


    const app = express();
    app.use(cors());
    app.use(bodyParser.json());
   
    app.get('/test', (req, res) => {
        res.json({success: true});
    })
    //@ts-ignore
app.post('/api/send-pdf', async (req: Request, res: Response) => {
    const { username, password, phoneNumber } = req.body;

    if (!username || !password || !phoneNumber) {
        return res.status(400).json({ message: 'All fields are required!' });
    }

    const phoneNumberRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneNumberRegex.test(phoneNumber)) {
        return res.status(400).json({ message: 'Invalid phone number format!' });
    }

    const Number = uuidv4();

    
    try {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([800, 600]);
        const { width, height } = page.getSize();
        const fontSize = 24;

        page.drawText('User Details', { x: 50, y: height - 50, size: fontSize, color: rgb(0, 0, 0) });
        page.drawText(`Username: ${username}`, { x: 50, y: height - 100, size: fontSize });
        page.drawText(`Phone Number: ${phoneNumber}`, { x: 50, y: height - 150, size: fontSize });
        page.drawText(`Ticket Number: ${Number}`, { x: 50, y: height - 200, size: fontSize });

        const pdfBytes = await pdfDoc.save();
        const uploadToCloudinary = () =>
            new Promise<{ secure_url: string }>((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { resource_type: 'raw', folder: 'pdfs', public_id: `Ticket-${Number}`,
                        expires_at: Math.floor(Date.now() / 1000) + 30, },
                    (error, result) => {
                        if (error) return reject(error);
                        if (result) return resolve(result);
                    }
                );
                uploadStream.end(pdfBytes);
            });

        const uploadResult = await uploadToCloudinary();

        
        const data = {
            from: fromWhatsAppNumber,
            to: `whatsapp:+91${phoneNumber}`,
            body: `Hello ${username},`,
            mediaUrl: [uploadResult.secure_url]
            
        }

        const a = await client.messages.create(data);


        res.status(200).json({ message: 'PDF sent successfully via WhatsApp!' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Failed to send PDF.' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}