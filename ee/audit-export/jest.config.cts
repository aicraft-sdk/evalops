module.exports = {
  displayName: 'ee-audit-export',
  preset: '../../jest.preset.cjs',
  testEnvironment: 'node',
  transform: { '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/ee/audit-export',
  coverageThreshold: { global: { lines: 1, statements: 1, functions: 1, branches: 1 } },
};
