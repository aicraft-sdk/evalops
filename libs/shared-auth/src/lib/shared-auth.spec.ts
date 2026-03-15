import { sharedAuth } from './shared-auth';

describe('sharedAuth', () => {
  it('should work', () => {
    expect(sharedAuth()).toEqual('shared-auth');
  });
});
