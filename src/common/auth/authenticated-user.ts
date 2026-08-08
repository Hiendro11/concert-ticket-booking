import { Request } from 'express';

export interface AuthenticatedUser {
  id: bigint;
  email: string;
  name: string;
  role: 'CUSTOMER' | 'OPERATOR';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}