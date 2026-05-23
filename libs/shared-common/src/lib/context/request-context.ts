import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  organizationId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
