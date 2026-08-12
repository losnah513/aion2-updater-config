# KINOJO 성역 이미지 에셋

성역 카드와 대기자 추천 모달에서 사용하는 배경/보스 이미지는 원본과 용도를 구분해 보관한다.

## 폴더

- `backgrounds/`: 16:9 성역 배경, 1600×900 WebP
- `bosses/`: 1:1 보스 단독 이미지, 1024×1024 WebP
- `rudra/`: 기존 루드라 레이어 에셋(하위 호환용)

## 공식 기준 자료

| 성역 | 보스 | 공식 기준 자료 | 적용 파일 |
| --- | --- | --- | --- |
| 심연의 재련: 루드라 | 루드라 | 기존 KINOJO 분리 원본 `rudra/rudra-bg.png`, `rudra/rudra-boss.png` | `backgrounds/rudra.webp`, `bosses/rudra.webp` |
| 침식의 정화소 | 중합체 바고트 | [AION2 Second Season](https://aion2.plaync.com/ko-kr/conts/260116_update) | `backgrounds/bagot.webp`, `bosses/bagot.webp` |
| 무스펠의 성배 | 지저의 재앙 칼드릭스 | [AION2 Third Season](https://aion2.plaync.com/ko-kr/conts/260331_update) | `backgrounds/kaldrix.webp`, `bosses/kaldrix.webp` |

## 제작 원칙

- 공식 페이지의 보스 외형과 성역 색감·환경 설정만 기준으로 삼는다.
- 공식 페이지에 포함된 문구, 로고, UI, 워터마크는 새 에셋에 포함하지 않는다.
- 배경은 웹 텍스트를 배치할 수 있도록 중앙 일부에 여백을 둔다.
- 보스 이미지는 성역 카드에서 독립적으로 확인할 수 있는 단독 정사각형 이미지로 만든다.
- KINOJO 사용본은 WebP로 리사이즈·압축하고, 생성 원본은 Codex 생성 이미지 보관소에 유지한다.
