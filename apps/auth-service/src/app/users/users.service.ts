import { Injectable } from '@nestjs/common';
import { UsersRepository, UpsertUserInput } from '@evalops/shared-db';
import { User, UpsertUser } from '@evalops/shared-db';

@Injectable()
export class UsersService {
  constructor(private usersRepository: UsersRepository) {}

  async getUser(id: string): Promise<User | undefined> {
    return this.usersRepository.findById(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.usersRepository.findByEmail(email);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    return this.usersRepository.upsert(userData as UpsertUserInput) as Promise<User>;
  }
}

