import { Reflector } from '@nestjs/core';
import { MicrosoftAuthController } from './microsoft-auth.controller';

describe('MicrosoftAuthController', () => {
  it('is decorated with @RequiresEntitlement("sso") on both routes', () => {
    const reflector = new Reflector();
    const loginMeta = reflector.get('requiresEntitlement', MicrosoftAuthController.prototype.login);
    const callbackMeta = reflector.get('requiresEntitlement', MicrosoftAuthController.prototype.callback);
    expect(loginMeta).toBe('sso');
    expect(callbackMeta).toBe('sso');
  });
});
