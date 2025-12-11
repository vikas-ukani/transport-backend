import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma.js';

const UPLOAD_DIRECTORY = 'uploads';

// Ensure the uploads directory exists
if (!fs.existsSync(UPLOAD_DIRECTORY)) {
  fs.mkdirSync(UPLOAD_DIRECTORY, { recursive: true });
}

const router = express.Router();

// Set up multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIRECTORY);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// Upload endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded.',
    });
  }

  try {
    // Store image path to the database (media table)
    const media = await prisma.media.create({
      data: {
        type: file.mimetype || 'image/jpeg',
        url: `/${UPLOAD_DIRECTORY}/${file.filename}`,
        mimeType: file.mimetype || 'image/jpeg',
        size: file.size,
      },
    });

    return res.status(201).json({
      success: true,
      original_filename: file.originalname,
      filename: file.filename,
      id: media.id,
      url: `/${UPLOAD_DIRECTORY}/${file.filename}`,
      message: 'File uploaded successfully!',
    });
  } catch (e) {
    console.log('e.message', e.message)
    // Clean up file if DB operation fails
    fs.unlinkSync(path.join(UPLOAD_DIRECTORY, file.filename));
    return res.status(500).json({
      success: false,
      message: `There was an error uploading the file: ${e.message}`,
    });
  }
});

// Serve uploaded files
router.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(UPLOAD_DIRECTORY, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ detail: 'File not found' });
  }
  // Optionally handle content-type by extension, for now default to image/jpeg
  res.sendFile(path.resolve(filePath), {
    headers: {
      'Content-Type': 'image/jpeg',
    },
  });
});

export default router;
