import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';
import { AdminUser } from '../../../entities/admin-user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AdminUser)
    private adminUserRepository: Repository<AdminUser>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'default-secret'),
    });
  }

  async validate(payload: any) {
    // 如果是管理员 token（payload.type === 'admin'），从 AdminUser 表查找
    if (payload.type === 'admin') {
      const admin = await this.adminUserRepository.findOne({
        where: { id: payload.sub },
        relations: ['role'],
      });

      if (!admin) {
        throw new UnauthorizedException();
      }

      return {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        roleId: admin.roleId,
        role: admin.role,
        type: 'admin',
      };
    }

    // 否则从 User 表查找（普通用户）
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return { id: user.id, agentrixId: user.agentrixId, roles: user.roles, type: 'user' };
  }
}

