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
motor). As áreas estão num terreno genérico; antes de voar, mover a área
para o local real na interface e guardar o projecto com o mesmo nome.

| Código | Missão | O que testa |
|---|---|---|
| R1 | Rectângulo 400 × 250 m, nadir, 80 m, 80/70 %, M3E | caso base: GSD, intervalo, espaçamento, sobreposições, fotos, duração |
| R2 | Polígono em U 600 × 500 m com entalhe, seguimento de terreno (5 m), dupla grelha + passagem nadir, gimbal −60°, 100 m | ligações amostradas no relevo, disparo suspenso nas ligações, marcador do gimbal nadir, alturas relativas |
| R3 | Rectângulo 900 × 700 m a 60 m, faixas a 45°, blocos por bateria (reserva 30 %) | um KMZ por bloco, arranque de cada bloco na base, tempo por bloco vs bateria real |
| L1 | Rectângulo 500 × 300 m, M300 RTK + YellowScan Mapper+, 80 m, 5 m/s, 50 % lateral, fiada de amarração | swath e densidade LiDAR, enum PSDK 65534, fiada perpendicular |

Cada missão voa-se **duas vezes** no mesmo dia (repetibilidade) e, se o
tempo permitir, R1 também com RTK activo.

## 3. Procedimento por missão

1. Na aplicação (versão indicada no cabeçalho), abrir o projecto da
   missão, mover a área para o local, marcar a base no ponto real de
   descolagem, confirmar o preflight sem bloqueios, guardar o projecto
   (`<missão>-projeto.json`) e exportar o KMZ (ou o zip de blocos).
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
node tools/planeado-vs-medido.mjs --projecto R1-projeto.json --fotos R1-fotos.csv \
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
(R3); RTH acima do tecto da rota (todas).

## 5. Matriz de compatibilidade (a preencher)

| Aeronave | Payload | Pilot 2 | Firmware | KMZ aceite | Enums (drone/payload) | Alturas relativas | Grupos de disparo | Blocos | Observações |
|---|---|---|---|---|---|---|---|---|---|
| M3E | Wide RGB | | | | 77/66 | | | | |
| M300 RTK | Mapper+ | | | | 60/65535 | | | | |
| M300 RTK | P1 | | | | 60/50/1 | | | | |

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
| `xmlns:wpml` | 1.0.3 (×81) | 1.0.2 | difere, ver §11 dos métodos |
| `finishAction` | goHome (×80), noAction (×1) | — | não escrito |

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

## 6. Round-trip semântico

Exportar da aplicação → importar no Pilot 2 → exportar do comando (ou
copiar o KMZ guardado) → importar de volta na aplicação. Aceitação: os
waypoints coincidem a menos de 0,5 m, a altitude e a velocidade a menos
de 0,1, e o número de waypoints é igual. A importação está em
`src/utils/importWpml.js`; a comparação faz-se com a ferramenta
planeado-vs-medido sobre o projecto reimportado, ou à mão sobre o KML.

## 7. Resultados

Por preencher com os voos de Setembro de 2026: `docs/validacao/RELATORIO.md`
gerado pelo comando da secção 3, a matriz da secção 5 e os valores
calibrados (tempo de viragem, autonomia por combinação, velocidade em
faixa) com o commit que os aplicou.

## 8. Ensaio a seco

`node tools/ensaio-seco.mjs` gera, para R1 e L1, um voo sintético a partir
do próprio plano (fotos ao longo das faixas, nuvem LAS com densidade
conhecida, registo de voo), corre a medição e a avaliação, e escreve
`docs/validacao/ensaio-seco.md`. Serve para provar que a cadeia inteira
funciona e que um plano voado exactamente como previsto passa nos
critérios; **não é validação**, porque os dados são sintéticos.
