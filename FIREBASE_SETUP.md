# NAMDA 명함첩: Google 로그인과 계정별 동기화 설정

## 현재 구성과 필요한 접근

이 앱은 Render의 정적 사이트입니다. 명함 스캔과 기기 내 저장은 Firebase 없이도 사용할 수 있습니다. Google 로그인과 계정별 클라우드 저장은 실제 Firebase 프로젝트의 설정이 있어야 작동합니다.

`firebase-config.js`에 `window.NAMDA_FIREBASE_CONFIG = null`이면 로그인은 **미설정 상태**입니다. 이 상태에서 로그인 완료, 클라우드 저장 완료 또는 다른 기기와 동기화됐다고 표시해서는 안 됩니다. 앱은 Firebase 라이브러리를 불러오기 전에 이 상태를 확인합니다.

ChatGPT의 Firebase 플러그인을 설치하는 일과 이 사이트의 Firebase 프로젝트를 설정하는 일은 별개입니다. 플러그인이 설치돼도 프로젝트 접근 권한, Google 로그인 제공업체 설정, Firestore 규칙과 사이트 연결값이 필요합니다. Firebase CLI를 설치하는 것만으로 Google 계정에 접근할 수는 없습니다.

아래 작업은 프로젝트 관리자가 Firebase 콘솔 또는 인증된 Firebase CLI/MCP로 수행합니다. 서비스 계정 비밀키, Google 비밀번호, OAuth 토큰을 이 저장소나 채팅에 넣지 마세요.

## 프로젝트 설정

1. NAMDA용 Firebase 프로젝트를 확인하고 웹 앱을 등록합니다. 기존 프로젝트가 있다면 먼저 재사용 가능 여부를 확인합니다.
2. Authentication의 **Sign-in method**에서 **Google**을 활성화하고 지원 이메일을 지정합니다.
3. Authentication의 **Settings → Authorized domains**에 `namda-business-card-ai.onrender.com`을 추가합니다. 경로나 `https://`는 도메인 항목에 넣지 않습니다.
4. Cloud Firestore의 기본 데이터베이스를 생성하고 서비스 이용 지역을 선택합니다. 데이터베이스 위치는 나중에 손쉽게 옮길 수 있는 설정이 아니므로 운영 지역을 먼저 결정합니다.
5. 이 저장소의 `firestore.rules`를 배포합니다. 로그인한 사용자만 `users/{본인 uid}/cards/{cardId}`에 접근하도록 제한합니다. 테스트용 전체 공개 규칙을 사용하지 않습니다.
6. 프로젝트 설정의 **내 앱 → 웹 앱 → SDK 설정 및 구성**에서 실제 Firebase 구성 객체를 가져와 `firebase-config.js`의 값을 교체합니다.

```js
// 아래 문자열은 설명용 자리표시자입니다. 그대로 배포하지 마세요.
window.NAMDA_FIREBASE_CONFIG = {
  apiKey: 'YOUR_FIREBASE_WEB_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  appId: 'YOUR_FIREBASE_WEB_APP_ID'
};
```

Firebase 웹 구성값은 클라이언트의 공개 식별값입니다. 보안은 Authentication과 Firestore 규칙으로 적용합니다. 웹 API 키에는 Firebase 서비스에 맞는 제한을 적용하고, 일반 Google Cloud 유료 API용 키나 서비스 계정 키와 혼용하지 않습니다. 구성값을 방문자별 로그인 입력창이나 브라우저 저장소에서 변경하도록 만들지 않습니다.

7. 변경 사항을 GitHub에 반영하고 Render 배포가 `live` 상태가 됐는지 확인합니다. 배포 상태 확인만으로 아래 로그인·동기화 검증을 대신할 수는 없습니다.

## 모바일 로그인 방식

Google 로그인 버튼을 누르면 팝업 방식으로 인증합니다. 앱이 시작될 때 세션 저장 방식을 준비해, 버튼을 누른 뒤 추가 비동기 작업 때문에 팝업이 차단되는 일을 줄입니다. 앱 안의 브라우저에서 팝업이 차단되면 Chrome 또는 Safari에서 사이트를 엽니다.

현재 Render 사이트에서는 로그인 창이 막혔다는 이유로 곧바로 `signInWithRedirect`로 바꾸지 않습니다. Firebase 기본 인증 도메인과 사이트 도메인이 다르면 브라우저의 타사 저장소 제한 때문에 리디렉션 이후 로그인 결과를 잃을 수 있습니다. 리디렉션을 사용하려면 Firebase 공식 문서에 따라 인증 보조 경로의 동일 출처 프록시 또는 다른 지원 구성을 먼저 적용해야 합니다.

## 데이터 처리

- 로그인 전 명함은 기존 기기 내 저장소에 남습니다. 로그인 후 자동으로 특정 Google 계정에 업로드하지 않습니다.
- 로그인하면 해당 Google 계정의 명함만 구독합니다. 계정이 바뀌면 이전 구독을 중단하고 화면과 진행 중인 명함 편집·스캔을 초기화합니다.
- 로그아웃하면 클라우드 명함을 화면에서 제거하고 기존 기기 내 명함을 다시 표시합니다.
- 저장·삭제가 진행되는 중 계정이 바뀌면 이전 계정의 응답을 새 계정 화면에 섞지 않습니다.
- 브라우저가 명시적으로 오프라인이면 클라우드 쓰기를 시작하지 않습니다. 온라인 여부만으로 서버 저장 성공을 보장하지 않으므로 실제 쓰기 완료를 기다립니다.
- 명함 사진은 500,000자 이하의 데이터 URL로 제한합니다. 사진은 앱에서 축소하고, 클라우드 규칙에서도 같은 제한을 확인합니다.

## 운영 전 확인

실제 Firebase 프로젝트가 연결된 브라우저에서 다음을 확인합니다.

1. Google 로그인과 로그아웃이 성공하는지 확인합니다.
2. 계정 A에 만든 명함이 다른 기기에서 계정 A로 접속했을 때 보이는지 확인합니다.
3. 계정 B에는 계정 A의 명함이 보이지 않는지 확인합니다. Firestore 규칙 테스트에서도 다른 사용자의 경로 읽기·쓰기가 거부돼야 합니다.
4. 명함 저장 또는 삭제 중 계정을 바꿔도 두 계정의 명함이 화면에서 섞이지 않는지 확인합니다.
5. 로그아웃 후 계정 명함이 화면에서 사라지고 기존 기기 내 명함이 유지되는지 확인합니다.
6. 도메인 미등록, 제공업체 미활성화, Firestore 권한 부족, 팝업 차단, 네트워크 오류를 구별해 안내하는지 확인합니다.

로컬 모의 테스트는 SDK 호출 순서와 계정 간 결과 분리를 검증할 수 있지만 실제 Google 로그인, 실제 Firestore 규칙 적용 또는 기기 간 동기화가 완료됐다는 증거는 아닙니다.

## 공식 문서

- [웹에서 Google 로그인](https://firebase.google.com/docs/auth/web/google-signin)
- [리디렉션 로그인과 타사 저장소 제한](https://firebase.google.com/docs/auth/web/redirect-best-practices)
- [Firebase 웹 API 키](https://firebase.google.com/docs/projects/api-keys)
- [Firebase MCP와 인증](https://firebase.google.com/docs/ai-assistance/mcp-server)
