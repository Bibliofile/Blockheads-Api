import typescript from 'rollup-plugin-typescript2'

const { compilerOptions } = require('./tsconfig.json')

const createConfig = tsOptions => options => {
  const override = Object.assign({}, compilerOptions, tsOptions)

  return Object.assign({
    plugins: [
      typescript({
        tsconfigOverride: { compilerOptions: override },
        useTsconfigDeclarationDir: true
      })
    ],
    external: ['crypto']
  }, options)
}

const createCommonConfig = createConfig({
  moduleResolution: "node",
})

const cloudCommon = createCommonConfig({
  input: 'cloud/index.ts',
  output: {
    file: 'cloud/build.js',
    format: 'cjs'
  }
})

const cloudES = createConfig({})({
  input: 'cloud/index.ts',
  output: {
    file: 'cloud/build_es.js',
    format: 'es'
  }
})

// No need to make an ES bundle for Macs as they cannot be used in the browser

const macCommon = createCommonConfig({
  input: 'mac/index.ts',
  output: {
    file: 'mac/build.js',
    format: 'cjs'
  },
  external: [
    'fs', 'zlib', 'util', 'child_process'
  ]
})

const interfaceConfig = createConfig({})({
  input: 'api/index.ts',
  output: {
    file: 'api/build.js',
    format: 'cjs'
  }
})

export default [
  cloudCommon,
  cloudES,
  macCommon,
  interfaceConfig
]
