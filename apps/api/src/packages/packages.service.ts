import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../entities/organization.entity';
import { Package } from '../entities/package.entity';

export interface UpsertPackageDto {
  name: string;
  description?: string | null;
  monthlyResponseLimit: number;
  priceUsd: number;
  currency?: string;
  active?: boolean;
}

@Injectable()
export class PackagesService {
  constructor(
    @InjectRepository(Package) private readonly packages: Repository<Package>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
  ) {}

  list(): Promise<Package[]> {
    return this.packages.find({ order: { monthlyResponseLimit: 'ASC' } });
  }

  create(dto: UpsertPackageDto): Promise<Package> {
    return this.packages.save(
      this.packages.create({
        name: dto.name,
        description: dto.description ?? null,
        monthlyResponseLimit: dto.monthlyResponseLimit,
        priceUsd: dto.priceUsd.toFixed(2),
        currency: dto.currency ?? 'USD',
        active: dto.active ?? true,
      }),
    );
  }

  async update(id: string, dto: Partial<UpsertPackageDto>): Promise<Package> {
    const p = await this.packages.findOneBy({ id });
    if (!p) throw new NotFoundException('Package not found');
    Object.assign(p, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.monthlyResponseLimit !== undefined && {
        monthlyResponseLimit: dto.monthlyResponseLimit,
      }),
      ...(dto.priceUsd !== undefined && { priceUsd: dto.priceUsd.toFixed(2) }),
      ...(dto.currency !== undefined && { currency: dto.currency }),
      ...(dto.active !== undefined && { active: dto.active }),
    });
    return this.packages.save(p);
  }

  async remove(id: string): Promise<void> {
    const p = await this.packages.findOneBy({ id });
    if (!p) throw new NotFoundException('Package not found');
    await this.packages.remove(p);
  }

  /** Assign a package to a client: copies its limit + price onto the org. */
  async assignToOrg(orgId: string, packageId: string | null): Promise<Organization> {
    const org = await this.orgs.findOneBy({ id: orgId });
    if (!org) throw new NotFoundException('Client not found');
    if (packageId === null) {
      org.packageId = null;
      org.plan = 'custom';
      org.monthlyPriceUsd = '0.00';
      return this.orgs.save(org);
    }
    const pkg = await this.packages.findOneBy({ id: packageId });
    if (!pkg) throw new NotFoundException('Package not found');
    org.packageId = pkg.id;
    org.plan = pkg.name;
    org.monthlyMessageLimit = pkg.monthlyResponseLimit;
    org.monthlyPriceUsd = pkg.priceUsd;
    return this.orgs.save(org);
  }
}
