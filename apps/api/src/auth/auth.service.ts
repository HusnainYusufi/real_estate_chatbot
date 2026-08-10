import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';

export interface AuthResult {
  token: string;
  user: { id: string; email: string; name: string; orgId: string; platformAdmin: boolean };
  organization: { id: string; name: string; plan: string };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    private readonly jwt: JwtService,
  ) {}

  async register(input: {
    organizationName?: string;
    name: string;
    email: string;
    password: string;
  }): Promise<AuthResult> {
    const email = input.email.toLowerCase().trim();
    if (await this.users.findOneBy({ email })) {
      throw new ConflictException('An account with this email already exists');
    }
    const org = await this.orgs.save(
      this.orgs.create({ name: input.organizationName?.trim() || `${input.name}'s workspace` }),
    );
    const user = await this.users.save(
      this.users.create({
        orgId: org.id,
        email,
        name: input.name.trim(),
        passwordHash: await bcrypt.hash(input.password, 10),
        role: 'owner',
      }),
    );
    return this.result(user, org);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.users.findOneBy({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const org = await this.orgs.findOneByOrFail({ id: user.orgId });
    return this.result(user, org);
  }

  async me(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    const org = await this.orgs.findOneByOrFail({ id: user.orgId });
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        orgId: user.orgId,
        platformAdmin: user.platformAdmin,
      },
      organization: {
        id: org.id,
        name: org.name,
        plan: org.plan,
        monthlyMessageLimit: org.monthlyMessageLimit,
      },
    };
  }

  private async result(user: User, org: Organization): Promise<AuthResult> {
    const token = await this.jwt.signAsync({ sub: user.id, orgId: user.orgId, email: user.email });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        orgId: user.orgId,
        platformAdmin: user.platformAdmin,
      },
      organization: { id: org.id, name: org.name, plan: org.plan },
    };
  }
}
