const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, workerData, parentPort } = require('worker_threads');

const inputFolderPath = './input_folder/'; // Change this to your input folder path
const outputFolderPath = './input_folder/'; // Change this to your output folder path

// Function to delete the third page from a PDF
async function deleteThirdPageFromPDF(pdfFile) {
  const inputFilePath = inputFolderPath + pdfFile;
  const outputFilePath = outputFolderPath + pdfFile;

  // Read the input PDF file
  const inputPdfBytes = await fs.promises.readFile(inputFilePath);
  const pdfDoc = await PDFDocument.load(inputPdfBytes);

  // Check if the PDF has more than two pages before deleting the third page
  if (pdfDoc.getPageCount() > 2) {
    // Delete the third page (index 2, since pages are zero-based)
    pdfDoc.removePage(2);
  }

  // Save the modified PDF to the output file
  const modifiedPdfBytes = await pdfDoc.save();
  await fs.promises.writeFile(outputFilePath, modifiedPdfBytes);

  console.log(`Deleted third page from ${pdfFile}.`);
}

// Function to run the PDF processing in a worker thread
async function processPDFWorker(pdfFile) {
  try {
    await deleteThirdPageFromPDF(pdfFile);
    parentPort.postMessage({ success: true, message: `Deleted third page from ${pdfFile}.` });
  } catch (error) {
    parentPort.postMessage({ success: false, message: `Error deleting third page from ${pdfFile}: ${error.message}` });
  }
}

// Main function to run the app
async function startdelete() {
  // // Create the output folder if it doesn't exist
  // if (!fs.existsSync(outputFolderPath)) {
  //   fs.mkdirSync(outputFolderPath);
  // }

  // Get the list of PDF files in the input folder
  const pdfFiles = fs.readdirSync(inputFolderPath);

  // Check if the app is running in the main thread
  if (isMainThread) {
    console.log("Deleting third page from PDFs using multithreading...");
    const numThreads = Math.min(pdfFiles.length, 16); // You can adjust the number of threads based on your system's capabilities
    const chunkSize = Math.ceil(pdfFiles.length / numThreads);
    const workers = [];

    const startTime = performance.now();

    for (let i = 0; i < numThreads; i++) {
      const start = i * chunkSize;
      const end = (i + 1) * chunkSize;
      const workerFiles = pdfFiles.slice(start, end);
      const worker = new Worker(__filename, { workerData: workerFiles });
      workers.push(worker);

      worker.on('message', (message) => {
        if (message.success) {
          console.log(message.message);
        } else {
          console.error(message.message);
        }
      });
    }

    // Wait for all worker threads to complete
    await Promise.all(workers.map((worker) => new Promise((resolve) => worker.on('exit', resolve))));
    const endTime = performance.now();
    const totalExecutionTime = endTime - startTime;
    console.log('Changed ' + pdfFiles.length + ' PDFs');
    console.log(`Total execution time: ${totalExecutionTime.toFixed(2)} ms`);
    console.log("All done! PDFs with the third page deleted are available in the output folder.");
  } else {
    // Worker thread
    const workerFiles = workerData;
    for (const pdfFile of workerFiles) {
      await deleteThirdPageFromPDF(pdfFile);
    }
  }
}

// Run the main function
startdelete();
