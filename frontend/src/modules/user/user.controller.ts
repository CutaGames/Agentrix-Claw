import {
  Controller,
  Post,
  Get,
  Put,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserService } from './user.service';
import { UpdateUserDto, UploadAvatarDto } from './dto/user.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('用户')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @ApiOperation({ summary: '获取用户信息' })
  @ApiResponse({ status: 200, description: '返回用户信息' })
  async getProfile(@Request() req) {
    return this.userService.getProfile(req.user.id);
  }

  @Put('profile')
  @ApiOperation({ summary: '更新用户信息' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateProfile(@Request() req, @Body() dto: UpdateUserDto) {
    return this.userService.updateProfile(req.user.id, dto);
  }

  @Post('avatar')
  @ApiOperation({ summary: '上传用户头像' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: '头像上传成功' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.userService.uploadAvatar(req.user.id, file);
  }

  @Get('avatar')
  @ApiOperation({ summary: '获取用户头像URL' })
  @ApiResponse({ status: 200, description: '返回头像URL' })
  async getAvatar(@Request() req) {
    return this.userService.getAvatar(req.user.id);
  }
}

