import { Body, Controller, Post, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PartnerInquiry } from '../../entities/partner-inquiry.entity';

/**
 * Phase 5 WB-12.1 — Partner inquiry capture endpoint.
 * Public POST so the /hardware page can submit unauthenticated.
 */
@Controller('v1/partners')
export class PartnerInquiryController {
  constructor(
    @InjectRepository(PartnerInquiry)
    private readonly repo: Repository<PartnerInquiry>,
  ) {}

  @Post('inquiry')
  @HttpCode(HttpStatus.CREATED)
  async submit(@Body() body: { name?: string; email?: string; company?: string; expected_volume?: string }) {
    const name = (body.name || '').trim().slice(0, 80);
    const email = (body.email || '').trim().slice(0, 120);
    const company = (body.company || '').trim().slice(0, 120);
    if (!name || !email || !company) throw new BadRequestException('name, email, company required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('invalid email');
    const row = this.repo.create({
      name,
      email,
      company,
      expectedVolume: (body.expected_volume || '').trim().slice(0, 120) || null,
      status: 'new',
    });
    const saved = await this.repo.save(row);
    return { ok: true, id: saved.id };
  }
}
