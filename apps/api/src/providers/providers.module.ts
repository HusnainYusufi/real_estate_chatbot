import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProviderKey } from '../entities/provider-key.entity';
import { ProvidersService } from './providers.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProviderKey])],
  providers: [ProvidersService],
  exports: [ProvidersService],
})
export class ProvidersModule {}
