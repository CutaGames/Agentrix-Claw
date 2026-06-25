/**
 * X402 Module
 * 
 * X402协议服务发现和支付模块
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { X402DiscoveryController } from './x402-discovery.controller';
import { Skill } from '../../entities/skill.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Skill]),
    ConfigModule,
  ],
  controllers: [X402DiscoveryController],
  providers: [],
  exports: [],
})
export class X402DiscoveryModule {}
