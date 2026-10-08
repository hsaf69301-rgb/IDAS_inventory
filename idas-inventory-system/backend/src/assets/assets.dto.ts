import { AssetCondition, AssetStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class SpecDto {
  @IsString() @MinLength(1) @MaxLength(60) key: string;
  @IsString() @MaxLength(200) value: string;
}
export class AcquisitionDto {
  @IsOptional() @IsDateString() acquiredAt?: string;
  @IsOptional() @IsString() @MaxLength(150) supplier?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceRef?: string;
  @IsOptional() @IsNumber() @Min(0) value?: number;
  @IsOptional() @IsString() @MaxLength(150) fundingSource?: string;
  @IsOptional() @IsDateString() warrantyStart?: string;
  @IsOptional() @IsDateString() warrantyEnd?: string;
  @IsOptional() @IsString() @MaxLength(300) warrantyDetails?: string;
}
export class CreateAssetDto {
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsUUID() categoryId: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsString() @MaxLength(100) serialNumber?: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsBoolean() isConsumable?: boolean;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() responsibleUserId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => SpecDto) specifications?: SpecDto[];
  @IsOptional() @ValidateNested() @Type(() => AcquisitionDto) acquisition?: AcquisitionDto;
}
export class UpdateAssetDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsString() @MaxLength(100) serialNumber?: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsUUID() responsibleUserId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => SpecDto) specifications?: SpecDto[];
  @IsOptional() @ValidateNested() @Type(() => AcquisitionDto) acquisition?: AcquisitionDto;
}
export class MoveAssetDto {
  @IsUUID() locationId: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
export class SetStatusDto {
  @IsEnum(AssetStatus) status: AssetStatus;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
