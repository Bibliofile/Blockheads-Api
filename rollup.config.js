import typescript from 'rollup-plugin-typescript2'
import assert from 'assert'
import fs from 'fs'

const cloudApi = fs.readFileSync(__dirname + '/cloud/api.ts', 'utf-8').trim()
const macApi = fs.readFileSync(__dirname + '/mac/api.ts', 'utf-8').trim()
assert.equal(cloudApi, macApi, 'Cloud and Mac API declarations must be equal.')

const compilerOptions = {
  target: "es6",
  lib: [
    "es7",
    "dom",
    "scripthost"
  ],
  moduleResolution: "node",
  declaration: true,
  removeComments: false,
  noImplicitAny: true,
  strictNullChecks: true,
  noUnusedLocals: true,
  noUnusedParameters: true
}

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

export default [
  cloudCommon,
  cloudES,
  macCommon
]
