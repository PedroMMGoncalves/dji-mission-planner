# Contribuir

Obrigado pelo interesse. Este documento explica como o projecto se
desenvolve, o que cada verificação garante e o que um contributo precisa
de trazer para ser integrado. O texto está em português europeu
(ortografia anterior ao Acordo de 1990); as mensagens de commit também.

## Antes de começar

- Node 22 e npm 10 (as versões do CI). `npm ci` instala exactamente o
  `package-lock.json`.
- A aplicação é 100 % cliente (Vite + React). Não há servidor nem chaves;
  o relevo global vem do Terrarium/AWS e os mapas de fontes públicas.
- Leia o `README.pt.md` (ou `README.md`) para a arquitectura: o motor de
  planeamento vive em `src/utils/` e `src/mission/` como funções puras; o
  estado por modo vive em `src/hooks/`; `src/App.jsx` só compõe.

## Ciclo de desenvolvimento

```bash
npm run dev            # servidor local
npm run lint           # ESLint (regras react-hooks incluídas)
npm run typecheck      # tsc --checkJs sobre os tipos JSDoc
npm run format:check   # Prettier (npm run format corrige)
npm test               # smoke + E/S + propriedades (Vitest + fast-check)
npm run test:coverage  # smoke sob c8 com limiares (só podem subir)
npm run build          # build de produção em dist/
npm run size           # orçamento de tamanho dos chunks
npm run test:e2e       # E2E em Chromium sobre dist/ (precisa do build)
```

O CI corre tudo isto em cada push. Um commit só está pronto quando estes
comandos passam localmente; um vermelho no `main` custa um ciclo a quem
vier a seguir.

## As camadas de teste e o que cada uma garante

| Camada | Onde | O que apanha |
|---|---|---|
| Smoke + goldens | `smoke-test.mjs`, `tests/golden/` | matemática do planeamento e a estrutura exacta dos ficheiros exportados |
| E/S | `smoke-test-io.mjs` | leitores de KML/GeoJSON/WPML/GeoTIFF, entradas malformadas, ida e volta |
| Propriedades | `tests/unit/*.test.mjs` | invariantes sob entradas aleatórias (corredor, terrain follow, disparo, grelha) e os módulos de `src/mission/` |
| Esquema | `tests/unit/esquema.test.mjs` | o ficheiro de projecto cumpre `public/schema/project-v2.schema.json` |
| E2E | `tests/e2e/` | o percurso do operador no browser e o ficheiro que sairia para o comando |
| Manual | `docs/QA_MANUAL.md` | o que nenhuma das anteriores cobre; uma passagem por release |

Uma alteração intencional à exportação muda os goldens: corra
`npm run test:update-golden`, leia o diff dos ficheiros em `tests/golden/`
e explique-o na mensagem de commit. Um golden que muda sem explicação é
uma regressão até prova em contrário.

## Convenções

- **Mensagens de commit** em português, só ASCII (sem acentos, para ficar
  legível em qualquer terminal e ferramenta), na ortografia anterior ao
  Acordo de 1990. Primeira linha curta no imperativo ou como título;
  corpo com o porquê, o que se verificou e o que muda para o operador.
- **Código**: Prettier decide a forma; ESLint decide o resto. Comentários
  em português, a explicar o porquê (o quê está no código). Sem TypeScript
  no código-fonte: os tipos vão em JSDoc e o `tsc --checkJs` verifica-os.
- **Lógica de missão** entra em `src/utils/` ou `src/mission/` como função
  pura com teste; nunca dentro de um componente ou de um `useMemo`.
- **Textos da interface** entram nos dicionários de `src/i18n/`, sempre
  com PT e EN.
- **Segurança do voo tem prioridade sobre conveniência**: um aviso a mais
  é melhor do que um KMZ que só falha no campo. Tudo o que impede ou
  desaconselha uma exportação passa pelo preflight
  (`src/mission/preflight.js`).

## Perfis de aeronave e payload

Ficam em `src/data/drones.js`. Um perfil novo precisa da fonte dos
valores (ficha técnica, manual) na própria entrada, dos enums WPML quando
conhecidos, e de uma nota no `README` a dizer se foi testado num comando
real. Os enums nunca testados ficam assinalados como tal.

## Ramos e integração

O autor desenvolve directamente em `main`, com cada commit a passar as
verificações. Contributos externos entram por pull request contra `main`;
o CI corre nos pull requests. Um pull request deve ser pequeno, ter teste
e não misturar formatação com comportamento.

## Releases

Subir a versão em `package.json` e acrescentar a secção `## <versão>` no
`CHANGELOG.md` (movendo o que está em "Por publicar") é o gesto que
publica: no push a `main`, o workflow `release.yml` corre as verificações,
cria a etiqueta `v<versão>`, publica a GitHub Release com o zip da build,
o SBOM (CycloneDX) e a atestação de proveniência, e o Zenodo arquiva a
release com um DOI de versão.

## Segurança

Vulnerabilidades: ver `SECURITY.md` se existir; senão, abra um issue
privado ou contacte o autor pelo e-mail do `package.json`. O Dependabot
mantém as dependências e o CodeQL corre em cada push.
