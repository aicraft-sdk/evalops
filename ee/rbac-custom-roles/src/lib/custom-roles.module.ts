import { Module } from '@nestjs/common';
import { CustomRolesController } from './custom-roles.controller';
import { CustomRolesService } from './custom-roles.service';

@Module({ controllers: [CustomRolesController], providers: [CustomRolesService] })
export class CustomRolesModule {}
