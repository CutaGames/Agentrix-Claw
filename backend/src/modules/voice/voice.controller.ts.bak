import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VoiceService } from './voice.service';

@ApiTags('Voice')
@Controller('voice')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  @ApiOperation({ summary: 'Transcribe audio to text using Whisper' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio: { type: 'string', format: 'binary' },
      },
    },
  })
  async transcribe(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No audio file provided. Use field name "audio".');
    }
    return this.voiceService.transcribe(file.buffer, file.mimetype, file.originalname);
  }
}
