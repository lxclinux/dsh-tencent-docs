// Validates dist/publish/index.json against DSH's plugin market index format 1.
// Run: node validate-index.mjs
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const MODULE = 'file:///C:/D%E7%9B%98/deepseek-harness/resources/app/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js'
const { parseMarketIndex, marketInstallTarget } = await import(pathToFileURL('C:/D盘/deepseek-harness/resources/app/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js').href)

const raw = await readFile(new URL('./index.json', import.meta.url), 'utf8')
const index = parseMarketIndex(JSON.parse(raw), 'https://example.com/plugins/index.json')

for (const plugin of index.plugins) {
  const [latest] = plugin.versions
  console.log(`ok  ${plugin.name}  versions=${plugin.versions.map((v) => v.version).join(',')}`)
  console.log(`    icon=${plugin.icon ?? '(none)'}`)
  console.log(`    install=${JSON.stringify(marketInstallTarget(plugin.name, latest))}`)
}
console.log(`index title=${JSON.stringify(index.title)} plugins=${index.plugins.length}`)
