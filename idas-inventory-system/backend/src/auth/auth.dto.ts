import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@idas.pdn.ac.lk' }) @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(128) password: string;
}
export class ChangePasswordDto {
  @IsString() current: string;
  @IsString() @MinLength(10) @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: 'Password needs upper-case, lower-case and a digit' })
  next: string;
}
