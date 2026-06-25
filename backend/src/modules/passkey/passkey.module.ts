import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasskeyCredential } from '../../entities/passkey-credential.entity';
import { PasskeyService } from './passkey.service';
import { PasskeyController } from './passkey.controller';

/**
 * PasskeyModule — Phase 4 W8 WB-T4.1 / WB-T4.2 — WebAuthn registration +
 * authentication for L3 approval co-signing on the web surface.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PasskeyCredential])],
  controllers: [PasskeyController],
  providers: [PasskeyService],
  exports: [PasskeyService],
})
export class PasskeyModule {}
