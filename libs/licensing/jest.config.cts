module.exports = {
  displayName: 'licensing',
  preset: '../../jest.preset.cjs',
  testEnvironment: 'node',
  transform: { '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/licensing',
  coverageThreshold: { global: { lines: 1, statements: 1, functions: 1, branches: 1 } },
};
