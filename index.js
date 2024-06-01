        const express = require('express');
        const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
        const { MongoClient } = require('mongodb');
        const fs = require('fs');
        const path = require('path');
        const { randomUUID } = require('crypto');

        const app = express();
        app.use(express.static('public')); // Serve static files from the "public" directory

        // MongoDB connection details
        const url = 'mongodb://user:pass@0.0.0.0:27017';
        const databaseName = 'invoiceprint';
        const collectionName = 'print';

        // Define batch size for processing
        const batchSize = 100;

        // Route to serve the index.html file
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        app.get('/printed-invoices', async (req, res) => {
            try {
                const printedInvoices = await getPrintedInvoices();
                res.status(200).json(printedInvoices);
            } catch (error) {
                console.error("Error fetching printed invoices:", error);
                res.status(500).json({ message: 'Error fetching printed invoices' });
            }
        });

        // Route to start printing process
        app.post('/start-printing', async (req, res) => {
            try {
                const numPrinted = await processInvoices();
                res.status(200).json({ message: `${numPrinted} invoices printed successfully` });
            } catch (error) {
                console.error("Error processing invoices:", error);
                res.status(500).json({ message: 'Error processing invoices' });
            }
        });

        // Function to connect to MongoDB and fetch data
        async function fetchData() {
            const client = new MongoClient(url, { useUnifiedTopology: true });
            try {
                await client.connect();
                const db = client.db(databaseName);
                const collection = db.collection(collectionName);
                const data = await collection.find({ printed: 0 }).limit(batchSize).toArray();
                return data;
            } catch (error) {
                console.error("Error fetching data from MongoDB:", error);
                throw error;
            } finally {
                client.close();
            }
        }

    // Function to process and print invoices
    async function processInvoices() {
        try {
            const data = await fetchData();
            if (data.length === 0) {
                console.log("No invoices to process.");
                return;
            }
            const start = Date.now();
            console.log(`Fetched ${data.length} invoices`);
            let batchCounter = 0;
            const processedInvoices = [];

            // Create output folder if it doesn't exist
            const outputFolder = path.join(__dirname, 'output');
            if (!fs.existsSync(outputFolder)) {
                fs.mkdirSync(outputFolder);
            }

            // Iterate over fetched data and create invoices
            for (const item of data) {
                const pdfDoc = await PDFDocument.create();
                const page = pdfDoc.addPage();
                const { width, height } = page.getSize();

                // Set default font
                const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

                // Add content to the page
                page.drawText(`Invoice ID: ${item.id}`, { x: 50, y: height - 50, size: 12 });
                page.drawText(`Customer Name: ${item.customerName}`, { x: 50, y: height - 70, size: 12 });
                page.drawText(`Amount: ${item.amount}`, { x: 50, y: height - 90, size: 12 });
                page.drawText(`File Path: ${item.filePath}`, { x: 50, y: height - 110, size: 12 });

                // Save PDF to file
                const filename = `${item.id}_Invoice.pdf`;
                const filePath = path.join(outputFolder, filename);
                fs.writeFileSync(filePath, await pdfDoc.save());

                // Update MongoDB record to mark invoice as printed
                await updateDatabase(item.id, filePath);
                batchCounter++;

                console.log(`Processed invoice ${item.id}`);

                processedInvoices.push({
                    id: item.id,
                    customerName: item.customerName,
                    amount: item.amount,
                    filePath: item.filePath
                });

                if (batchCounter === batchSize) {
                    console.log(`Batch processing completed. Total time: ${Math.floor((Date.now() - start) / 1000)}s`);
                    break;
                }
            }

            // Generate HTML content
            const htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Printed Invoices</title>
            </head>
            <body>
            <h1>Printed Invoices</h1>
            <table>
                <thead>
                <tr>
                    <th>Invoice ID</th>
                    <th>Customer Name</th>
                    <th>Amount</th>
                    <th>File Path</th>
                </tr>
                </thead>
                <tbody>
                ${processedInvoices.map(invoice => `
                    <tr>
                    <td>${invoice.id}</td>
                    <td>${invoice.customerName}</td>
                    <td>${invoice.amount}</td>
                    <td>${invoice.filePath}</td>
                    </tr>
                `).join('')}
                </tbody>
            </table>
            </body>
            </html>
            `;

            // Write HTML content to file
            fs.writeFileSync('output/printed_invoices'+ randomUUID() + '.html', htmlContent);

            console.log('HTML file generated successfully.');
            console.log(batchCounter + ' invoices printed successfully');
            return batchCounter; // Return the number of invoices processed
        } catch (error) {
            console.error("Error processing invoices:", error);
            throw error;
        }
    }

        // Function to update MongoDB record
        async function updateDatabase(id, filePath) {
            const client = new MongoClient(url, { useUnifiedTopology: true });
            try {
                await client.connect();
                const db = client.db(databaseName);
                const collection = db.collection(collectionName);
                await collection.updateOne({ id: id }, { $set: { printed: 1, file_path: filePath } });
                console.log(`Record with ID ${id} updated in the collection.`);
            } catch (error) {
                console.error('Error updating record in the collection:', error);
                throw error;
            } finally {
                client.close();
            }
        }

    // Function to fetch printed invoices, limited to the last batchSize
    async function getPrintedInvoices() {
        const client = new MongoClient(url, { useUnifiedTopology: true });
        try {
            await client.connect();
            const db = client.db(databaseName);
            const collection = db.collection(collectionName);
            const data = await collection.find({ printed: 1 })
                                        .sort({ _id: -1 }) // Sort by _id in descending order
                                        .limit(batchSize)        // Limit to the last batchSize documents
                                        .toArray();
            return data;
        } catch (error) {
            console.error("Error fetching printed invoices from MongoDB:", error);
            throw error;
        } finally {
            client.close();
        }
    }


        // Start the server
        const PORT = process.env.PORT || 80;
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
