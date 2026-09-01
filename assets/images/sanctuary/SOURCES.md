# KINOJO 성역 이미지 에셋

성역 카드와 클립보드 이미지에서 사용하는 배경/보스 이미지는 성역별 운영 폴더에 함께 보관한다.

## 폴더

- `sanctuary-N-boss/`: 성역 번호와 보스 식별자를 고정한 운영 폴더
- `background.webp`: 해당 성역의 16:9 배경
- `boss.webp`: 투명 배경 보스 운영 이미지
- `boss.png`: 투명 배경 보스 원본 보존본(있는 경우)
- `backgrounds/`, `bosses/`, `bosses-v2/`: 캐시된 구 화면을 위한 임시 호환 에셋
- `rudra/`: 기존 루드라 레이어 에셋(하위 호환용)

## 공식 기준 자료

| 성역 | 보스 | 공식 기준 자료 | 적용 파일 |
| --- | --- | --- | --- |
| 심연의 재련: 루드라 | 루드라 | 기존 KINOJO 분리 원본 `rudra/rudra-bg.png`, `rudra/rudra-boss.png` | `sanctuary-1-rudra/background.webp`, `sanctuary-1-rudra/boss.webp` |
| 침식의 정화소 | 중합체 바고트 | [AION2 Second Season](https://aion2.plaync.com/ko-kr/conts/260116_update) | `sanctuary-2-bagot/background.webp`, `sanctuary-2-bagot/boss.webp` |
| 무스펠의 성배 | 지저의 재앙 칼드릭스 | [AION2 Third Season](https://aion2.plaync.com/ko-kr/conts/260331_update) | `sanctuary-3-kaldrix/background.webp`, `sanctuary-3-kaldrix/boss.webp` |
| 비탄의 설원 | 델트라스 | 사용자 제공 원본(2026-09-01) | `sanctuary-4-deltras/background.webp`, `sanctuary-4-deltras/boss.webp` |

## 제작 원칙

- 공식 페이지의 보스 외형과 성역 색감·환경 설정만 기준으로 삼는다.
- 공식 페이지에 포함된 문구, 로고, UI, 워터마크는 새 에셋에 포함하지 않는다.
- 배경은 웹 텍스트를 배치할 수 있도록 중앙 일부에 여백을 둔다.
- 보스 운영 이미지는 배경이 투명한 단독 이미지로 만든다.
- KINOJO 사용본은 WebP로 리사이즈·압축하고, 생성 원본은 Codex 생성 이미지 보관소에 유지한다.
