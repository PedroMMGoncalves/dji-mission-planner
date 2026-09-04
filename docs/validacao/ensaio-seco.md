# Ensaio a seco da cadeia de validacao (dados sinteticos)

Gerado em 2026-09-04 por tools/relatorio-validacao.mjs.

> DADOS SINTETICOS gerados por tools/ensaio-seco.mjs a partir do proprio plano: prova que a medicao, a avaliacao e o relatorio funcionam, nao que a aeronave voa como previsto. A perna LiDAR (L1e) e L1 com a area reduzida, para a nuvem sintetica caber em memoria; a densidade prevista e a mesma. Os resultados reais entram em docs/validacao/RELATORIO.md com os voos de Setembro de 2026.

## R1: R1-rectangulo-nadir

- Hardware: DJI Mavic 3 Enterprise (M3E) + Wide RGB
- Veredicto: **PASSA** (12 grandezas avaliadas, 0 fora de tolerancia)

| Grandeza | Planeado | Medido | Desvio | Tolerancia | Estado |
|---|---:|---:|---:|---:|:---:|
| Altura AGL (mediana das fotos) | 80 m | 80 m | 0.0 % | +-3 | ok |
| GSD | 2.15 cm/px | 2.15 cm/px | 0.0 % | +-5 % | ok |
| Intervalo entre fotos | 17.05 m | 17.39 m | +2.0 % | +-10 % | ok |
| Sobreposicao frontal | 80 % | 79.60 % | -0.5 % | +-5 | ok |
| Espacamento entre faixas | 34.03 m | 33.85 m | -0.5 % | +-5 % | ok |
| Sobreposicao lateral | 70 % | 70.16 % | +0.2 % | +-5 | ok |
| Faixas | 8 | 8 | 0.0 % | +-0 | ok |
| Fotos | 192 | 192 | 0.0 % | +-5 % | ok |
| Fotos dentro da area | 192 | 184 | -4.2 % | - | n/a |
| Duracao (primeira a ultima foto) | 462 s | 428 s | -7.4 % | +-15 % | ok |
| Duracao do voo (registo) | 462 s | 462 s | -0.1 % | +-15 % | ok |
| Velocidade media em movimento | 8 m/s | 8 m/s | 0.0 % | +-10 % | ok |
| Altura maxima acima da descolagem | 80 m | 80 m | 0.0 % | +-3 | ok |
| Distancia maxima a base | - | 523 m | - | - | n/a |

## L1e: L1-lidar-mapper

- Hardware: DJI Matrice 300 RTK + YellowScan Mapper+ (RTK)
- Veredicto: **PASSA** (5 grandezas avaliadas, 0 fora de tolerancia)

| Grandeza | Planeado | Medido | Desvio | Tolerancia | Estado |
|---|---:|---:|---:|---:|:---:|
| Densidade de pontos (retorno unico) | 425 pts/m2 | 425 pts/m2 | -0.0 % | +-20 % | ok |
| Densidade minima por celula | 425 pts/m2 | 424 pts/m2 | -0.2 % | +-30 % | ok |
| Duracao do voo (registo) | 41.73 s | 41 s | -1.8 % | +-15 % | ok |
| Velocidade media em movimento | 5 m/s | 5 m/s | 0.0 % | +-10 % | ok |
| Altura maxima acima da descolagem | 80 m | 80 m | 0.0 % | +-0.5 | ok |
| Distancia maxima a base | - | 139 m | - | - | n/a |

## Veredicto global

| Missao | Hardware | Avaliadas | Falhas | Veredicto |
|---|---|---:|---:|:---:|
| R1 | DJI Mavic 3 Enterprise (M3E) + Wide RGB | 12 | 0 | passa |
| L1e | DJI Matrice 300 RTK + YellowScan Mapper+ (RTK) | 5 | 0 | passa |

**Todas as missoes dentro dos criterios.**
