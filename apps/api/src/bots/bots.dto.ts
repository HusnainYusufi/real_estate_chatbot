import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { CustomToolConfig } from '../entities/bot.entity';

export class UpsertBotDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;

  @IsOptional() @IsString() @MaxLength(200) tagline?: string;

  @IsString() @MinLength(10) @MaxLength(10000) persona: string;

  @IsOptional() @IsString() @MaxLength(20000) instructions?: string;

  @IsOptional() @IsString() @MaxLength(20000) guardrails?: string;

  @IsOptional() @IsString() @MaxLength(2000) greeting?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) suggestedQuestions?: string[];

  @IsOptional() @IsString() @MaxLength(64) model?: string;

  @IsOptional() @IsInt() @Min(1024) @Max(128000) maxTokens?: number;

  @IsOptional() @IsIn(['low', 'medium', 'high', 'xhigh', 'max']) effort?: string;

  @IsOptional() @IsBoolean() leadCaptureEnabled?: boolean;

  /** Validated in BotsService (shape is too dynamic for class-validator). */
  @IsOptional() @IsArray() customTools?: CustomToolConfig[];

  @IsOptional() @IsIn(['active', 'paused']) status?: string;
}
