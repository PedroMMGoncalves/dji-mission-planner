# Protocolo e relatório de validação de campo

Este documento é o que fecha a ciência do planeador: a comparação entre o
que ele prevê e o que a aeronave faz, em missões de referência fixas,
com critérios de aceitação definidos **antes** de voar. A parte
mecânica (missões, previsão, medição, avaliação e relatório) está feita e
ensaiada a seco com dados sintéticos; a secção 7 fica por preencher com
os voos de Setembro de 2026.

## 1. Objectivo

Verificar, com hardware real (DJI Pilot 2 + aeronave + payload), que:

1. os KMZ WPML exportados são aceites e voados tal como planeados (enums,
   alturas relativas, grupos de disparo, blocos, seguimento de terreno);
2. as grandezas previstas (altura AGL, GSD, intervalo e espaçamento,
   sobreposições, número de fotos e faixas, duração, densidade LiDAR)
   coincidem com as medidas dentro das tolerâncias da secção 4;
3. os modelos por calibrar (tempo de viragem, autonomia, velocidade em
   faixa; `docs/METODOS.md` §16) recebem os seus valores.

## 2. Missões de referência

Ficheiros de projecto em `docs/validacao/missoes/`, gerados por
`node tools/missoes-referencia.mjs`, com a previsão do planeador em
`esperado.json` (o diff desse ficheiro é a prova de qualquer mudança no
motor). A previsão vem de `planMissionFromProject`
(`src/mission/planFromProject.js`), o mesmo motor da aplicação, mosaico e
blocos incluídos: por missão, além da pegada, das faixas, das fotos e do
tempo, o número de blocos (`blockCount`), o voo mais longo
(`longestFlightS`) e esse voo em fracção do tempo útil
(`flightUsefulRatio`; acima de 1 não cabe numa bateria). As áreas estão num
terreno genérico; antes de voar, mover a área para o local real na
interface e guardar o projecto com o mesmo nome.

| Código | Missão | O que testa |
|---|---|---|
| R1 | Rectângulo 400 × 250 m, nadir, 80 m, 80/70 %, M3E | caso base: GSD, intervalo, espaçamento, sobreposições, fotos, duração |
| R2 | Polígono em U 600 × 500 m com entalhe, seguimento de terreno (5 m), dupla grelha + passagem nadir, gimbal −60°, 100 m | ligações amostradas no relevo, disparo suspenso nas ligações, marcador do gimbal nadir, alturas relativas |
| R3 | Rectângulo 900 × 700 m a 60 m, faixas a 45°, blocos por bateria (tempo útil por voo da bateria escolhida) | um KMZ por bloco, arranque de cada bloco na base, tempo por bloco vs bateria real |
| L1 | Rectângulo 500 × 300 m, M300 RTK + YellowScan Mapper+, 80 m, 5 m/s, 50 % lateral, fiada de amarração | swath e densidade LiDAR, enum PSDK 65535 (o que o comando escreve), fiada perpendicular |

Cada missão voa-se **duas vezes** no mesmo dia (repetibilidade) e, se o
tempo permitir, R1 também com RTK activo.

## 3. Procedimento por missão

1. Na aplicação (versão indicada no cabeçalho), abrir o projecto da
   missão, mover a área para o local, marcar a base no ponto real de
   descolagem, confirmar o preflight sem bloqueios, guardar o projecto
   (`<missão>-projecto.json`) e exportar o KMZ (ou o zip de blocos).
2. Importar no Pilot 2 e registar na matriz (secção 5): versão do Pilot 2,
   firmware da aeronave, aceitação do ficheiro, avisos do comando.
3. Voar sem alterar nada no comando; anotar vento, temperatura, baterias
   usadas e qualquer intervenção manual.
4. Recolher: as fotos (JPEG originais), o registo de voo (CSV do Airdata
   ou exportação do DJI Flight Log), a nuvem LAS (LiDAR) e, se possível,
   o KMZ tal como o comando o guardou (round-trip, secção 6).
5. Medir:

```bash
exiftool -csv -n -GPSLatitude -GPSLongitude -GPSAltitude -RelativeAltitude \
  -DateTimeOriginal -SubSecTimeOriginal -FocalLength -ImageWidth \
  -GimbalPitchDegree -ImageSource fotos/*.JPG > R1-fotos.csv
node tools/planeado-vs-medido.mjs --projecto R1-projecto.json --fotos R1-fotos.csv \
  --log R1-voo.csv --json R1-rel.json --md R1-rel.md
# LiDAR: acrescentar --las nuvem.las --crs EPSG:3763
```

No M4T cada disparo escreve dois ficheiros com as mesmas coordenadas e o
mesmo instante (`_V` grande-angular, `_T` térmica); a ferramenta usa o
`ImageSource` do XMP para ficar só com a câmara do payload planeado e
indica quantas fotos da outra pôs de parte. Sem esse campo as fotos
ficariam duplicadas e o intervalo medido sairia a metade.

6. Avaliar e juntar ao relatório:

```bash
node tools/relatorio-validacao.mjs --saida docs/validacao/RELATORIO.md \
  R1=R1-rel.json R2=R2-rel.json R3=R3-rel.json L1=L1-rel.json
```

O comando sai com código 1 se alguma grandeza ficar fora de tolerância.

## 4. Critérios de aceitação

Definidos em `tools/lib/criterios.mjs`; basta cumprir uma das colunas
quando existem as duas.

| Grandeza | Absoluto | Relativo | Justificação |
|---|---|---|---|
| Altura AGL (mediana das fotos) | ±3 m GNSS · ±0,5 m RTK | — | fichas DJI (pairagem) com margem para o voo |
| GSD | — | ±5 % | segue da AGL; o processamento tolera mais |
| Intervalo entre fotos | — | ±10 % | disparo por distância do comando |
| Sobreposição frontal | ±5 pontos | — | mínimo habitual 60 %, pedido 80 % |
| Espaçamento entre faixas | — | ±5 % | guiamento GNSS/RTK |
| Sobreposição lateral | ±5 pontos | — | mínimo habitual 50 %, pedido 70 % |
| Faixas | 0 | — | a rota é a planeada |
| Fotos | — | ±5 % | fotos nas ligações curtas contam |
| Duração | — | ±15 % | modelo de tempo por calibrar (viragens) |
| Densidade de pontos | — | ±20 % | PRR de retorno único é conservadora |
| Densidade mínima por célula | — | ±30 % | bordas do padrão de varrimento |
| Velocidade média | — | ±10 % | velocidade efectiva em faixa |
| Altura máxima (registo) | ±3 m GNSS · ±0,5 m RTK | — | como a AGL |

Além da tabela, por inspecção do KMZ e do voo: folga ao solo ao longo de
toda a rota ≥ AGL − tolerância − 3 m (R2); um grupo de disparo por
intervalo, sem fotos nas ligações longas (R2); cada bloco arranca da base
(R3); RTH acima do tecto da rota (todas). Com foto por waypoint e
«Paragem nos waypoints: Só nos cantos», o número de fotos tem de ser igual
ao de pontos de foto do plano, e o drone só pára nos cantos das faixas:
é essa verificação que retira o aviso de preflight da foto sem paragem.

## 5. Matriz de compatibilidade (a preencher)

| Aeronave | Payload | Pilot 2 | Firmware | KMZ aceite | Enums (drone/payload) | Alturas relativas | Grupos de disparo | Blocos | Observações |
|---|---|---|---|---|---|---|---|---|---|
| M3E | Wide RGB | 9.2.0.26 | 02.01.0322 | sim (2026-09) | 77/66 | | foto por waypoint dispara, mas pára em cada ponto | | 1.º voo: sem `distance`/`duration` no waylines, o comando mostrou 100 % e 00:00 a meio (corrigido) |
| M4T | grande-angular | (a registar) | (a registar) | sim (2026-10) | 99/1/89 | | disparo por distância com `actionGroupMode` `parallel`: fotos **só nos waypoints** (cantos das faixas). Corrigido para `sequence`; por voar | | 2.º voo real; enums do M4T confirmados num comando real |
| M4T | térmica (IR) | | | por importar | 99/1/89 | | | | por voar: os enums são os da grande-angular (aceites em 2026-10), mas a lente `ir` (`imageFormat` e `payloadLensIndex`) nunca foi importada; falta confirmar que as fotos saem da térmica (`ImageSource` `InfraredCamera`) |
| M300 RTK | Mapper+ | | | por importar | 60/65535/0 | | | | por importar e voar: enums tirados de ficheiros escritos pelo Pilot 2 (§5.1), fora da tabela de suporte do Cloud API; procedimento e alternativa em §5.4, suporte em §5.2, namespace em §5.3 |
| M300 RTK | P1 | | | por importar | 60/50/1 | | | | por importar e voar: como o Mapper+ (§5.4) |

### 5.1 O que os ficheiros do comando já provam

Levantamento de 81 KMZ WPML exportados pelo DJI Pilot 2 num M300 RTK
entre 2023-07 e 2026-07 (arquivo do LNEG). São ficheiros **escritos pelo
comando**, não importados a partir desta aplicação: provam o que o
Pilot 2 escreve, não o que aceita. A coluna «KMZ aceite» da matriz acima
continua por preencher e só um voo a fecha.

| Campo | Pilot 2 real (81 KMZ) | O que exportamos | |
|---|---|---|---|
| `droneEnumValue` | 60/0 (×81) | 60/0 | igual |
| `payloadEnumValue` PSDK | 65535/0 (×66) | 65535/0 | corrigido a partir daqui |
| `payloadEnumValue` P1 | 50/1 (×15) | 50/1 | corrigido a partir daqui |
| `waypointHeadingMode` | followWayline (6447/6447) | followWayline | igual |
| `heightMode` | relativeToStartPoint (EGM96) | relativeToStartPoint | subconjunto |
| `templateType` | mapping2d (×81) | waypoint | por desenho |
| `xmlns:wpml` | 1.0.3 (×81) | 1.0.2 por omissão; 1.0.3 ou 1.0.6 à escolha | difere, ver §11 dos métodos e §5.3 |
| `finishAction` | goHome (×80), noAction (×1) | goHome por omissão; escolha no painel | igual |
| `distance` / `duration` (waylines) | escritos (×81) | escritos | corrigido a partir daqui |

Duas verificações independentes do motor saíram do mesmo corpus, e estão
aplicadas no código:

- **Geodesia**: somando a rota de cada missão com a mesma função do motor
  e comparando com o `wpml:distance` do ficheiro, o desvio mediano é
  0,00 % em rotas de 859 m a 36,9 km e de 12 a 372 waypoints.
- **Comprimento 3D e custo de viragem**: ver §16 dos métodos. O
  desvio residual só aparecia nas missões com modelo de terreno
  embarcado, e era a componente vertical que faltava somar.

Nove missões do corpus são oblíquas (`smartObliqueEnable`), com 13 a
110 s por faixa de sobrecusto de rotação de gimbal. **Não é o mesmo
regime das nossas missões oblíquas**: o Pilot 2 roda o gimbal a cada
ponto de disparo, enquanto a nossa exportação fixa o gimbal uma vez no
waypoint 0 (mais um marcador quando a dupla grelha leva passagem nadir).
Por isso não há aviso de preflight para gimbal oblíquo — seria um falso
alarme; fica registado em §16 dos métodos como limite conhecido, e
importar uma missão de oblíqua inteligente do comando dará sempre um
tempo muito abaixo do real.

### 5.2 Posição do payload no M300 (por fazer)

A exportação escreve a posição escolhida em «Posição do payload» (0
inferior esquerdo, 1 inferior direito, 2 superior; METODOS §11) no
`payloadInfo` e em cada acção de câmara e de gimbal dos dois ficheiros.
Falta saber, e registar aqui:

1. Que `payloadPositionIndex` escrevem os 81 KMZ do M300 (§5.1), por
   payload (P1, PSDK), e se algum é diferente de 0 — o levantamento do
   corpus registou os enums, não a posição.
2. Em que suporte estão montados, de facto, a P1 e o Mapper+ do LNEG.
3. Exportar uma missão M300 com a posição do suporte real e outra com uma
   posição diferente de 0 (o mesmo plano), importar as duas no Pilot 2 e
   registar se abrem, se o editor mostra o payload certo e, em voo ou em
   simulação, se o gimbal e as fotos vão para o payload montado.

Até lá a posição 0 é a única escrita por todas as versões anteriores, e
nenhuma posição diferente de 0 foi importada num comando.

### 5.3 Versão do WPML no M300 e no M4T (por fazer)

A exportação declara `wpmz/1.0.2` por omissão (a da especificação; aceite
no M3E em 2026-09 e no M4T em 2026-10); os 81 KMZ do M300 escritos pelo
Pilot 2 declaram `1.0.3`, e os ficheiros reais do Matrice 4 `1.0.6`.
«Versão do WPML», ao lado das acções de segurança, muda só o namespace dos
dois ficheiros (os elementos ficam os da 1.0.2). Procedimento, no M300 RTK
e depois no M4T:

1. Exportar dois KMZ do mesmo plano, iguais salvo a versão: um com 1.0.2
   e outro com 1.0.3 (no M4T, também um com 1.0.6). Confirmar, abrindo os
   dois, que só a linha do `xmlns:wpml` difere.
2. Importar os dois no Pilot 2. Registar, para cada um: aceite ou
   recusado, os avisos que o comando mostrar, se a missão abre no editor
   e se voa (ou, sem voo, se o editor mostra os waypoints, as alturas e as
   acções).
3. Registar se o firmware actual exige algum elemento que só a 1.0.3 (ou
   a 1.0.6) tenha.
4. Registar as versões do Pilot 2 e do firmware da aeronave e do comando.

Resultado: por registar. Até lá a 1.0.2 continua a de omissão em todas as
aeronaves.

### 5.4 P1 e Mapper+ no M300: enums fora da tabela do Cloud API (por fazer)

**A limitação.** A página de suporte de produtos do Cloud API da DJI
(versão viva, 2026-11) lista para o M300 RTK só os payloads
H20/H20T/H20N/H30/H30T e diz «Can't support third-party payload now»; a
tabela de câmaras não tem a Zenmuse P1 nem nenhum payload PSDK. Os enums
que exportamos — P1 `50/1`, Mapper+ `65535/0` — vêm dos 81 KMZ escritos
pelo Pilot 2 neste M300 (§5.1): provam o que o comando **escreve**, não
que **aceite importar** um KMZ com eles, nem que reconheça o payload. Nenhum
KMZ desta aplicação com a P1 ou o Mapper+ foi ainda importado num comando;
o preflight di-lo nessas duas combinações. Há ainda um gerador de campo
público (M300 e M350 com a P1, só `template.kml`) que escreve `50/0` com o
namespace `wpmz/1.0.4`, o que não bate com os `50/1` dos 81 ficheiros; o
ficheiro não diz se o comando o aceitou.

**Procedimento**, no M300 RTK do LNEG, com o payload montado:

1. Exportar da aplicação o mesmo plano (área pequena, sem seguimento de
   terreno) com a P1 e com o Mapper+, cada um com a «Posição do payload» do
   suporte onde está montado (§5.2) e a versão do WPML de omissão.
2. Importar cada KMZ no Pilot 2 e registar: aceite ou recusado (com o texto
   do aviso), se a missão abre no editor, se o editor mostra o payload certo
   e, em voo ou em simulação, se as acções vão para o payload montado (a P1
   fotografa; o Mapper+ não recebe acções de câmara).
3. No mesmo comando, criar no Pilot 2 uma missão para o mesmo payload e
   exportá-la; comparar com o nosso KMZ os `payloadEnumValue` e
   `payloadSubEnumValue`, o `payloadPositionIndex`, o `xmlns:wpml` e o
   `payloadParam` do template (e o que mais um só dos dois tiver).
4. Registar as versões do Pilot 2, do firmware da aeronave e do comando e,
   no Mapper+, do firmware do payload.

**Alternativa, se o comando recusar o ficheiro ou não reconhecer o
payload.** Uma mudança de cada vez, pela ordem abaixo, registando cada
tentativa na tabela; nenhuma exige mexer no código.

| # | Tentativa | Evidência | Como, na interface |
|---|---|---|---|
| 1 | namespace `1.0.3` | os 81 KMZ do Pilot 2 neste M300 declaram 1.0.3 (§5.1, §5.3) | «Versão do WPML», ao lado das acções de segurança |
| 2 | o suporte real, se o payload não for reconhecido | o `payloadPositionIndex` endereça o payload em cada acção (§5.2) | «Posição do payload», no cartão 1 |
| 3 | P1 com `50/0` | o gerador de campo público acima; era o valor das versões antigas da aplicação | payload «Personalizado / LiDAR», sensor câmara com a óptica da P1 (35,9 × 24,0 mm, 35 mm, 8192 px) e, na gaveta do cartão 1, «Enums WPML (avançado)» `payloadEnumValue` 50 |
| 4 | Mapper+ com `65534/0` | «PSDK Payload Device» na tabela do `payloadEnumValue` do clone de 2024 da documentação (`tests/spec/wpml-spec.json`); a página viva já não o lista | payload «Personalizado / LiDAR», sensor LiDAR com FOV 70,4°, `payloadEnumValue` 65534 |
| 5 | planear no comando | o Pilot 2 escreve os enums que ele próprio reconhece | «Exportar KML da área» (ou o ZIP dos KML por bloco) e criar a missão de mapeamento no Pilot 2 |

O que a interface deixa e não deixa fazer:

- O `payloadEnumValue` só se edita com o payload «Personalizado / LiDAR»;
  os da P1 e do Mapper+ do catálogo são fixos. O `droneEnumValue` só se
  edita com a aeronave «Personalizada»; no M300 fica o 60.
- O `payloadSubEnumValue` não se edita: o payload personalizado escreve
  sempre 0. Chega para as tentativas 3 e 4 (`50/0`, `65534/0`); um
  sub-enum diferente de 0 com outro enum não é alcançável sem código, e
  nenhum ficheiro real ou página da DJI o sugere.
- Com o payload personalizado perde-se o que o perfil do catálogo traz: na
  P1, o pitch até −120° (o personalizado recorta a [−90°, 30°]); no
  Mapper+, a densidade de pontos (PRR) e o aviso do tecto de 100 m acima do
  solo — confira-os à mão. O sensor e os enums ficam no projecto.
- O namespace `1.0.4` do gerador de campo não está entre as versões da
  lista (1.0.2, 1.0.3, 1.0.6); experimentá-lo exige código.
- A tentativa 5 perde o que o planeamento da aplicação faz e o Pilot 2 não
  (seguimento de terreno pela rota, disparo suspenso nas ligações, blocos
  com base); é o recurso para voar no dia, não a correcção.

| Payload | Tentativa | Pilot 2 | Firmware | Aceite | Payload reconhecido | Observações |
|---|---|---|---|---|---|---|
| P1 | `50/1`, 1.0.2 (a exportação) | | | | | por registar |
| Mapper+ | `65535/0`, 1.0.2 (a exportação) | | | | | por registar |

Resultado: por registar. Se uma alternativa for a aceite, os enums do
catálogo (`src/data/drones.js`) mudam num commit à parte, com esta tabela
como evidência.

## 6. Round-trip semântico

Exportar da aplicação → importar no Pilot 2 → exportar do comando (ou
copiar o KMZ guardado) → importar de volta na aplicação. Aceitação: os
waypoints coincidem a menos de 0,5 m, a altitude e a velocidade a menos
de 0,1, e o número de waypoints é igual. A importação está em
`src/utils/importWpml.js`; a comparação faz-se com a ferramenta
planeado-vs-medido sobre o projecto reimportado, ou à mão sobre o KML.

**Rumos e gimbal na reedição (por fazer no comando).** O `template.kml`
leva os mesmos rumos e grupos de acções do `waylines.wpml` (METODOS §11;
fixado nos testes, nunca verificado num comando). Num KMZ de fachada e
noutro de órbita: (1) abrir no editor do Pilot 2 e registar, por waypoint,
o modo de rumo e o ângulo mostrados, e o pitch do gimbal (o template usa
`gimbalPitchMode` `manual` e o pitch vai nos `gimbalRotate`: o campo de
pitch do ponto pode ficar vazio); (2) gravar sem alterar, exportar do
comando e comparar o `waylines.wpml` com o original (rumos, `gimbalRotate`,
`takePhoto`, `startRecord`/`stopRecord`); (3) repetir depois de uma edição
nula (mover um ponto e voltar a pô-lo). Aceitação: os rumos e as acções de
cada waypoint coincidem com o original.

## 7. Resultados

Por preencher com os voos de Setembro de 2026: `docs/validacao/RELATORIO.md`
gerado pelo comando da secção 3, a matriz da secção 5 e os valores
calibrados (tempo de viragem, autonomia por combinação, velocidade em
faixa) com o commit que os aplicou.

## 7.1 Conformidade automática com a especificação

Desde Outubro de 2026, `npm run test:unit` valida cada ficheiro gerado
contra o dicionário da especificação (`tests/spec/wpml-spec.json`; ver
METODOS §11.2): o que a app escreve fora das tabelas da DJI está na lista
de excepções do validador com a prova respectiva. A matriz da secção 5
continua a ser a única prova de que o comando aceita e voa o ficheiro.

Elementos novos de Outubro de 2026, confrontados com a documentação WPML
da DJI (`dji-sdk/cloud-api-doc`, através do dicionário) e ainda **por
confirmar em voo**:

| Elemento | O que a app escreve | Documentação DJI | Por confirmar no comando |
|---|---|---|---|
| `hover` / `hoverTime` | espera antes do disparo na face e nos pontos de inspecção, depois do `gimbalRotate` | common-element.md, l. 178: `hoverTime` float > 0 s, obrigatório, todas as aeronaves; sem exemplo (excepção de ordem com a prova) | que a aeronave pára o tempo escrito antes da foto |
| `waypointHeadingMode` `smoothTransition` com o mesmo ângulo em todos os waypoints | rumo fixo na grelha da área | common-element.md, l. 42: enum com `fixed` e `smoothTransition`; o ângulo só é obrigatório em `smoothTransition` | que o rumo se mantém nas viragens entre faixas e na passagem por grupos de disparo |
| `takeOffSecurityHeight` escrito pelo piloto | 1,2 a 1500 m | template-kml.md l. 161, waylines-wpml.md l. 133: [1,2; 1500] m | que o comando aceita valores diferentes de 30 m |
| `globalRTHHeight` escrito pelo piloto | 20 a 1500 m (recorte da app; a fronteira recusa fora de [2, 1500]) | páginas vivas de template-kml e waylines-wpml (2026-11), EN e CN: [2, 1500] m (o clone de 2024 não dava intervalo) | que o comando usa o valor do ficheiro e o seu próprio limite |
| lente do M4T: `imageFormat` e `payloadLensIndex` `visable` (grande-angular) e `ir` (térmica) | o mesmo valor no `payloadParam` do template e em cada `takePhoto`/`startRecord` dos dois ficheiros | página viva do common-element (2026-11): `payloadLensIndex` lista `visable`, «M4D/M4TD only supports visable and ir»; a tabela do `imageFormat` diz `visible`, mas os ficheiros reais do Matrice 4 escritos pelo Pilot 2 (M4E e M4T) escrevem `visable` nos dois campos. O voo de Outubro foi anterior à lente por acção (B2) e não prova o valor | que a grande-angular sai só com `_V` e a térmica só com `_T` (contar os dois sufixos em cada voo); que `visable` com o zoom no máximo não fotografa com a tele |
| `actionTriggerParam` com segundos escritos | intervalo manual em «Tempo» | common-element.md, l. 77: float > 0, «s or m» | que o disparo por tempo segue o valor (contar fotos) |
| vários KMZ por corredor | corredor partido em voos | sem elemento próprio (`mappingStrip/cuttingDistance` é do mapeamento) | que cada KMZ do ZIP se importa e voa como um corredor normal |
| `gimbalEvenlyRotate` com gatilho `betweenAdjacentPoints` | vídeo da órbita: um grupo por troço (`i`–`i+1`), ao ângulo do ponto seguinte | common-element.md, l. 76, 84 e 156–163: «The trigger must be betweenAdjacentPoints»; M300/M350, M30, M3E/M3T/M3M, M3D (o M4T não está na tabela, nem nenhuma acção) | que o gimbal roda sem degraus durante a gravação, também no M4T |
| vários `gimbalRotate` + `takePhoto` no mesmo grupo | várias inclinações com paragem (órbita e face) | common-element.md: grupo em `sequence`, acções executadas por ordem | que cada foto sai com a sua inclinação e com a aeronave parada |

## 8. Ensaio a seco

`node tools/ensaio-seco.mjs` gera, para R1 e L1, um voo sintético a partir
do próprio plano (fotos ao longo das faixas, nuvem LAS com densidade
conhecida, registo de voo), corre a medição e a avaliação, e escreve
`docs/validacao/ensaio-seco.md`. Serve para provar que a cadeia inteira
funciona e que um plano voado exactamente como previsto passa nos
critérios; **não é validação**, porque os dados são sintéticos.
