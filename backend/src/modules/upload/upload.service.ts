import { Injectable, BadRequestException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'products');
  private readonly chatUploadDir = path.join(process.cwd(), 'uploads', 'chat');
  private readonly maxAttachmentSize = 15 * 1024 * 1024;
  private readonly maxVideoAttachmentSize = 50 * 1024 * 1024;

  constructor() {
    this.ensureDir(this.uploadDir);
    this.ensureDir(this.chatUploadDir);
  }

  private ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private saveFile(file: Express.Multer.File, dirPath: string, publicPrefix: string) {
    const fileExt = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExt}`;
    const filePath = path.join(dirPath, fileName);

    try {
      fs.writeFileSync(filePath, file.buffer);
      return {
        url: `${publicPrefix}/${fileName}`,
        fileName,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      };
    } catch {
      throw new BadRequestException('Failed to save file');
    }
  }

  async uploadProductImage(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only images are allowed.');
    }

    return this.saveFile(file, this.uploadDir, '/api/uploads/products');
  }

  async uploadChatAttachment(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const isVideo = file.mimetype.startsWith('video/');
    const maxSize = isVideo ? this.maxVideoAttachmentSize : this.maxAttachmentSize;
    if (file.size > maxSize) {
      throw new BadRequestException(
        isVideo
          ? 'Video attachment is too large. Max size is 50 MB.'
          : 'Attachment is too large. Max size is 15 MB.',
      );
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'audio/mpeg',
      'audio/mp4',
      'audio/m4a',
      'audio/wav',
      'audio/webm',
      'audio/ogg',
      'audio/aac',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-m4v',
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Unsupported attachment type.');
    }

    const saved = this.saveFile(file, this.chatUploadDir, '/api/uploads/chat');
    const isImage = file.mimetype.startsWith('image/');
    const isAudio = file.mimetype.startsWith('audio/');
    const isVideoAttachment = file.mimetype.startsWith('video/');
    return {
      ...saved,
      kind: isImage ? 'image' : isVideoAttachment ? 'video' : isAudio ? 'audio' : 'file',
      isImage,
      isAudio,
      isVideo: isVideoAttachment,
    };
  }
}
