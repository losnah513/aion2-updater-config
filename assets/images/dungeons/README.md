# Expedition & Transcendence Boss Assets

원정·초월 던전의 마지막 3보스만 분리한 KINOJO 웹용 에셋입니다.

## 폴더

- `expedition/bosses-v1`: 원정 12종
- `transcendence/bosses-v1`: 초월 6종
- `preview`: 어두운 배경·밝은 배경 전체 검수 이미지
- `process_chroma_master.py`: 재구성 마스터의 작업 배경을 알파로 변환하는 재현용 스크립트

각 보스는 다음 두 형식으로 제공합니다.

- PNG: 1254 × 1254, RGBA, 고해상도 마스터
- WebP: 1080 × 1080, RGBA, 웹 표시용

## 제작 기준

- 원본: Google Drive `던전별 보스 이미지 정리` 폴더의 던전별 3보스 JPG
- 게임 UI, 문구, 메뉴, 배경과 지면은 제외
- 보스의 실루엣·비율·대표 자세와 색 관계 유지
- 비늘, 깃털, 털, 천, 금속 마모, 석질 균열, 결정질과 발광 표면의 고주파 질감 유지
- 표면을 매끈하게 미화하거나 플라스틱처럼 단순화하지 않음
- 작업용 단색 배경만 알파로 변환하고 보스 내부의 비슷한 색은 유지
- 밝은 배경과 어두운 배경에서 외곽 번짐을 함께 확인

## 원정 파일명

| 던전 | 파일명 |
| --- | --- |
| 바크론의 공중섬 | `bakron-floating-island` |
| 푸른 숨의 섬 | `blue-breath-island` |
| 환영의 회랑 | `corridor-of-illusion` |
| 잠식된 데우스 연구기지 | `corrupted-deus-research-base` |
| 무의 요람 | `cradle-of-nothingness` |
| 죽은 드라마타의 둥지 | `dead-dramata-nest` |
| 드라웁니르 | `draupnir` |
| 타락한 데바의 성 | `fallen-daeva-castle` |
| 불의 신전 | `fire-temple` |
| 크라오 동굴 | `krao-cave` |
| 사나운 뿔 암굴 | `savage-horn-cavern` |
| 우루구구 협곡 | `urugugu-canyon` |

## 초월 파일명

| 던전 | 파일명 |
| --- | --- |
| 심연의 뿔 암굴 | `abyssal-horn-cavern` |
| 데우스 연구기지 | `deus-research-base` |
| 노이란의 숨겨진 유산 | `noiran-hidden-legacy` |
| 붉은 연심의 거울 | `red-lotus-mirror` |
| 조각난 아르카니스 | `shattered-arcanis` |
| 가라앉은 생명의 신전 | `sunken-temple-of-life` |

원본 JPG는 기존 Drive 원본 폴더를 기준으로 하며 이 GitHub 에셋 폴더에는 중복 저장하지 않습니다.
