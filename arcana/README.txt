Arcana Skill Simulator
Version: ARC-0.1.00

개요
- GitHub Pages의 arcana/index.html에서 Apps Script WebApp API를 호출하는 구조입니다.
- 목표 스킬 목록은 클래스별 스킬 DB 시트의 액티브 스킬 목록을 우선 사용합니다.
- 검성 기준 스킬 DB 시트명은 skill_db_gladiator를 권장하며, 기존 오타 가능성인 skill_db_gladiatior도 임시 지원합니다.
- 클래스 시트 구조: A2=액티브, A3:A=액티브 스킬 / B2=패시브, B3:B=패시브 스킬.
- DB 시트의 명명된 범위(성배/양피지/나침반/천칭)는 아르카나 카드별 슬롯 드롭다운에 사용합니다.

API 연결
- arcana/js/config.js에서 Apps Script WebApp URL을 관리합니다.
- 현재 API URL:
  https://script.google.com/macros/s/AKfycbzVPXd24oZaoQAhnOBqlTJ_1WE2vghrok4153AdnjIQaKF3S4gRAHTEBcJSbtJS_w/exec

계산 기준
- 최종 스킬 레벨 = 보유 카드 레벨 + 추천 카드 레벨 + 데바니온 보너스 4
- 목표 레벨 = 20
- 카드 하나의 총 레벨 = 최대 5
- 슬롯 하나의 스킬 레벨 = 최대 4
- 한 카드 안 같은 스킬 중복 불가

디자인 기준
- KINOJO 웹페이지 톤에 맞춰 올 화이트 기반으로 구성합니다.
- 모서리 둥글기는 과하지 않게 낮게 유지합니다.
- 목표 스킬 선택 영역과 결과 영역은 PC 기준 좌우 배치합니다.

문서
- arcana/_docs/UPDATE_HISTORY.txt
- arcana/_docs/MODIFIED_FILES.txt

파일 구조
- GitHub 업로드 대상: arcana/ 폴더
- Apps Script 복사 대상: AppsScript/ 폴더
