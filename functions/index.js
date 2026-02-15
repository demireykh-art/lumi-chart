/**
 * LUMI CLINIC - EveLab Insight Webhook Receiver
 * Firebase Cloud Functions for lumi-chart project
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

// ═══════════════════════════════════════════════════════════
// 설정 - EveLab 백엔드에서 AppSecret 확인 후 환경변수로 설정
// firebase functions:config:set evelab.secret="YOUR_APP_SECRET"
// ═══════════════════════════════════════════════════════════
const getAppSecret = () => {
  return functions.config().evelab?.secret || 'TEST_SECRET';
};

// ═══════════════════════════════════════════════════════════
// 서명 검증
// ═══════════════════════════════════════════════════════════
function verifySignature(id, sigTime, sig, reportId = null) {
  const appSecret = getAppSecret();
  
  let signString;
  if (reportId) {
    signString = `report_id=${reportId}&sig_time=${sigTime}`;
  } else {
    signString = `id=${id}&sig_time=${sigTime}`;
  }
  signString += appSecret;
  
  const hash = crypto.createHash('md5').update(signString).digest('hex');
  return hash.toLowerCase() === sig.toLowerCase();
}

function validateSigTime(sigTime) {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.abs(now - sigTime);
  return diff <= 180; // 3분 허용
}

// ═══════════════════════════════════════════════════════════
// 메인 Webhook 핸들러
// ═══════════════════════════════════════════════════════════
exports.evelabWebhook = functions
  .region('asia-northeast3')
  .https.onRequest(async (req, res) => {
    // CORS 헤더
    res.set('Access-Control-Allow-Origin', '*');
    
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'POST');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(204).send('');
    }
    
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }
    
    try {
      const { data_type, action_type, source_type, sig, sig_time, data } = req.body;
      
      console.log(`[EveLab] 수신: ${data_type} / ${action_type} / ${source_type}`);
      
      // 테스트 요청 처리
      if (data_type === 'test') {
        const isValid = verifySignature(data.id, sig_time, sig);
        if (isValid) {
          console.log('[EveLab] 테스트 서명 검증 성공');
          return res.send('success');
        } else {
          console.error('[EveLab] 테스트 서명 검증 실패');
          return res.status(403).send('Invalid signature');
        }
      }
      
      // 서명 시간 검증
      if (!validateSigTime(sig_time)) {
        console.error('[EveLab] 서명 시간 초과');
        return res.status(403).send('Signature expired');
      }
      
      // 서명 검증
      const reportId = data.report_id;
      const userId = data.id;
      const isValid = reportId 
        ? verifySignature(null, sig_time, sig, reportId)
        : verifySignature(userId, sig_time, sig);
      
      if (!isValid) {
        console.error('[EveLab] 서명 검증 실패');
        return res.status(403).send('Invalid signature');
      }
      
      // 데이터 타입별 처리
      switch (data_type) {
        case 'user':
          await handleUserData(action_type, data);
          break;
        case 'report':
          await handleReportData(action_type, data);
          break;
        case 'report_image':
          await handleReportImageData(action_type, data);
          break;
        case 'report_3d':
          await handleReport3DData(action_type, data);
          break;
        default:
          console.warn(`[EveLab] 알 수 없는 data_type: ${data_type}`);
      }
      
      return res.send('success');
      
    } catch (error) {
      console.error('[EveLab] 처리 오류:', error);
      return res.send('success'); // 오류 시에도 success 반환
    }
  });

// ═══════════════════════════════════════════════════════════
// 데이터 핸들러
// ═══════════════════════════════════════════════════════════

async function handleUserData(actionType, data) {
  const docRef = db.collection('evelab_users').doc(String(data.id));
  
  if (actionType === 'delete') {
    await docRef.delete();
    console.log(`[EveLab] 사용자 삭제: ${data.id}`);
    return;
  }
  
  const userData = {
    evelab_id: data.id,
    custom_id: data.custom_id || null,
    merchant_id: data.merchant_id,
    account_id: data.account_id,
    store_id: data.store_id,
    name: data.name,
    gender: data.gender,
    birthday: data.birthday,
    phone_number: data.phone_number,
    phone_cc: data.phone_cc,
    email: data.email,
    skin_concerns: data.target || {},
    is_sensitive: data.is_irritability === 2,
    created_at: admin.firestore.Timestamp.fromMillis(data.created_at * 1000),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  
  await docRef.set(userData, { merge: true });
  console.log(`[EveLab] 사용자 ${actionType}: ${data.id} - ${data.name}`);
}

async function handleReportData(actionType, data) {
  const docRef = db.collection('evelab_reports').doc(String(data.report_id));
  
  if (actionType === 'delete') {
    await docRef.delete();
    console.log(`[EveLab] 리포트 삭제: ${data.report_id}`);
    return;
  }
  
  // 피부 분석 요약
  const summary = {
    skin_age: data.preview?.skin_age,
    actual_age: data.preview?.age,
    skin_type: data.preview?.skin_type,
    skin_color: data.preview?.color,
    skin_tone: data.preview?.tone,
  };
  
  // 점수
  const scores = {
    aging: data.aging_degree?.score,
    pore: data.pore?.score,
    blackhead: data.blackhead?.score,
    wrinkle: data.wrinkle?.score,
    speckle: data.speckle?.score,
    acne: data.acne?.score,
    sensitive: data.sensitive?.score,
    dark_circle: data.black_rim_of_eye?.score,
    skin_glow: data.skin_glow?.score,
    eye_bags: data.eye_bags?.score,
  };
  
  // 심각도
  const severity = {
    pore: data.pore?.degree,
    blackhead: data.blackhead?.degree,
    wrinkle: data.wrinkle?.degree,
    speckle: data.speckle?.degree,
    acne: data.acne?.degree,
    sensitive: data.sensitive?.degree,
    dark_circle: data.black_rim_of_eye?.degree,
    eye_bags: data.eye_bags?.degree,
  };
  
  // 자동 태깅
  const concerns = [];
  if (data.pore?.degree >= 3) concerns.push('모공');
  if (data.blackhead?.degree >= 3) concerns.push('블랙헤드');
  if (data.wrinkle?.degree >= 3) concerns.push('주름');
  if (data.speckle?.degree >= 3) concerns.push('색소침착');
  if (data.acne?.degree >= 3) concerns.push('여드름');
  if (data.sensitive?.degree >= 3) concerns.push('민감성');
  if (data.black_rim_of_eye?.degree >= 3) concerns.push('다크서클');
  if (data.eye_bags?.degree >= 3) concerns.push('눈밑지방');
  
  const reportData = {
    report_id: data.report_id,
    merchant_id: data.merchant_id,
    user_id: data.uid,
    custom_uid: data.custom_uid,
    store_id: data.store_id,
    store_name: data.store_name,
    device_id: data.device_id,
    summary,
    scores,
    severity,
    auto_concerns: concerns,
    detail: {
      pore: data.pore,
      blackhead: data.blackhead,
      wrinkle: data.wrinkle,
      speckle: data.speckle,
      acne: data.acne,
      sensitive: data.sensitive,
      dark_circle: data.black_rim_of_eye,
      skin_glow: data.skin_glow,
      eye_bags: data.eye_bags,
    },
    extend: data.extend,
    created_at: admin.firestore.Timestamp.fromMillis(data.created_at * 1000),
    received_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  
  await docRef.set(reportData, { merge: true });
  console.log(`[EveLab] 리포트 ${actionType}: ${data.report_id}`);
}

async function handleReportImageData(actionType, data) {
  const reportId = String(data.report_id);
  
  // 이미지 URL 저장 (24시간 유효 - 필요시 다운로드 로직 추가)
  await db.collection('evelab_reports').doc(reportId).update({
    images: data.resource,
    images_received_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  console.log(`[EveLab] 이미지 URL 저장: Report ${reportId}`);
}

async function handleReport3DData(actionType, data) {
  const reportId = String(data.report_id);
  
  await db.collection('evelab_reports').doc(reportId).update({
    model_3d: data.resource,
    model_3d_received_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  console.log(`[EveLab] 3D 모델 URL 저장: Report ${reportId}`);
}

// ═══════════════════════════════════════════════════════════
// 상태 확인용 API
// ═══════════════════════════════════════════════════════════
exports.healthCheck = functions
  .region('asia-northeast3')
  .https.onRequest((req, res) => {
    res.json({ 
      status: 'ok', 
      project: 'lumi-chart',
      timestamp: new Date().toISOString()
    });
  });
