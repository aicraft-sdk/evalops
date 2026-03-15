import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common';
import { AzureDiscoveryService } from './azure-discovery.service';
import { AzureOpenAIService } from './azure-openai.service';
import { AzureMLService } from './azure-ml.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';

@Controller('azure')
export class AzureController {
  constructor(
    private azureDiscoveryService: AzureDiscoveryService,
    private azureOpenAIService: AzureOpenAIService,
    private azureMLService: AzureMLService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('discover')
  async discover(@Body() body: any, @CurrentUser() user: any) {
    const { credentials, options } = body;
    const result = await this.azureDiscoveryService.discoverUserResources(
      user.id,
      credentials,
      options,
    );
    return { success: true, data: result };
  }

  @UseGuards(JwtAuthGuard)
  @Post('validate-credentials')
  async validateCredentials(@Body() body: any) {
    const { credentials } = body;
    const isValid = await this.azureDiscoveryService.validateCredentials(
      credentials,
    );
    return { valid: isValid };
  }

  @UseGuards(JwtAuthGuard)
  @Get('test-connection')
  async testConnection() {
    const isConnected = await this.azureOpenAIService.testConnection();
    return { connected: isConnected };
  }
}

