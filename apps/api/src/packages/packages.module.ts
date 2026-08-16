import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../entities/organization.entity';
import { Package } from '../entities/package.entity';
import { PackagesService } from './packages.service';

@Module({
  imports: [TypeOrmModule.forFeature([Package, Organization])],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
