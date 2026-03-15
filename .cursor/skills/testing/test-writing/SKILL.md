---
name: test-writing
description: Practical guide for writing tests in this workspace including NestJS service tests, React component tests, gRPC tests, HTTP endpoint tests, and mocking strategies. Use when writing NestJS service tests, writing React component tests, writing gRPC tests, writing HTTP endpoint tests, setting up test mocks, or implementing test utilities.
---

# Test Writing Guide

## NestJS Service Tests

### Basic Service Test

```typescript
import { Test } from "@nestjs/testing";
import { createMock } from "@golevelup/ts-jest";
import { describe, it, expect, beforeEach } from "@jest/globals";
import { MyService } from "./my.service";
import { MyRepository } from "./my.repository";

describe("MyService", () => {
  let service: MyService;
  let repository: Mocked<MyRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MyService,
        {
          provide: MyRepository,
          useValue: createMock<MyRepository>(),
        },
      ],
    }).compile();

    service = module.get(MyService);
    repository = module.get(MyRepository);
  });

  it("should return data when repository succeeds", async () => {
    const mockData = { id: "1", name: "Test" };
    repository.findById.mockResolvedValue(mockData);

    const result = await service.getData("1");

    expect(result).toEqual(mockData);
    expect(repository.findById).toHaveBeenCalledWith("1");
  });

  it("should throw error when repository fails", async () => {
    repository.findById.mockRejectedValue(new Error("Not found"));

    await expect(service.getData("1")).rejects.toThrow("Not found");
  });
});
```

### Service with Metrics

```typescript
import {
  MetricTimerFactory,
  PredefinedTags,
} from "@microservices-shared/metrics";

describe("MyService", () => {
  let service: MyService;
  let metricTimerFactory: Mocked<MetricTimerFactory>;
  let mockTimer: any;

  beforeEach(async () => {
    mockTimer = {
      start: jest.fn(),
      stop: jest.fn(),
    };

    const mockMetricTimerFactory = {
      create: jest.fn().mockReturnValue(mockTimer),
    };

    const module = await Test.createTestingModule({
      providers: [
        MyService,
        {
          provide: MetricTimerFactory,
          useValue: mockMetricTimerFactory,
        },
      ],
    }).compile();

    service = module.get(MyService);
    metricTimerFactory = module.get(MetricTimerFactory);
  });

  it("should start and stop timer on success", async () => {
    await service.processData(mockData);

    expect(mockTimer.start).toHaveBeenCalled();
    expect(mockTimer.stop).toHaveBeenCalledWith(PredefinedTags.SUCCESS);
  });
});
```

## NestJS Controller Tests

### HTTP Controller Test

```typescript
import { Test } from "@nestjs/testing";
import { createMock } from "@golevelup/ts-jest";
import { MyController } from "./my.controller";
import { MyService } from "./my.service";

describe("MyController", () => {
  let controller: MyController;
  let service: Mocked<MyService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [MyController],
      providers: [
        {
          provide: MyService,
          useValue: createMock<MyService>(),
        },
      ],
    }).compile();

    controller = module.get(MyController);
    service = module.get(MyService);
  });

  it("should return data from service", async () => {
    const mockData = { id: "1", name: "Test" };
    service.getData.mockResolvedValue(mockData);

    const result = await controller.getData("1");

    expect(result).toEqual(mockData);
    expect(service.getData).toHaveBeenCalledWith("1");
  });
});
```

### gRPC Controller Test

```typescript
import { Test } from "@nestjs/testing";
import { MyController } from "./my.controller";
import { MyService } from "./my.service";

describe("MyController", () => {
  let controller: MyController;
  let service: Mocked<MyService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [MyController],
      providers: [
        {
          provide: MyService,
          useValue: {
            getData: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(MyController);
    service = module.get(MyService);
  });

  it("should handle gRPC message pattern", async () => {
    const mockData = { id: "1" };
    service.getData.mockResolvedValue(mockData);

    const result = await controller.getData({ id: "1" });

    expect(result).toEqual(mockData);
    expect(service.getData).toHaveBeenCalledWith("1");
  });
});
```

## React Component Tests

### Component Test with Testing Library

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "@jest/globals";
import { UserCard } from "./user-card";

describe("UserCard", () => {
  it("should render user information", () => {
    const user = { id: "1", name: "John", email: "john@example.com" };
    render(<UserCard user={user} />);

    expect(screen.getByText("John")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("should call onSelect when clicked", () => {
    const user = { id: "1", name: "John" };
    const onSelect = jest.fn();
    render(<UserCard user={user} onSelect={onSelect} />);

    screen.getByText("John").click();

    expect(onSelect).toHaveBeenCalledWith(user);
  });
});
```

### Component Test with Cypress

```typescript
import { UserList } from "./user-list";

describe("UserList", () => {
  it("should render users", () => {
    cy.mount(<UserList />);
    cy.get('[data-testid="user-card"]').should("have.length", 10);
  });

  it("should filter users", () => {
    cy.mount(<UserList />);
    cy.get('[data-testid="search-input"]').type("John");
    cy.get('[data-testid="user-card"]').should("have.length", 1);
  });
});
```

## E2E Tests

### HTTP Endpoint E2E Test

```typescript
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/modules/app.module";

describe("MyController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("/api/my-endpoint (GET)", () => {
    return request(app.getHttpServer())
      .get("/api/my-endpoint")
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty("data");
      });
  });

  it("/api/my-endpoint (POST)", () => {
    return request(app.getHttpServer())
      .post("/api/my-endpoint")
      .send({ name: "Test" })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty("id");
        expect(res.body.name).toBe("Test");
      });
  });
});
```

## Mocking Strategies

### Mock External Services

```typescript
import nock from "nock";

beforeEach(() => {
  nock("https://api.example.com").get("/users").reply(200, { users: [] });
});

afterEach(() => {
  nock.cleanAll();
});
```

### Mock Database

```typescript
const mockRepository = {
  findById: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
};

beforeEach(() => {
  mockRepository.findById.mockResolvedValue(mockEntity);
  mockRepository.save.mockResolvedValue(mockEntity);
});
```

### Mock Logger

```typescript
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const module = await Test.createTestingModule({
  providers: [
    {
      provide: Logger,
      useValue: mockLogger,
    },
  ],
}).compile();
```

## Test Constants

Always use constants for repeated strings:

```typescript
const TEST_USER_ID = "test-user-id";
const TEST_EMAIL = "test@example.com";
const ERROR_MESSAGE = "Something went wrong";

describe("MyService", () => {
  it("should handle error", async () => {
    repository.findById.mockRejectedValue(new Error(ERROR_MESSAGE));
    await expect(service.getData(TEST_USER_ID)).rejects.toThrow(ERROR_MESSAGE);
  });
});
```

## Common Test Patterns

### Testing Async Operations

```typescript
it("should handle async operation", async () => {
  const promise = service.processData(data);
  await expect(promise).resolves.toEqual(expectedResult);
});
```

### Testing Error Cases

```typescript
it("should throw NotFoundException when resource not found", async () => {
  repository.findById.mockResolvedValue(null);
  await expect(service.getData("1")).rejects.toThrow(NotFoundException);
});
```

### Testing Validation

```typescript
it("should reject invalid input", async () => {
  const invalidDto = { email: "invalid-email" };
  await expect(service.create(invalidDto)).rejects.toThrow(BadRequestException);
});
```

## References

- **Testing Protocol**: `skills/testing-protocol/SKILL.md` - Comprehensive testing requirements
- **Example Service Tests**: `platform/entity-service/src/modules/**/*.spec.ts`
- **Example E2E Tests**: `platform/entity-service/test/integration/*.e2e.ts`
- **Testing Rules**: `.cursor/rules/core/tests.mdc`
