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
  estado por modo vive em `src/hooks/`, tal como o que liga os modos
  (aeronave e bateria, bases, rota activa, verificações de segurança e
  preflight, fichas de campo); `src/App.jsx` só compõe, e o cabeçalho, a
  área do mapa e as janelas são componentes (`AppHeader`, `MapPane`,
  `AppOverlays`). O resultado de cada hook tem nome no App (`hw`, `area`,
  `corridor`…) e passa inteiro aos painéis e aos hooks que o usam, que o
  desmontam nas primeiras linhas: um valor novo de um hook chega a um
  painel sem tocar no App. Nunca ponha um destes objectos numa lista de
  dependências (são novos em cada render): desmonte primeiro.

## Ciclo de desenvolvimento

```bash
npm run dev            # servidor local
npm run lint           # ESLint (regras react-hooks incluídas)
npm run typecheck      # tsc --checkJs sobre toda a src/ (tipos JSDoc, React e Vite)
npm run format:check   # Prettier (npm run format corrige)
npm test               # smoke + E/S + propriedades (Vitest + fast-check)
npm run test:coverage  # as três suites sob c8 com limiares (só podem subir)
npm run test:perf      # unitários com as asserções de tempo a valer (PERF=1)
npm run build          # build de produção em dist/
npm run size           # orçamento de tamanho dos chunks
npm run test:e2e       # E2E em Chromium sobre dist/ (precisa do build)
```

O CI corre tudo isto em cada push. Um commit só está pronto quando estes
comandos passam localmente; um vermelho no `main` custa um ciclo a quem
vier a seguir. O site (`deploy.yml`) e a release (`release.yml`) só se
publicam depois de o workflow `CI` ficar verde nesse commit
(`workflow_run`): um push vermelho não chega ao ar.

Os testes por propriedades correm com uma semente fixa (20261019;
`FC_SEED=<n> npm run test:unit` escolhe outra) e as asserções de tempo só
falham com `PERF=1` — no portão registam-se. O workflow `Nocturno` corre
de madrugada os unitários com uma semente aleatória e os tempos a valer;
um contra-exemplo que apareça aí passa a teste fixo.

Na cobertura o vitest carrega `src/utils`, `src/mission`, `src/data` e
`src/i18n` no Node tal como estão, como o smoke, e não transformados pelo
Vite (`vitest.config.js`, só sob o c8): o c8 não tem o mapa de fonte do
código transformado e um ficheiro em duas versões saía mal medido. Assim
o limiar mede a união exacta das três suites, linha a linha, função a
função e ramo a ramo.

## As camadas de teste e o que cada uma garante

| Camada | Onde | O que apanha |
|---|---|---|
| Smoke + goldens | `smoke-test.mjs`, `tests/golden/` | matemática do planeamento e a estrutura exacta dos ficheiros exportados |
| E/S | `smoke-test-io.mjs` | leitores de KML/GeoJSON/WPML/GeoTIFF, entradas malformadas, ida e volta |
| Propriedades | `tests/unit/*.test.mjs` | invariantes sob entradas aleatórias (corredor, terrain follow, disparo, grelha) e os módulos de `src/mission/` |
| Esquema | `tests/unit/esquema.test.mjs` | o ficheiro de projecto cumpre `public/schema/project-v2.schema.json` |
| Ficheiros reais | `tests/fixtures/`, `tests/unit/ficheiros-reais.test.mjs` | KML do Google Earth, GeoJSON e shapefile do QGIS (CRS84 e PT-TM06), MDT em PT-TM06 e projectos das versões 1.0.1, 1.3.0 e 1.4.2 lidos pelas funções da interface; `node tests/lib/fixtures-reais.mjs` regenera-os byte a byte |
| Dicionários | `tests/unit/i18n.test.mjs` | cada `t('chave')` do código existe, PT e EN com as mesmas variáveis, sem chaves repetidas; os códigos do preflight têm texto |
| E2E | `tests/e2e/` | o percurso do operador no browser e o ficheiro que sairia para o comando |
| Impressões digitais | `tests/e2e/impressoes.mjs`, `tests/e2e/impressoes.json` | um projecto fixo por modo exportado pela interface: o resumo de cada ficheiro (sem datas, números a 5 casas) e o texto do preflight, das métricas, das bases e dos blocos têm de sair iguais aos de referência; uma mudança de sítio no `App.jsx` que altere o comportamento muda uma impressão |
| Manual | `docs/QA_MANUAL.md` | o que nenhuma das anteriores cobre; uma passagem por release |

Uma alteração intencional ao que a interface mostra ou exporta muda as
impressões digitais: corra `E2E_IMPRESSOES=gravar npm run test:e2e` (ou só
os cenários `impressao-*` com `E2E_ONLY`), leia o diff de
`tests/e2e/impressoes.json` e explique-o na mensagem de commit.

O `npm run test:coverage` só mede `src/utils/` e `src/mission/`; o código
do ecrã (componentes, hooks e `App.jsx`) só corre no browser e mede-se com
o E2E, à parte e só em relatório (sem limiar, fora da cadeia e do CI):

```bash
npm run test:e2e:cobertura   # build com mapas de fontes + E2E com E2E_COBERTURA=1
```

O script faz a build com mapas de fontes em `tests/e2e/out/build-cobertura/`
(o `dist/` não muda) e corre o E2E sobre ela; cada página que os cenários
abrem recolhe a cobertura JS do Chromium, convertida no fim para os
ficheiros de `src/` (`tests/e2e/cobertura.mjs`). O relatório fica em
`tests/e2e/out/cobertura/`: `resumo.txt` (componentes, hooks e `App.jsx`, e
`mission` e `utils` para comparação), `tabela.txt` (por ficheiro, da menor
cobertura de linhas para a maior), `html/index.html` e `lcov.info`.
`E2E_ONLY`, `E2E_PORT` e `E2E_CHROMIUM` valem como no `npm run test:e2e`;
sem `E2E_COBERTURA` o E2E é o de sempre. Leva cerca de 40 % mais tempo
(12,5 min para 9 numa máquina de 4 núcleos): com a cobertura o JS da página
corre mais devagar e as pausas fixas dos cenários duplicam, e a conversão
soma meio minuto. As linhas contam-se como no c8: só fica por cobrir a linha
que um bloco nunca corrido ocupa inteira, e as que ficam fora de funções
contam como cobertas. As funções e os ramos dizem mais do que a percentagem
de linhas, e uma função anónima (o corpo de um `useCallback`, uma seta num
`map`) conta como função.

Uma alteração intencional à exportação muda os goldens: corra
`npm run test:update-golden`, leia o diff dos ficheiros em `tests/golden/`
e explique-o na mensagem de commit. Um golden que muda sem explicação é
uma regressão até prova em contrário. Comece pelo
`<cenário>.resumo.json` de cada golden (waypoints, distância, duração,
elementos por nome, acções e gatilhos): diz em meia página o que o diff
dos ficheiros inteiros diz em milhares de linhas.

A matriz modos × aeronaves (`tests/lib/wpml-matriz.mjs`) é a cobertura da
conformidade WPML: um modo, uma aeronave ou um caminho de exportação novo
(um parâmetro de `buildAreaExport`, por exemplo) entra ali, e o E2E valida
cada KMZ que lê (`tests/e2e/kmz.mjs`). O plano que a ferramenta
planeado-vs-medido e as missões de referência usam é
`planMissionFromProject` (`src/mission/planFromProject.js`), o mesmo motor
da aplicação; depois de mudar o motor, `node tools/missoes-referencia.mjs`
regenera `docs/validacao/missoes/esperado.json` e o diff é a prova.

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
publica: no push a `main`, depois de o CI ficar verde nesse commit, o
workflow `release.yml` corre as verificações,
cria a etiqueta `v<versão>`, publica a GitHub Release com o zip da build,
o SBOM (CycloneDX) e a atestação de proveniência, e o Zenodo arquiva a
release com um DOI de versão.

## Segurança

Vulnerabilidades: ver `SECURITY.md` se existir; senão, abra um issue
privado ou contacte o autor pelo e-mail do `package.json`. O Dependabot
mantém as dependências e o CodeQL corre em cada push.
