# LUMI CLINIC - 통합 CRM & 디지털 시술차트

Firebase + EveLab Insight 연동 프로젝트

## 🏗️ 프로젝트 구조

```
lumi-chart/
├── .github/workflows/    # GitHub Actions 자동 배포
├── functions/            # Firebase Cloud Functions (EveLab Webhook)
├── public/               # Firebase Hosting (웹 UI)
├── firebase.json         # Firebase 설정
├── firestore.rules       # Firestore 보안 규칙
└── firestore.indexes.json
```

## 🚀 배포 방법

### 1. GitHub Secrets 설정
Repository Settings → Secrets → `FIREBASE_TOKEN` 추가

토큰 생성:
```bash
npm install -g firebase-tools
firebase login:ci
```

### 2. EveLab AppSecret 설정
```bash
firebase functions:config:set evelab.secret="YOUR_EVELAB_APP_SECRET"
firebase deploy --only functions
```

### 3. EveLab 백엔드 설정
수신 주소에 입력:
```
https://asia-northeast3-lumi-chart.cloudfunctions.net/evelabWebhook
```

## 📡 API Endpoints

| Endpoint | 용도 |
|----------|------|
| `/evelabWebhook` | EveLab 데이터 수신 |
| `/healthCheck` | 상태 확인 |

## 📊 Firestore Collections

- `evelab_users` - EveLab 사용자
- `evelab_reports` - 피부분석 리포트
- `patients` - 환자 마스터
- `charts` - 시술 차트
- `appointments` - 예약

## 🔧 로컬 개발

```bash
# Functions 에뮬레이터
cd functions && npm install
firebase emulators:start --only functions,firestore
```
