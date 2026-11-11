/*
 * Paginas vivas da documentacao da DJI (tools/lib/pagina-dji.mjs), o gerador
 * do dicionario sobre elas (tools/wpml-spec.mjs) e a diferenca semantica
 * entre dicionarios (tools/wpml-spec-diff.mjs). Os pedacos de pagina sao
 * sinteticos, escritos aqui no formato do VuePress (o texto da DJI nao entra
 * no repositorio): uma funcao de render com createStaticVNode,
 * createElementVNode, createTextVNode e o componente do icone das ligacoes.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, test } from 'vitest'
import {
  chunkToMarkdown,
  decodeEntities,
  fetchPages,
  parseChunk,
  parseHtml,
} from '../../tools/lib/pagina-dji.mjs'
import { describeDiff, diffSpec, supportDelta } from '../../tools/wpml-spec-diff.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/** Pedaço de página: `statics` são HTML estático, `nodes` expressões de nós já escritas. */
function chunk({ path, statics = [], nodes = [], updated = 1793879893 }) {
  const lit = (s) => JSON.stringify(s)
  const decl = statics.map((h, i) => `s${i}=(0,e.uE)(${lit(h)},2)`)
  const children = [...statics.map((_, i) => `s${i}`), ...nodes].join(',')
  return (
    '"use strict";(self.webpackChunkx=self.webpackChunkx||[]).push([[1],{10:(t,d,r)=>{r.r(d),r.d(d,{default:()=>D});' +
    `var e=r(66252);const ${decl.length ? decl.join(',') + ',' : ''}n={},D=(0,r(83744).Z)(n,[["render",function(t,d){const r=(0,e.up)("ExternalLinkIcon");return(0,e.wg)(),(0,e.iD)("div",null,[${children}])}]])},` +
    `11:(t,d,r)=>{r.r(d),r.d(d,{data:()=>e});const e={key:"v-1a2b",path:${lit(path)},title:"",lang:"en",frontmatter:{},excerpt:"",headers:[],git:{updatedTime:${updated}e3},filePathRelative:"en/x.md"}}}]);`
  )
}

const TABLE_HEAD =
  '<thead><tr><th>Element</th><th>Name</th><th>Type</th><th>unit</th><th>Value</th><th>Is it required (default)</th><th>Product Support</th></tr></thead>'
const row = (...cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`
const h = (n, id, html) =>
  `<h${n} id="${id}" tabindex="-1"><a class="header-anchor" href="#${id}" aria-hidden="true">#</a> ${html}</h${n}>`

describe('pagina viva -> Markdown', () => {
  test('cabecalhos, paragrafos, tabelas, codigo, enfase, quebras e ligacoes', () => {
    const js = chunk({
      path: '/en/a.html',
      statics: [
        h(2, 'intro', 'Intro') + '<p>Um <code>template.kml</code> e <em>texto</em>.</p>',
        h(3, 'wpml-x', '<code>&lt;wpml:missionConfig&gt;</code>') +
          `<table>${TABLE_HEAD}<tbody>${row(
            'wpml:finishAction',
            'acabar',
            'enum',
            '-',
            '<code>goHome</code>: volta<br><code>noAction</code>: nada<br>*Note: x | y',
            'Yes',
            'M300 RTK, M3D/M3TD，M4E/M4T',
          )}</tbody></table>`,
        '<div class="language-xml ext-xml line-numbers-mode"><pre class="language-xml"><code><span class="token tag">&lt;wpml:a&gt;</span>1&lt;/wpml:a&gt;\n</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div></div></div>',
      ],
      nodes: [
        '(0,e._)("p",null,[(0,e.Uk)("Ver "),(0,e._)("a",{href:"https://x.y/z",target:"_blank"},[(0,e.Uk)("a pagina"),(0,e.Wm)(r)]),(0,e.Uk)()],-1)',
        // «<wpml:imageFormat>» solto: o markdown-it fez dele uma ligacao automatica
        '(0,e._)("p",null,[(0,e._)("a",{href:"wpml:imageFormat"},"wpml:imageFormat"),(0,e.Uk)("wide,ir")])',
      ],
    })
    const { markdown, meta, headings } = chunkToMarkdown(js)
    expect(meta.path).toBe('/en/a.html')
    expect(new Date(meta.updatedTime).toISOString()).toBe('2026-11-05T11:58:13.000Z')
    expect(headings.map((x) => x.id)).toEqual(['intro', 'wpml-x'])
    const lines = markdown.split('\n')
    expect(lines).toContain('## Intro')
    expect(lines).toContain('Um `template.kml` e *texto*.')
    expect(lines).toContain('### `<wpml:missionConfig>`')
    expect(lines).toContain(
      '| wpml:finishAction | acabar | enum | - | `goHome`: volta<br/>`noAction`: nada<br/>*Note: x \\| y | Yes | M300 RTK, M3D/M3TD，M4E/M4T |',
    )
    expect(markdown).toContain('```xml\n<wpml:a>1</wpml:a>\n```')
    expect(lines).toContain('Ver [a pagina](https://x.y/z)')
    expect(lines).toContain('<wpml:imageFormat>wide,ir')
  })

  test('literais com escapes e o texto por omissao do createTextVNode', () => {
    const js = chunk({
      path: '/en/b.html',
      nodes: [
        '(0,e._)("p",null,[(0,e.Uk)("a\\u00e9\\n"),(0,e.Uk)(),(0,e._)("code",null,"x\\"y")])',
      ],
    })
    // a quebra de linha do texto fica (uma quebra suave no Markdown)
    expect(chunkToMarkdown(js).markdown).toBe('aé\n`x"y`\n')
  })

  test('falha alto no que nao conhece', () => {
    expect(() => parseChunk('const x=1')).toThrow(/metadados/)
    const comp = chunk({ path: '/en/c.html', nodes: ['(0,e.Wm)((0,e.up)("CodeGroup"))'] })
    expect(() => parseChunk(comp)).toThrow(/componente desconhecido/)
    const fn = chunk({ path: '/en/c.html', nodes: ['(0,e.zz)("p")'] })
    expect(() => parseChunk(fn)).toThrow(/função do Vue desconhecida/)
    const tpl = chunk({ path: '/en/c.html', nodes: ['(0,e.Uk)(`x`)'] })
    expect(() => parseChunk(tpl)).toThrow(/literal de modelo/)
  })

  test('HTML: entidades, elementos vazios, comentarios e fecho em falta', () => {
    expect(decodeEntities('&lt;a&gt; &amp; &#39;&#x41;&quot; &nbsp;')).toBe('<a> & \'A"  ')
    const nodes = parseHtml('<p>a<br>b<!-- c --><img src="x"/></p><ul><li>1<li>2</ul>')
    expect(nodes[0].tag).toBe('p')
    expect(nodes[0].children.map((n) => n.tag ?? n.text)).toEqual(['a', 'br', 'b', 'img'])
  })

  test('descarga: a casca, o mapa de rotas e o pedaco de cada pagina', async () => {
    const page = chunk({ path: '/en/a.html', statics: ['<p>x</p>'] })
    const files = {
      'https://dji.test/doc/en/a.html':
        '<script src="/doc/assets/js/app.0a1b.js" defer></script><link rel="prefetch" href="/doc/assets/js/v-1a2b.ffee.js">',
      'https://dji.test/doc/assets/js/app.0a1b.js': '[["v-1a2b","/en/a.html",{title:""}]]',
      'https://dji.test/doc/assets/js/v-1a2b.ffee.js': page,
    }
    const pedidos = []
    const fetchText = async (url) => {
      pedidos.push(url)
      if (!(url in files)) throw new Error(`404 ${url}`)
      return files[url]
    }
    const got = await fetchPages(['/en/a.html'], { fetchText, site: 'https://dji.test/doc' })
    expect(got).toHaveLength(1)
    expect(got[0].chunkUrl).toBe('https://dji.test/doc/assets/js/v-1a2b.ffee.js')
    expect(got[0].js).toBe(page)
    await expect(
      fetchPages(['/en/a.html', '/en/b.html'], { fetchText, site: 'https://dji.test/doc' }),
    ).rejects.toThrow(/mapa de rotas/)
  })
})

/* ---- o gerador sobre uma pasta de paginas sinteticas -------------------- */
const tmp = mkdtempSync(join(tmpdir(), 'wpml-spec-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const xmlBlock = (xml) =>
  `<div class="language-xml ext-xml"><pre class="language-xml"><code>${xml
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')}</code></pre></div>`
const sup = 'M300 RTK, M3E/M3T/M3M，M4E/M4T'
const PAGES = {
  'en.template-kml': chunk({
    path: '/en/api-reference/dji-wpml/template-kml.html',
    statics: [
      xmlBlock(
        '<kml xmlns:wpml="http://www.dji.com/wpmz/1.0.2"><Document><wpml:missionConfig><wpml:finishAction>goHome</wpml:finishAction></wpml:missionConfig></Document></kml>',
      ),
      h(3, 'mission', 'Mission (parent element: <code>&lt;wpml:missionConfig&gt;</code>)') +
        `<table>${TABLE_HEAD}<tbody>${row('wpml:globalRTHHeight', 'rth', 'Float', 'm', '[2,1500] <em>Note: x</em>', 'Yes', sup)}</tbody></table>`,
    ],
  }),
  'en.waylines-wpml': chunk({
    path: '/en/api-reference/dji-wpml/waylines-wpml.html',
    statics: [
      xmlBlock('<kml xmlns:wpml="http://www.dji.com/wpmz/1.0.2"><Document></Document></kml>'),
    ],
  }),
  'en.common-element': chunk({
    path: '/en/api-reference/dji-wpml/common-element.html',
    statics: [
      h(3, 'wpml-droneinfo', '<code>&lt;wpml:droneInfo&gt;</code>') +
        `<table>${TABLE_HEAD}<tbody>${row(
          'wpml:droneEnumValue',
          'drone type',
          'int',
          '-',
          'please refer to the <code>type</code> in the <code>Enumeration Values of Aircraft, RC and Dock</code> in the <a href="https://x/product-support.html">Product Support</a> page.',
          'Yes',
          sup,
        )}</tbody></table>`,
      h(3, 'wpml-actionactuatorfuncparam', '<code>&lt;wpml:actionActuatorFuncParam&gt;</code>') +
        h(4, 'takephoto', 'takePhoto') +
        `<table>${TABLE_HEAD}<tbody>${row(
          'wpml:payloadLensIndex',
          'lens',
          'List of photo format',
          'enum-string (list)',
          'zoom: a<br>visable: b<br>* Note: c, «<code>wide,ir</code>»',
          'Yes',
          'M30/M30T, M3D/M3TD，M4E/M4T',
        )}</tbody></table>`,
    ],
  }),
  'en.product-support': chunk({
    path: '/en/overview/product-support.html',
    updated: 1791978558,
    statics: [
      `<table><tr><td>Aircraft</td><td>Gateway</td><td>Payload</td><td>Comment</td></tr>${row('<a href="https://x">Matrice 300 RTK</a>', 'RC Plus', 'H20/H20T', 'x')}</table>`,
      h(
        2,
        'enumeration-values-of-aircraft-rc-and-dock',
        'Enumeration Values of Aircraft, RC and Dock',
      ) +
        `<table><tr><td>name</td><td>domain</td><td>type</td><td>sub_type</td><td>Description</td></tr>${row('M4T', '0', '99', '1', '-')}${row('RC', '2', '174', '0', '-')}</table>`,
      h(2, 'enumeration-values-of-camera', 'Enumeration Values of Camera') +
        `<table><tr><td>Product Type</td><td>name</td><td>domain</td><td>type-subtype-gimbalindex</td><td>Description</td></tr>${row('Camera', 'H20', '1', 'Portside (Main): 42-0-0<br>Starboard: 42-0-1', '-')}${row('M4T Camera', '1', 'Main of aircraft: 89-0-0', '-')}</table>`,
    ],
  }),
}

describe('gerador sobre as paginas vivas (tools/wpml-spec.mjs)', () => {
  const live = join(tmp, 'paginas')
  const out = join(tmp, 'spec.json')
  const run = (...args) =>
    execFileSync(process.execPath, [join(ROOT, 'tools', 'wpml-spec.mjs'), ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

  test('le a pasta, regista a origem e o --check compara sem a data do descarregamento', () => {
    mkdirSync(live)
    for (const [name, js] of Object.entries(PAGES)) writeFileSync(join(live, `${name}.js`), js)
    writeFileSync(join(live, 'fonte.json'), JSON.stringify({ downloaded: '2026-11-11', pages: [] }))
    run('--live', live, '--out', out)
    const spec = JSON.parse(readFileSync(out, 'utf8'))
    expect(spec.source.downloaded).toBe('2026-11-11')
    expect(spec.source.pages.map((p) => p.updated)).toEqual([
      '2026-11-05T11:58:13Z',
      '2026-11-05T11:58:13Z',
      '2026-11-05T11:58:13Z',
      '2026-10-14T11:49:18Z',
    ])
    const rth = spec.elements['missionConfig/globalRTHHeight'].docs['20.template-kml.md']
    expect(rth.range).toEqual({ min: 2, minOpen: false, max: 1500, maxOpen: false })
    expect(rth.support).toEqual(['M300 RTK', 'M3E/M3T/M3M', 'M4E/M4T'])
    expect(rth.anchor).toBe('mission')
    const drone = spec.elements['droneInfo/droneEnumValue'].docs['40.common-element.md']
    expect(drone.values).toBeNull()
    expect(drone.ref).toEqual({ page: 'product-support', table: 'aircraft', field: 'type' })
    const lens =
      spec.elements['actionActuatorFuncParam/payloadLensIndex@takePhoto'].docs[
        '40.common-element.md'
      ]
    // «`wide,ir`» numa nota não é um valor
    expect(new Set(lens.values)).toEqual(new Set(['zoom', 'visable']))
    expect(lens.anchor).toBe('takephoto')
    expect(spec.examples['template.kml'].missionConfig).toEqual(['finishAction'])
    expect(spec.namespaces['template.kml']).toEqual(['1.0.2'])
    expect(spec.productSupport.aircraft).toEqual([
      { name: 'M4T', domain: 0, type: 99, subType: 1, line: expect.any(Number) },
      { name: 'RC', domain: 2, type: 174, subType: 0, line: expect.any(Number) },
    ])
    expect(spec.productSupport.cameras.map((c) => [c.name, c.type, c.gimbalIndex])).toEqual([
      ['H20', 42, [0, 1]],
      ['M4T Camera', 89, [0]],
    ])
    expect(spec.productSupport.models).toEqual([
      { aircraft: 'Matrice 300 RTK', gateway: 'RC Plus', payload: 'H20/H20T' },
    ])
    // outra data de descarregamento: em dia; outra pagina: diverge
    writeFileSync(join(live, 'fonte.json'), JSON.stringify({ downloaded: '2027-01-01', pages: [] }))
    expect(run('--live', live, '--out', out, '--check')).toMatch(/em dia/)
    writeFileSync(
      join(live, 'en.template-kml.js'),
      PAGES['en.template-kml'].replace('[2,1500]', '[2,1600]'),
    )
    expect(() => run('--live', live, '--out', out, '--check')).toThrow()
  })

  test('sem as paginas: diz como as descarregar', () => {
    expect(() => run('--live', join(tmp, 'nada'), '--out', out)).toThrow(/--fetch/)
  })
})

describe('diferenca semantica (tools/wpml-spec-diff.mjs)', () => {
  const doc = (o) => ({
    line: 1,
    description: 'd',
    type: 'int',
    unit: '-',
    values: null,
    range: null,
    required: 'yes',
    note: null,
    support: ['M300 RTK'],
    ...o,
  })
  const spec = (elements, examples = {}) => ({ elements, examples })
  test('novos, removidos, campos mudados (a linha nao conta), ordem dos exemplos', () => {
    const a = spec(
      {
        'a/x': { docs: { f: doc({ values: ['1', '2'] }) } },
        'a/y': { docs: { f: doc({}) } },
      },
      { t: { a: ['x', 'y'] } },
    )
    const b = spec(
      {
        'a/x': {
          docs: { f: doc({ line: 9, values: ['2', '1'], support: ['M300 RTK', 'M4E/M4T'] }) },
        },
        'a/z': { docs: { f: doc({}) } },
      },
      { t: { a: ['y', 'x'] } },
    )
    const d = diffSpec(a, b)
    expect(d.added).toEqual(['a/z'])
    expect(d.removed).toEqual(['a/y'])
    // a ordem dos valores de um enum nao conta
    expect(d.changed.map((c) => c.field)).toEqual(['support'])
    expect(supportDelta(d.changed[0].before, d.changed[0].after)).toEqual({
      plus: ['M4E/M4T'],
      minus: [],
    })
    expect(d.examples).toHaveLength(1)
    expect(describeDiff(d, b)).toMatch(/a\/x \[f\]: \+M4E\/M4T/)
  })
})
