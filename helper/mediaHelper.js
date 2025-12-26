import prisma from '../lib/prisma.js';
const fs = await import('fs/promises');

export const removeImagesFromMedia = async (removedImageIds) => {
  if (removedImageIds.length > 0) {
    // Fetch file paths for removed images
    const mediasToRemove = await prisma.media.findMany({
      where: {
        id: { in: removedImageIds },
      },
    });
    // Remove files from disk
    for (const media of mediasToRemove) {
      if (media.url) {
        try {
          // Remove the public prefix if exists, adapt if urls are absolute
          const localPath = media.url.startsWith('/')
            ? `.${media.url}`
            : media.url;
          await fs.unlink(localPath);
        } catch (e) {
          // Log file not found or unlink errors, but don't stop execution
          console.error(`Error deleting file ${media.url}:`, e.message);
        }
      }
    }
    // Remove Media db records (optional, only if you want to clean up Media table)
    await prisma.media.deleteMany({
      where: { id: { in: removedImageIds } },
    });
  }
};
