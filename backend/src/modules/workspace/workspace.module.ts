import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { Workspace, WorkspaceMember } from '../../entities/workspace.entity';
import { User } from '../../entities/user.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workspace, WorkspaceMember, User]),
    AuthModule,
  ],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
