# NAMDA AI 명함첩 Google 로그인 설정

이 리포지토리는 정적 웹앱입니다. 구글 로그인을 안전하게 사용하려면 Firebase Authentication과 Firestore 설정이 필요합니다.

1. Firebase 콘솔에서 NAMDA용 Firebase 프로젝트를 생성한 후 웹 앱을 등록합니다.
2. Authentication > Sign-in method에서 Google 제공업체를 활성화합니다.
3. Authentication > Settings > Authorized domains에서 `namda-business-card-ai.onrender.com`을 허용합니다.
4. Firestore Database를 생성하고, 이 저장소의 `firestore.rules` 규칙을 그대로 적용하여 배포합니다. **테스트 모드의 전체 공개 규칙을 유지하지 마세요.**
5. Firebase 웹 앱 설정값(apiKey, authDomain, projectId, appId 등)을 `firebase-config.js`의 `window.NAMDA_FIREBASE_CONFIG` 객체에 입력합니다. 이 설정은 웹 클라이언트의 공개 식별값이며 비밀번호나 서비스 계정 비밀키를 입력해서는 안 됩니다.
6. Render 최신 배포 완료 후 구글 로그인, 로그아웃, 계정 전환, 기기 간 동기화, 사용자 간 접근 차단을 확인합니다.

기존 브라우저의 로컬 명함은 자동으로 다른 계정에 업로드하지 않습니다. 기존 명함은 먼저 데이터 관리에서 JSON 백업해 두세요. 클라우드 운영 시 로그인한 계정별 Firestore 경로 `users/{uid}/cards/{cardId}`에 저장됩니다.

Firebase 설정 전에는 로컬 체험 모드로 유지되며, 로그인/로그아웃은 실제로 작동하지 않습니다. 화면에 이를 명확하게 표시합니다.
