# 배포

Railway 프로젝트: `84b3c262-43ac-4172-b24f-fe612991c28c`
GitHub: https://github.com/sjinn4443/Trip_Familyu

Dockerfile로 배포하고 서비스의 영구 볼륨을 `/data`에 마운트하세요. `HOST=0.0.0.0`, `PORT=3000`, `DATA_DIR=/data`를 설정합니다. HTTP 상태 확인 경로는 `/api/health`입니다. 파일 저장 방식이므로 서비스는 한 개 인스턴스로 운영합니다. 기존 볼륨의 저장 정보를 재배포 시 유지하며, 초기 가족 네 명은 빈 볼륨에서만 생성됩니다. 구글 Places API 키는 선택 사항입니다.
