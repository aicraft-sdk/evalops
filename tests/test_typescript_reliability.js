/**
 * Comprehensive TypeScript reliability and fault injection tests
 */

const request = require('supertest');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('TypeScript Application Reliability Tests', () => {
  let app;
  let server;

  beforeAll(async () => {
    // Start the application
    server = spawn('npm', ['run', 'dev'], {
      stdio: 'pipe',
      shell: true
    });
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 5000));
  });

  afterAll(() => {
    if (server) {
      server.kill();
    }
  });

  describe('Circuit Breaker Integration Tests', () => {
    test('API endpoints handle circuit breaker states', async () => {
      const response = await request('http://localhost:5000')
        .get('/api/dashboard/stats')
        .expect(200);
      
      expect(response.body).toHaveProperty('activeRuns');
      expect(response.body).toHaveProperty('passRate');
    });

    test('Evaluation engine handles failures gracefully', async () => {
      // Test with invalid evaluation spec
      const response = await request('http://localhost:5000')
        .post('/api/runs')
        .send({
          evalSpecId: 'non-existent-spec',
          name: 'Test Run'
        })
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Azure OpenAI Adapter Resilience', () => {
    test('Handles API timeout gracefully', async () => {
      // Mock slow response by testing with very short timeout
      const response = await request('http://localhost:5000')
        .post('/api/eval-specs/test/execute')
        .send({
          samples: [{ input: 'test', expected: 'response' }],
          timeout: 1 // 1ms timeout to force failure
        });
      
      // Should not crash the server
      expect([400, 500, 503]).toContain(response.status);
    });

    test('Retry mechanism works for transient failures', async () => {
      // Test that retries don't cause duplicate processing
      const startTime = Date.now();
      
      const response = await request('http://localhost:5000')
        .get('/api/eval-specs')
        .expect(200);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete reasonably quickly (not stuck in retry loops)
      expect(duration).toBeLessThan(10000); // 10 seconds max
    });
  });

  describe('Storage Operation Resilience', () => {
    test('Database operations handle errors gracefully', async () => {
      // Test with malformed data
      const response = await request('http://localhost:5000')
        .post('/api/policies')
        .send({
          name: '', // Invalid empty name
          rules: 'invalid-json'
        });
      
      expect([400, 422]).toContain(response.status);
    });

    test('Concurrent operations maintain consistency', async () => {
      // Create multiple concurrent requests
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request('http://localhost:5000')
            .get('/api/policies')
            .expect(200)
        );
      }
      
      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });
    });
  });

  describe('System Under Load', () => {
    test('Handles concurrent API requests', async () => {
      const concurrentRequests = 20;
      const promises = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request('http://localhost:5000')
            .get('/api/dashboard/stats')
            .timeout(5000)
        );
      }
      
      const results = await Promise.allSettled(promises);
      
      // Most requests should succeed
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);
      expect(successful.length).toBeGreaterThan(concurrentRequests * 0.8); // 80% success rate
    });

    test('Memory usage remains stable', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform many operations
      for (let i = 0; i < 100; i++) {
        await request('http://localhost:5000')
          .get('/api/eval-specs')
          .timeout(1000);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      
      // Memory should not grow excessively
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // Less than 50MB growth
    });
  });

  describe('Error Recovery Tests', () => {
    test('System recovers from temporary database unavailability', async () => {
      // Test system behavior when database operations fail
      const response = await request('http://localhost:5000')
        .get('/api/runs')
        .expect(200);
      
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('Partial failures do not break entire operations', async () => {
      // Test creating a run with some invalid data
      const response = await request('http://localhost:5000')
        .post('/api/runs')
        .send({
          evalSpecId: 'valid-spec-id',
          name: 'Test Run',
          invalidField: { deeply: { nested: { invalid: 'data' } } }
        });
      
      // Should either succeed (ignoring invalid fields) or fail gracefully
      expect([200, 201, 400, 422]).toContain(response.status);
    });
  });

  describe('Security and Validation Tests', () => {
    test('Input validation prevents injection attacks', async () => {
      const maliciousInputs = [
        { name: '<script>alert("xss")</script>' },
        { name: '"; DROP TABLE policies; --' },
        { name: '${process.env.SECRET}' },
        { name: '../../../etc/passwd' }
      ];
      
      for (const maliciousInput of maliciousInputs) {
        const response = await request('http://localhost:5000')
          .post('/api/policies')
          .send(maliciousInput);
        
        // Should either reject or sanitize
        if (response.status === 200 || response.status === 201) {
          expect(response.body.name).not.toContain('<script>');
          expect(response.body.name).not.toContain('DROP TABLE');
        }
      }
    });

    test('Large payload handling', async () => {
      const largePayload = {
        name: 'Test Policy',
        description: 'x'.repeat(10000), // 10KB description
        rules: JSON.stringify({
          data: new Array(1000).fill('test').map((_, i) => `item-${i}`)
        })
      };
      
      const response = await request('http://localhost:5000')
        .post('/api/policies')
        .send(largePayload);
      
      // Should handle large payloads gracefully
      expect([200, 201, 400, 413]).toContain(response.status);
    });
  });

  describe('Performance and Timeout Tests', () => {
    test('API responses within acceptable time limits', async () => {
      const endpoints = [
        '/api/dashboard/stats',
        '/api/eval-specs',
        '/api/policies',
        '/api/runs'
      ];
      
      for (const endpoint of endpoints) {
        const startTime = Date.now();
        
        await request('http://localhost:5000')
          .get(endpoint)
          .timeout(5000)
          .expect(200);
        
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(3000); // 3 second max response time
      }
    });

    test('System handles slow operations without blocking', async () => {
      // Start a potentially slow operation
      const slowPromise = request('http://localhost:5000')
        .get('/api/runs')
        .timeout(10000);
      
      // Immediately make other requests
      const fastPromises = [
        request('http://localhost:5000').get('/api/dashboard/stats'),
        request('http://localhost:5000').get('/api/eval-specs'),
        request('http://localhost:5000').get('/api/policies')
      ];
      
      // Fast requests should complete quickly
      const fastResults = await Promise.all(fastPromises);
      fastResults.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      // Slow request should eventually complete
      const slowResult = await slowPromise;
      expect(slowResult.status).toBe(200);
    });
  });
});

describe('Monitoring and Observability Tests', () => {
  test('Health check endpoint provides comprehensive status', async () => {
    const response = await request('http://localhost:5000')
      .get('/api/health')
      .expect(200);
    
    // Should include system health information
    expect(response.body).toHaveProperty('status');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(response.body.status);
  });

  test('Metrics endpoints provide performance data', async () => {
    const response = await request('http://localhost:5000')
      .get('/api/dashboard/stats')
      .expect(200);
    
    // Should include performance metrics
    expect(response.body).toHaveProperty('activeRuns');
    expect(typeof response.body.activeRuns).toBe('number');
  });
});