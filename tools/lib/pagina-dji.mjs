/*
 * Páginas vivas da documentação do Cloud API da DJI (developer.dji.com/doc/
 * cloud-api-tutorial), lidas sem as executar. O site é um VuePress: o HTML
 * de cada página é uma casca de SPA e o conteúdo vem num pedaço JavaScript
 * (assets/js/v-<chave>.<hash>.js) com a função de render da página
 * compilada pelo Vue — nós por createElementVNode/createTextVNode/
 * createStaticVNode — e os metadados (caminho, ficheiro Markdown de origem,
 * data da última alteração).
 *
 * Este módulo:
 *  - lê o pedaço com um analisador de expressões JavaScript mínimo (só o
 *    subconjunto que o compilador do Vue produz: literais, chamadas,
 *    sequências, membros, listas, objectos, funções com const/return), sem
 *    eval nem vm: o código descarregado nunca corre;
 *  - avalia a função de render para uma árvore de nós (o HTML estático dos
 *    createStaticVNode passa por um analisador de HTML pequeno);
 *  - converte a árvore em Markdown com a estrutura das fontes do repositório
 *    dji-sdk/cloud-api-doc (cabeçalhos #, tabelas com |, `código`, <br/>,
 *    *ênfase*, blocos ```xml), que é o formato que tools/wpml-spec.mjs lê.
 *
 * Tudo o que o analisador não conhece falha alto: uma mudança de formato do
 * site tem de parar a geração, não produzir um dicionário pela metade.
 */

/* ---- léxico ------------------------------------------------------------ */
const PUNCT = ['=>', '...', '===', '!==', '==', '!=', '&&', '||', '??', '?.']
const SINGLE = '(){}[],;:.=!?-+*/<>&|~%^'

function lex(src, start = 0) {
  const tokens = []
  let i = start
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
      i++
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end < 0 ? n : end + 2
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      let out = ''
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') {
          const e = src[j + 1]
          if (e === 'n') out += '\n'
          else if (e === 't') out += '\t'
          else if (e === 'r') out += '\r'
          else if (e === 'b') out += '\b'
          else if (e === 'f') out += '\f'
          else if (e === 'v') out += '\v'
          else if (e === '0' && !/[0-9]/.test(src[j + 2])) out += '\0'
          else if (e === 'u') {
            if (src[j + 2] === '{') {
              const close = src.indexOf('}', j + 3)
              out += String.fromCodePoint(parseInt(src.slice(j + 3, close), 16))
              j = close + 1
              continue
            }
            out += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16))
            j += 6
            continue
          } else if (e === 'x') {
            out += String.fromCharCode(parseInt(src.slice(j + 2, j + 4), 16))
            j += 4
            continue
          } else if (e === '\n') {
            /* continuação de linha */
          } else out += e
          j += 2
          continue
        }
        out += src[j]
        j++
      }
      if (j >= n) throw new Error(`texto por fechar na posição ${i}`)
      tokens.push({ t: 'str', v: out, at: i })
      i = j + 1
      continue
    }
    if (c === '`') throw new Error(`literal de modelo (\`) na posição ${i}: formato não suportado`)
    const num = /^(?:\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)/i.exec(src.slice(i, i + 40))
    if (num && /[0-9.]/.test(c) && !(c === '.' && !/[0-9]/.test(src[i + 1]))) {
      tokens.push({ t: 'num', v: Number(num[0]), at: i })
      i += num[0].length
      continue
    }
    const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 200))
    if (id) {
      tokens.push({ t: 'id', v: id[0], at: i })
      i += id[0].length
      continue
    }
    const p = PUNCT.find((x) => src.startsWith(x, i))
    if (p) {
      tokens.push({ t: 'p', v: p, at: i })
      i += p.length
      continue
    }
    if (SINGLE.includes(c)) {
      tokens.push({ t: 'p', v: c, at: i })
      i++
      continue
    }
    throw new Error(`carácter inesperado ${JSON.stringify(c)} na posição ${i}`)
  }
  return tokens
}

/* ---- sintaxe (subconjunto) -------------------------------------------- */
class Parser {
  constructor(tokens) {
    this.k = tokens
    this.i = 0
  }
  peek(o = 0) {
    return this.k[this.i + o]
  }
  is(v, o = 0) {
    const t = this.peek(o)
    return t && (t.t === 'p' || t.t === 'id') && t.v === v
  }
  eat(v) {
    const t = this.peek()
    if (!t || t.v !== v || (t.t !== 'p' && t.t !== 'id'))
      throw new Error(`esperava «${v}» e veio ${t ? JSON.stringify(t.v) : 'o fim'}`)
    this.i++
    return t
  }
  /** Expressão com vírgulas (sequência). */
  expression() {
    const list = [this.assign()]
    while (this.is(',')) {
      this.i++
      list.push(this.assign())
    }
    return list.length === 1 ? list[0] : { type: 'seq', list }
  }
  /** Expressão sem vírgula de topo (argumentos, elementos, declarações). */
  assign() {
    // (a,b)=>... e x=>... : só para os saltar inteiros, se aparecerem
    if (this.peek()?.t === 'id' && this.is('=>', 1)) {
      this.i += 2
      return { type: 'arrow', body: this.is('{') ? this.block() : this.assign() }
    }
    const left = this.unary()
    if (this.is('?')) {
      this.i++
      const a = this.assign()
      this.eat(':')
      const b = this.assign()
      return { type: 'cond', test: left, a, b }
    }
    if (this.is('||') || this.is('&&') || this.is('??')) {
      const op = this.peek().v
      this.i++
      return { type: 'logic', op, left, right: this.assign() }
    }
    if (this.is('=')) {
      this.i++
      return { type: 'assignment', target: left, value: this.assign() }
    }
    return left
  }
  unary() {
    if (this.is('!') || this.is('-') || this.is('+') || this.is('void')) {
      const op = this.peek().v
      this.i++
      return { type: 'unary', op, arg: this.unary() }
    }
    return this.postfix(this.primary())
  }
  postfix(node) {
    for (;;) {
      if (this.is('.')) {
        this.i++
        const t = this.peek()
        if (t?.t !== 'id') throw new Error('membro sem nome')
        this.i++
        node = { type: 'member', object: node, prop: t.v }
      } else if (this.is('(')) {
        node = { type: 'call', callee: node, args: this.args() }
      } else if (this.is('[')) {
        this.i++
        const prop = this.expression()
        this.eat(']')
        node = { type: 'index', object: node, prop }
      } else return node
    }
  }
  args() {
    this.eat('(')
    const out = []
    while (!this.is(')')) {
      out.push(this.assign())
      if (!this.is(')')) this.eat(',')
    }
    this.eat(')')
    return out
  }
  primary() {
    const t = this.peek()
    if (!t) throw new Error('expressão truncada')
    if (t.t === 'str' || t.t === 'num') {
      this.i++
      return { type: 'lit', value: t.v }
    }
    if (t.t === 'id') {
      if (t.v === 'function') return this.func()
      if (t.v === 'null') return (this.i++, { type: 'lit', value: null })
      if (t.v === 'true') return (this.i++, { type: 'lit', value: true })
      if (t.v === 'false') return (this.i++, { type: 'lit', value: false })
      this.i++
      return { type: 'id', name: t.v }
    }
    if (this.is('(')) {
      // (a,b)=>... ou (expressão)
      const save = this.i
      this.i++
      let depth = 1
      while (depth > 0 && this.peek()) {
        if (this.is('(')) depth++
        else if (this.is(')')) depth--
        this.i++
      }
      if (this.is('=>')) {
        this.i++
        return { type: 'arrow', body: this.is('{') ? this.block() : this.assign() }
      }
      this.i = save + 1
      const e = this.expression()
      this.eat(')')
      return e
    }
    if (this.is('[')) {
      this.i++
      const items = []
      while (!this.is(']')) {
        items.push(this.assign())
        if (!this.is(']')) this.eat(',')
      }
      this.eat(']')
      return { type: 'array', items }
    }
    if (this.is('{')) {
      this.i++
      const props = []
      while (!this.is('}')) {
        const k = this.peek()
        if (!k || (k.t !== 'id' && k.t !== 'str' && k.t !== 'num'))
          throw new Error(`chave de objecto inesperada na posição ${k?.at}`)
        this.i++
        if (this.is(':')) {
          this.i++
          props.push({ key: String(k.v), value: this.assign() })
        } else props.push({ key: String(k.v), value: { type: 'id', name: k.v } })
        if (!this.is('}')) this.eat(',')
      }
      this.eat('}')
      return { type: 'object', props }
    }
    throw new Error(`símbolo inesperado ${JSON.stringify(t.v)} na posição ${t.at}`)
  }
  func() {
    this.eat('function')
    if (this.peek()?.t === 'id') this.i++
    const params = []
    this.eat('(')
    while (!this.is(')')) {
      params.push(this.eat(this.peek().v).v)
      if (!this.is(')')) this.eat(',')
    }
    this.eat(')')
    return { type: 'function', params, body: this.block() }
  }
  /** Corpo de função: declarações const/let/var, return e expressões. */
  block() {
    this.eat('{')
    const body = []
    while (!this.is('}')) {
      if (this.is(';')) {
        this.i++
        continue
      }
      if (this.is('const') || this.is('let') || this.is('var')) {
        this.i++
        body.push({ type: 'decl', list: this.declarations() })
      } else if (this.is('return')) {
        this.i++
        body.push({ type: 'return', value: this.expression() })
      } else body.push({ type: 'expr', value: this.expression() })
    }
    this.eat('}')
    return body
  }
  declarations() {
    const list = []
    for (;;) {
      const t = this.peek()
      if (t?.t !== 'id') throw new Error(`declaração sem nome na posição ${t?.at}`)
      this.i++
      this.eat('=')
      list.push({ name: t.v, init: this.assign() })
      if (this.is(',')) {
        this.i++
        continue
      }
      return list
    }
  }
}

/* ---- HTML (os createStaticVNode) --------------------------------------- */
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr', 'col', 'source'])
const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' }
export const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#')
      return String.fromCodePoint(
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1),
      )
    return ENTITIES[e.toLowerCase()] ?? m
  })

/** Nós { tag, attrs, children } e { text } a partir de HTML bem formado. */
export function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [] }
  const stack = [root]
  const re =
    /<!--[\s\S]*?-->|<\/([A-Za-z][\w:-]*)\s*>|<([A-Za-z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|(<)/g
  let m
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1]
    if (m[0].startsWith('<!--')) continue
    if (m[1]) {
      const tag = m[1].toLowerCase()
      const at = stack.map((x) => x.tag).lastIndexOf(tag)
      if (at > 0) stack.length = at
      continue
    }
    if (m[2]) {
      const tag = m[2].toLowerCase()
      const attrs = {}
      for (const a of m[3].matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
        attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '')
      const node = { tag, attrs, children: [] }
      top.children.push(node)
      if (!VOID.has(tag) && !m[4]) stack.push(node)
      continue
    }
    top.children.push({ text: decodeEntities(m[5] ?? m[6]) })
  }
  return root.children
}

/* ---- avaliação da função de render ------------------------------------ */
const HELPERS = {
  _: 'element',
  iD: 'element',
  Uk: 'text',
  uE: 'static',
  Wm: 'component',
  up: 'resolve',
  wg: 'open',
}
// componentes globais do tema que não têm conteúdo de texto
const SILENT_COMPONENTS = new Set(['ExternalLinkIcon', 'OutboundLink', 'Badge'])

function toChildren(v) {
  if (v == null || v === false) return []
  if (Array.isArray(v)) return v.flatMap(toChildren)
  if (typeof v === 'string' || typeof v === 'number') return [{ text: String(v) }]
  if (v.nodes) return v.nodes
  if (v.tag || v.text != null) return [v]
  if (v.skip) return []
  throw new Error(`filho de nó inesperado: ${JSON.stringify(v).slice(0, 80)}`)
}

function makeEvaluator(moduleScope, helperVar) {
  const evaluate = (node, scope) => {
    switch (node.type) {
      case 'lit':
        return node.value
      case 'id': {
        for (let s = scope; s; s = s.parent) {
          if (Object.prototype.hasOwnProperty.call(s.vars, node.name)) {
            const slot = s.vars[node.name]
            if (!slot.done) {
              if (slot.busy) throw new Error(`definição circular de ${node.name}`)
              slot.busy = true
              slot.value = evaluate(slot.init, s)
              slot.done = true
            }
            return slot.value
          }
        }
        if (node.name === helperVar) return { helpers: true }
        throw new Error(`identificador desconhecido: ${node.name}`)
      }
      case 'seq': {
        let last
        for (const e of node.list) last = evaluate(e, scope)
        return last
      }
      case 'unary': {
        const v = evaluate(node.arg, scope)
        if (node.op === '-') return -v
        if (node.op === '+') return +v
        if (node.op === '!') return !v
        return undefined
      }
      case 'member': {
        const obj =
          node.object.type === 'id' && node.object.name === helperVar
            ? { helpers: true }
            : evaluate(node.object, scope)
        if (obj?.helpers) {
          if (!HELPERS[node.prop]) throw new Error(`função do Vue desconhecida: ${node.prop}`)
          return { helper: HELPERS[node.prop] }
        }
        throw new Error(`membro ${node.prop} de um valor que não é do Vue`)
      }
      case 'array':
        return node.items.map((x) => evaluate(x, scope))
      case 'object': {
        const o = {}
        for (const p of node.props) o[p.key] = evaluate(p.value, scope)
        return o
      }
      case 'call': {
        const fn = evaluate(node.callee, scope)
        if (!fn?.helper) throw new Error('chamada a uma função que não é do Vue')
        const args = node.args.map((a) => evaluate(a, scope))
        switch (fn.helper) {
          case 'element': {
            const [tag, props, children] = args
            const attrs = {}
            for (const [k, v] of Object.entries(props ?? {}))
              if (typeof v === 'string' || typeof v === 'number') attrs[k] = String(v)
            return { tag: String(tag).toLowerCase(), attrs, children: toChildren(children) }
          }
          case 'text':
            return { text: args.length === 0 || args[0] == null ? ' ' : String(args[0]) }
          case 'static':
            return { nodes: parseHtml(String(args[0])) }
          case 'resolve':
            return { component: String(args[0]) }
          case 'component': {
            const c = args[0]
            if (c?.component && SILENT_COMPONENTS.has(c.component)) return { skip: true }
            throw new Error(`componente desconhecido na página: ${JSON.stringify(c)}`)
          }
          case 'open':
            return { skip: true }
        }
        throw new Error('inalcançável')
      }
      default:
        throw new Error(`expressão não suportada: ${node.type}`)
    }
  }
  const run = (fn, parentScope) => {
    const scope = { parent: parentScope, vars: {} }
    for (const p of fn.params) scope.vars[p] = { done: true, value: undefined }
    for (const st of fn.body) {
      if (st.type === 'decl') for (const d of st.list) scope.vars[d.name] = { init: d.init }
      else if (st.type === 'return') return evaluate(st.value, scope)
      else evaluate(st.value, scope)
    }
    throw new Error('função de render sem return')
  }
  return { evaluate, run, moduleScope }
}

function findRender(node) {
  if (!node || typeof node !== 'object') return null
  if (
    node.type === 'array' &&
    node.items.length === 2 &&
    node.items[0].type === 'lit' &&
    node.items[0].value === 'render' &&
    node.items[1].type === 'function'
  )
    return node.items[1]
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) {
      for (const x of v) {
        const r = findRender(x)
        if (r) return r
      }
    } else if (v && typeof v === 'object') {
      const r = findRender(v)
      if (r) return r
    }
  }
  return null
}

/** Valor JavaScript simples (objectos, listas, literais) de uma expressão. */
function plain(node) {
  if (node.type === 'lit') return node.value
  if (node.type === 'unary' && node.op === '!') return !plain(node.arg)
  if (node.type === 'unary' && node.op === '-') return -plain(node.arg)
  if (node.type === 'array') return node.items.map(plain)
  if (node.type === 'object')
    return Object.fromEntries(node.props.map((p) => [p.key, plain(p.value)]))
  throw new Error(`metadado com expressão ${node.type}`)
}

/**
 * Lê um pedaço de página do VuePress. Devolve a árvore do conteúdo e os
 * metadados: { nodes, meta: { key, path, lang, filePathRelative,
 * updatedTime, headers } }.
 */
export function parseChunk(js) {
  const src = String(js)
  // o módulo dos metadados: «const x={key:"v-…",path:…}»
  const metaAt = src.search(/const [\w$]+=\{key:"v-[0-9a-f]+"/)
  if (metaAt < 0) throw new Error('pedaço sem metadados da página (key/path)')
  const metaParser = new Parser(lex(src, src.indexOf('{', metaAt)))
  const meta = plain(metaParser.primary())
  // o módulo da página: «var H=r(66252);const a=…,…,X=(0,r(83744).Z)(…,[["render",function…]])»
  const head = /var ([\w$]+)=[\w$]+\(\d+\);const /.exec(src)
  if (!head) throw new Error('pedaço sem o módulo da página (var …=r(…);const …)')
  const helperVar = head[1]
  const p = new Parser(lex(src, head.index + head[0].length))
  const decls = p.declarations()
  const scope = { parent: null, vars: {} }
  for (const d of decls) scope.vars[d.name] = { init: d.init }
  let render = null
  for (const d of decls) render ??= findRender(d.init)
  if (!render) throw new Error('pedaço sem função de render')
  const ev = makeEvaluator(scope, helperVar)
  const root = ev.run(render, scope)
  const nodes = toChildren(root)
  const div = nodes.length === 1 && nodes[0].tag === 'div' ? nodes[0].children : nodes
  return {
    nodes: div,
    meta: {
      key: meta.key,
      path: meta.path,
      lang: meta.lang,
      filePathRelative: meta.filePathRelative ?? null,
      updatedTime: meta.git?.updatedTime ?? null,
      headers: meta.headers ?? [],
    },
  }
}

/* ---- árvore → Markdown (formato das fontes do clone) -------------------- */
const textOf = (n) => (n.text != null ? n.text : (n.children ?? []).map(textOf).join(''))
const hasClass = (n, c) => (n.attrs?.class ?? '').split(/\s+/).includes(c)

/** Markdown em linha (dentro de parágrafos, células, cabeçalhos). */
function inline(nodes, ctx = {}) {
  let out = ''
  for (const n of nodes) {
    if (n.text != null) {
      // texto: espaços seguidos de quebras de linha colapsam como no browser
      let t = n.text.replace(/\s*\n\s*/g, ctx.cell ? ' ' : '\n')
      if (ctx.cell) t = t.replace(/\|/g, '\\|')
      out += t
      continue
    }
    switch (n.tag) {
      case 'code':
        out += '`' + textOf(n) + '`'
        break
      case 'em':
      case 'i':
        out += '*' + inline(n.children, ctx) + '*'
        break
      case 'strong':
      case 'b':
        out += '**' + inline(n.children, ctx) + '**'
        break
      case 'br':
        out += ctx.cell ? '<br/>' : '\n'
        break
      case 'a': {
        if (hasClass(n, 'header-anchor')) break
        const label = inline(n.children, ctx)
        const href = n.attrs.href
        // «<wpml:imageFormat>» solto no Markdown: o markdown-it lê-o como
        // ligação automática (esquema «wpml:») e escreve <a href="wpml:…">;
        // volta a ser o texto da fonte
        if (
          href &&
          href === textOf(n) &&
          /^[A-Za-z][\w+.-]*:[^/]/.test(href) &&
          !/^(https?|mailto):/i.test(href)
        )
          out += `<${href}>`
        else out += href ? `[${label}](${href})` : label
        break
      }
      case 'img':
        out += `![${n.attrs.alt ?? ''}](${n.attrs.src ?? ''})`
        break
      case 'sup':
      case 'sub':
      case 'span':
      case 'font':
      case 'u':
      case 'del':
      case 's':
      case 'mark':
      case 'label':
        out += inline(n.children, ctx)
        break
      default:
        // blocos dentro de células (p, ul, li, div): o texto, com quebras
        if (ctx.cell) {
          const inner = inline(n.children, ctx).trim()
          if (!inner) break
          if (/^(p|div|li|ul|ol)$/.test(n.tag))
            out += (out && !out.endsWith('<br/>') ? '<br/>' : '') + inner
          else out += inner
        } else out += inline(n.children, ctx)
    }
  }
  return out
}

function tableRows(table) {
  const rows = []
  const walk = (n) => {
    for (const c of n.children ?? []) {
      if (c.tag === 'tr') rows.push(c.children.filter((x) => x.tag === 'td' || x.tag === 'th'))
      else if (c.tag) walk(c)
    }
  }
  walk(table)
  return rows
}

function block(nodes, out, prefix = '') {
  const push = (s) => out.push(prefix + s)
  for (const n of nodes) {
    if (n.text != null) {
      const t = n.text.trim()
      if (t) push(t)
      continue
    }
    const tag = n.tag
    if (/^h[1-6]$/.test(tag)) {
      push('#'.repeat(Number(tag[1])) + ' ' + inline(n.children).trim())
      push('')
    } else if (tag === 'p') {
      for (const l of inline(n.children).trim().split('\n')) push(l.trim())
      push('')
    } else if (tag === 'ul' || tag === 'ol') {
      let k = 1
      for (const li of n.children.filter((c) => c.tag === 'li')) {
        const mark = tag === 'ol' ? `${k++}. ` : '* '
        const own = li.children.filter((c) => !(c.tag === 'ul' || c.tag === 'ol'))
        const sub = li.children.filter((c) => c.tag === 'ul' || c.tag === 'ol')
        const text = own.some((c) => c.tag === 'p')
          ? own.map((c) => (c.tag === 'p' ? inline(c.children) : inline([c]))).join(' ')
          : inline(own)
        push(mark + text.trim().replace(/\n/g, ' '))
        if (sub.length) block(sub, out, prefix + '  ')
      }
      push('')
    } else if (tag === 'blockquote') {
      const inner = []
      block(n.children, inner)
      while (inner.length && inner[inner.length - 1] === '') inner.pop()
      for (const l of inner) push(l ? '> ' + l : '>')
      push('')
    } else if (tag === 'table') {
      const rows = tableRows(n)
      if (rows.length === 0) continue
      const cell = (c) => ' ' + inline(c.children, { cell: true }).trim() + ' '
      const [first, ...rest] = rows
      push('|' + first.map(cell).join('|') + '|')
      push('|' + first.map(() => ' --- ').join('|') + '|')
      for (const r of rest) push('|' + r.map(cell).join('|') + '|')
      push('')
    } else if (tag === 'pre' || (tag === 'div' && /(^|\s)language-/.test(n.attrs.class ?? ''))) {
      const pre = tag === 'pre' ? n : n.children.find((c) => c.tag === 'pre')
      if (!pre) {
        block(n.children, out, prefix)
        continue
      }
      const lang = /language-([\w-]+)/.exec(pre.attrs.class ?? n.attrs.class ?? '')?.[1] ?? ''
      const code = textOf(pre).replace(/\n$/, '')
      push('```' + lang)
      for (const l of code.split('\n')) push(l)
      push('```')
      push('')
    } else if (tag === 'div' && hasClass(n, 'line-numbers')) {
      continue
    } else if (tag === 'hr') {
      push('---')
      push('')
    } else if (tag === 'div' || tag === 'section' || tag === 'details' || tag === 'tbody') {
      block(n.children, out, prefix)
    } else {
      const t = inline([n]).trim()
      if (t) {
        push(t)
        push('')
      }
    }
  }
}

/** Markdown com a estrutura das fontes do clone, a partir dos nós da página. */
export function toMarkdown(nodes) {
  const out = []
  block(nodes, out)
  // sem linhas em branco repetidas nem no fim
  const lines = []
  for (const l of out)
    if (!(l === '' && lines[lines.length - 1] === '')) lines.push(l.replace(/\s+$/, ''))
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n') + '\n'
}

/**
 * Âncora (id do cabeçalho) de cada linha do Markdown: para cada linha, o id
 * do último cabeçalho acima dela, para referir a secção na página viva.
 */
export function anchorsOf(nodes) {
  const ids = []
  const walk = (list) => {
    for (const n of list) {
      if (n.tag && /^h[1-6]$/.test(n.tag))
        ids.push({ title: inline(n.children).trim(), id: n.attrs.id ?? null })
      else if (n.children && n.tag !== 'table') walk(n.children)
    }
  }
  walk(nodes)
  return ids
}

/** Página viva → { markdown, meta, headings }. */
export function chunkToMarkdown(js) {
  const { nodes, meta } = parseChunk(js)
  return { markdown: toMarkdown(nodes), meta, headings: anchorsOf(nodes) }
}

/* ---- descarga ------------------------------------------------------------ */
export const SITE = 'https://developer.dji.com/doc/cloud-api-tutorial'

/**
 * Descarrega os pedaços das páginas pedidas (caminhos relativos ao site, ex.
 * «/en/api-reference/dji-wpml/common-element.html»). `fetchText` recebe um
 * URL e devolve o texto (por omissão, fetch do Node). Devolve
 * [{ path, url, chunkUrl, js }].
 */
export async function fetchPages(paths, { fetchText = defaultFetch, site = SITE } = {}) {
  const shellUrl = site + paths[0]
  const shell = await fetchText(shellUrl)
  const appSrc = /<script[^>]+src="([^"]*\/app\.[0-9a-f]+\.js)"/.exec(shell)?.[1]
  if (!appSrc) throw new Error(`sem app.*.js na casca ${shellUrl}`)
  const origin = new URL(site).origin
  const app = await fetchText(origin + appSrc)
  const out = []
  for (const path of paths) {
    const esc = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const key = new RegExp(`\\["(v-[0-9a-f]+)","${esc}"`).exec(app)?.[1]
    if (!key) throw new Error(`a página ${path} não consta do mapa de rotas (app.*.js)`)
    const file = new RegExp(`"([^"]*/${key}\\.[0-9a-f]+\\.js)"`).exec(shell)?.[1]
    if (!file) throw new Error(`sem o pedaço ${key} na casca (${path})`)
    const chunkUrl = origin + file
    const js = await fetchText(chunkUrl)
    const { meta } = parseChunk(js)
    if (meta.path !== path) throw new Error(`o pedaço ${key} é de ${meta.path}, não de ${path}`)
    out.push({ path, url: site + path, chunkUrl, js })
  }
  return out
}

async function defaultFetch(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'wpml-spec/1.0' } })
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  return r.text()
}
