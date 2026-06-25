import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProductBatchImportService } from './product-batch-import.service';
import { BatchImportDto, BatchImportResultDto } from './dto/batch-import.dto';

@ApiTags('products')
@Controller('products/batch')
export class ProductBatchImportController {
  constructor(
    private readonly batchImportService: ProductBatchImportService,
  ) {}

  /**
   * 下载 CSV 模板
   */
  @Get('template')
  @ApiOperation({ summary: '下载商品导入CSV模板' })
  @ApiResponse({ status: 200, description: 'CSV模板文件' })
  downloadTemplate(@Res() res: Response) {
    const csv = this.batchImportService.generateCsvTemplate();
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=product_import_template.csv');
    // 添加 BOM 以支持 Excel 正确显示中文
    res.send('\ufeff' + csv);
  }

  /**
   * 获取模板列定义（前端用于生成 Excel）
   */
  @Get('template/columns')
  @ApiOperation({ summary: '获取导入模板列定义' })
  @ApiResponse({ status: 200, description: '模板列定义' })
  getTemplateColumns() {
    return {
      success: true,
      data: this.batchImportService.getTemplateColumns(),
    };
  }

  /**
   * 批量导入（JSON 格式）
   */
  @Post('import')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量导入商品（JSON格式）' })
  @ApiResponse({ status: 200, description: '导入结果', type: BatchImportResultDto })
  @ApiResponse({ status: 400, description: '导入失败' })
  async importProducts(
    @Request() req,
    @Body() dto: BatchImportDto,
  ): Promise<{ success: boolean; data: BatchImportResultDto }> {
    const result = await this.batchImportService.batchImport(req.user.id, dto);
    return {
      success: true,
      data: result,
    };
  }

  /**
   * 上传 CSV 文件导入
   */
  @Post('import/csv')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
      if (!file.originalname.match(/\.(csv|txt)$/i)) {
        return cb(new BadRequestException('只支持 CSV 文件'), false);
      }
      cb(null, true);
    },
  }))
  @ApiOperation({ summary: '上传CSV文件批量导入商品' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'CSV文件',
        },
        mode: {
          type: 'string',
          enum: ['create', 'upsert'],
          description: '导入模式',
          default: 'create',
        },
        skipErrors: {
          type: 'boolean',
          description: '是否跳过错误继续',
          default: true,
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 200, description: '导入结果', type: BatchImportResultDto })
  async importCsv(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('mode') mode?: 'create' | 'upsert',
    @Body('skipErrors') skipErrors?: string,
  ): Promise<{ success: boolean; data: BatchImportResultDto }> {
    if (!file) {
      throw new BadRequestException('请上传 CSV 文件');
    }

    // 解析 CSV 内容
    const csvContent = file.buffer.toString('utf-8');
    const products = this.batchImportService.parseCsvData(csvContent);

    if (products.length === 0) {
      throw new BadRequestException('CSV 文件中没有有效的商品数据');
    }

    // 执行导入
    const result = await this.batchImportService.batchImport(req.user.id, {
      products,
      mode: mode || 'create',
      skipErrors: skipErrors !== 'false',
    });

    return {
      success: true,
      data: result,
    };
  }

  /**
   * 预览导入数据（不实际导入）
   */
  @Post('preview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!file.originalname.match(/\.(csv|txt)$/i)) {
        return cb(new BadRequestException('只支持 CSV 文件'), false);
      }
      cb(null, true);
    },
  }))
  @ApiOperation({ summary: '预览CSV导入数据（不实际导入）' })
  @ApiConsumes('multipart/form-data')
  async previewImport(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ success: boolean; data: { total: number; products: any[]; columns: string[] } }> {
    if (!file) {
      throw new BadRequestException('请上传 CSV 文件');
    }

    const csvContent = file.buffer.toString('utf-8');
    const products = this.batchImportService.parseCsvData(csvContent);

    // 只返回前 10 条预览
    return {
      success: true,
      data: {
        total: products.length,
        products: products.slice(0, 10),
        columns: this.batchImportService.getTemplateColumns().map(c => c.label),
      },
    };
  }
}
