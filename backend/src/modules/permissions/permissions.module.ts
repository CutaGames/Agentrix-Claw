/**
 * Permissions Module
 *
 * Provides the PermissionEngine (multi-layer rule evaluation) and
 * DenialTracker (consecutive/total denial monitoring with fallback).
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentAccount } from '../../entities/agent-account.entity';
import { PermissionEngineService } from './permission-engine.service';
import { DenialTrackerService } from './denial-tracker.service';

@Module({
  imports: [TypeOrmModule.forFeature([AgentAccount])],
  providers: [PermissionEngineService, DenialTrackerService],
  exports: [PermissionEngineService, DenialTrackerService],
})
export class PermissionsModule {}
