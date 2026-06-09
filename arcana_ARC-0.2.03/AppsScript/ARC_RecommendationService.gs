/*
 * ARC-0.2.02
 * 추천 계산은 프론트엔드에서 수행한다.
 * 서버는 클래스별 스킬 목록과 아르카나별 등록 가능 스킬 풀을 제공한다.
 */
function ARC_runSimulation(payload) {
  return {
    ok: true,
    message: 'ARC-0.2.02에서는 프론트엔드 추천 계산을 사용합니다.',
    payload: payload || {}
  };
}
