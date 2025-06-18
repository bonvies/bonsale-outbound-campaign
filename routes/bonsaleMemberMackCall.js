
const express = require('express');
const router = express.Router();
const {
  get3cxToken,
  makeCall,
  getCaller,
} = require('../services/callControl.js');

require('dotenv').config();

const { errorWithTimestamp } = require('../util/timestamp.js');

async function bonsaleMemberMackCall(
  grant_type,
  client_id,
  client_secret,
  phone
) {
  if (!grant_type || !client_id || !client_secret || !phone) {
    errorWithTimestamp('Missing required fields');
    return {
      success: false,
      message: 'Missing required fields',
    };
  }
  try {
    // 先取得 3CX token 
    const fetch_get3cxToken = await get3cxToken(grant_type, client_id, client_secret);
    if (!fetch_get3cxToken.success) {
      errorWithTimestamp('Failed to fetch_get3cxToken');
      return {
        success: false,
        message: fetch_get3cxToken.error.message,
        status: fetch_get3cxToken.error.status,
      };
    }
    const token = fetch_get3cxToken.data?.access_token; // 取得 access_token

    // 取得 撥號分機資訊 (需要設定 queue)
    const fetch_getCaller = await getCaller(token); // 取得撥號者
    if (!fetch_getCaller.success) {
      errorWithTimestamp('Failed to fetch_getCaller');
      return {
        success: false,
        message: fetch_getCaller.error.message,
        status: fetch_getCaller.error.status,
      };
    }
    const caller = fetch_getCaller.data
    const { dn: queueDn, device_id } = caller.devices[0]; // 這邊我只有取第一台設備資訊
    // logWithTimestamp('撥打者資訊 : ', caller);

    // 到這邊準備工作完成 可以開始撥打電話了
    // logWithTimestamp(`撥打者 ${client_id} / 準備撥給 ${phone} 手機`);
    const fetch_makeCall = await makeCall(token, queueDn, device_id, 'outbound', phone);
   if (!fetch_makeCall.success) {
      errorWithTimestamp('Failed to makeCall');
      return {
        success: false,
        message: fetch_makeCall.error.message,
        status: fetch_makeCall.error.status,
      };
    } // 錯誤處理
    const currentCall = fetch_makeCall.data;
    // logWithTimestamp('撥打電話請求:', currentCall);

    return {
      success: true,
      message: 'Request outboundCampaigm successfully',
      currentMakeCall: {
        id: currentCall.result.id,
        token,
        callid: currentCall.result.callid,
        dn: currentCall.result.dn,
        device_id: currentCall.result.device_id,
        party_caller_id: currentCall.result.party_caller_id
      }
    };
  } catch (error) {
    errorWithTimestamp('Error in POST /projectOutbound:', error);
    return {
      success: false,
      message: error.message,
      status: error.status,
    };
  }
}

router.post('/', async function(req, res) {
  const { grant_type, client_id, client_secret, phone } = req.body;

  const result = await bonsaleMemberMackCall(
    grant_type,
    client_id,
    client_secret,
    phone
  );

  if (result.success) {
    return res.status(200).send(result);
  } else {
    return res.status(400).send(result);
  }
});

module.exports = {
  router,
  bonsaleMemberMackCall,
};