import { createWorker } from 'tesseract.js';

export const performOCR = async (imageSource: string | File): Promise<string> => {
    const worker = await createWorker('eng');

    try {
        const ret = await worker.recognize(imageSource);
        await worker.terminate();
        return ret.data.text;
    } catch (error) {
        console.error("OCR Error:", error);
        await worker.terminate();
        throw new Error("Failed to extract text from image.");
    }
};

// Helper to convert PDF page to image (if needed later) or just ensuring file type safety
export const isImageFile = (file: File) => file.type.startsWith('image/');
