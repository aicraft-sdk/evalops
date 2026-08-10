import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { ServiceAuthGuard } from '@evalops/shared-auth';
import {
  CreateSandboxRequest,
  CreateSandboxResponse,
  ExecuteCodeRequest,
  SandboxStatus,
  SandboxStatusResponse,
} from './sandbox.dto';

@Controller('sandboxes')
@UseGuards(ServiceAuthGuard)
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSandbox(
    @Body() request: CreateSandboxRequest,
    @Req() req: { user?: { id?: string; organizationId?: string }; headers: Record<string, string> },
  ): Promise<CreateSandboxResponse> {
    const requestId = req.headers['x-request-id'];
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;
    
    const sandboxId = await this.sandboxService.createSandbox(
      request.config,
      userId,
      organizationId,
      requestId,
    );
    return {
      sandboxId,
      status: SandboxStatus.CREATING,
    };
  }

  @Post(':id/execute')
  async executeCode(
    @Param('id') sandboxId: string,
    @Body() request: ExecuteCodeRequest,
    @Req() req: { user?: { id?: string; organizationId?: string }; headers: Record<string, string> },
  ) {
    const requestId = req.headers['x-request-id'];
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;
    
    return await this.sandboxService.executeCode(
      sandboxId,
      request.code,
      request.language,
      request.input,
      userId,
      organizationId,
      requestId,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSandbox(
    @Param('id') sandboxId: string,
    @Req() req: { user?: { id?: string; organizationId?: string }; headers: Record<string, string> },
  ): Promise<void> {
    const requestId = req.headers['x-request-id'];
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;
    
    await this.sandboxService.deleteSandbox(
      sandboxId,
      userId,
      organizationId,
      requestId,
    );
  }

  @Get(':id/status')
  async getSandboxStatus(
    @Param('id') sandboxId: string,
  ): Promise<SandboxStatusResponse> {
    return await this.sandboxService.getSandboxStatus(sandboxId);
  }
}
