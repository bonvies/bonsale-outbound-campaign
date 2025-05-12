const express = require('express');
const WebSocket = require('ws');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const {
  get3cxToken,
  makeCall,
  getCaller,
} = require('../services/callControl.js');

const {
  activeCalls,
  getQueues,
  getQueuesById
} = require('../services/xApi.js');

require('dotenv').config();


// 創建 WebSocket Server
const clientWsV2 = new WebSocket.Server({ port: process.env.WS_PORT_OUTBOUND_CAMPAIGM_V2 || 3022 });

clientWsV2.on('connection', (ws) => {
  console.log('WebSocket Server: Client connected');

  ws.on('close', () => {
    console.log('WebSocket Server: Client disconnected');
  });
});

let globalToken = null;
const activeCallQueue = [];

setInterval(async () => {
  console.log('每 3 秒檢查一次撥號狀態');
  if (!globalToken) return;

  try {
    // 獲取目前活躍的撥號狀態
    const activeCall = await activeCalls(globalToken);
    // console.log('目前活躍的撥號狀態 : ', activeCall);

    let matchingCallResult = []; // 儲存匹配的撥號物件

    // 遍歷 activeCallQueue，檢查是否有匹配的 callId
    for (let i = activeCallQueue.length - 1; i >= 0; i--) {
      const queueItem = activeCallQueue[i];
      const matchingCall = activeCall.value?.find(item => item.Id === queueItem.callid);

      if (matchingCall) {
        matchingCallResult.push({
          requestId:queueItem.requestId,
          phone: queueItem.phone,
          projectId: queueItem.projectId,
          customerId: queueItem.customerId,
          activeCall: matchingCall,
        });
        
      } else {
        // console.log(`移除無匹配的 callId: ${queueItem.callid}`);
        activeCallQueue.splice(i, 1); // 移除無匹配的項目
      }
    }

    console.log('匹配的撥號物件:', matchingCallResult);
    // 將匹配的撥號物件傳送給 WebSocket Server 的所有連線客戶端
    clientWsV2.clients.forEach((client) => {
      client.send(JSON.stringify(matchingCallResult));
    });

  } catch (error) {
    console.error('Error while checking active calls:', error.message);
  }
}, 3000);

// 特規的 outboundCampaigm API
router.post('/', async function(req, res, next) {
  const requestId = uuidv4();
  const { grant_type, client_id, client_secret, phone, projectId, customerId } = req.body;

  if (!grant_type || !client_id || !client_secret || !phone || !projectId || !customerId) {
    console.error('Missing required fields');
    return res.status(400).send('Missing required fields');
  }
  try {
    // 先取得 3CX token 
    const fetch_get3cxToken = await get3cxToken(grant_type, client_id, client_secret);
    if (!fetch_get3cxToken.success) return res.status(fetch_get3cxToken.error.status).send(fetch_get3cxToken.error); // 錯誤處理
    const token = fetch_get3cxToken.data?.access_token; // 取得 access_token
    // console.log(token);

    // 取得 撥號分機資訊 (需要設定 queue)
    const fetch_getCaller = await getCaller(token); // 取得撥號者
    if (!fetch_getCaller.success) return res.status(fetch_getCaller.error.status).send(fetch_getCaller.error); // 錯誤處理
    const caller = fetch_getCaller.data
    const { dn, device_id } = caller.devices[0]; // 這邊我只有取第一台設備資訊
    // console.log('撥打者資訊 : ', caller);

    // 到這邊準備工作完成 可以開始撥打電話了
    console.log(`撥打者 ${client_id} / 準備撥給 ${phone} 手機`);
    const fetch_makeCall = await makeCall(token, dn, device_id, 'outbound', phone);
    if (!fetch_makeCall.success) return res.status(fetch_makeCall.error.status).send(fetch_makeCall.error); // 錯誤處理
    const currentCall = fetch_makeCall.data;
    console.log('撥打電話請求:', currentCall);

    // 撥打電話的時候 會回傳 一個 callid 我們可以利用這個 callid 來查詢當前的撥打狀態
    const { callid } = currentCall.result;

    globalToken = token; // 儲存 token 以便後續使用

    // // 將請求加入佇列
    activeCallQueue.push({ token, callid, requestId, phone, projectId, customerId });

    res.status(200).send({
      message: 'Request outboundCampaigm successfully',
      token_3cx: token,
      currentCall
    });
  } catch (error) {
    console.error('Error in POST /:', error);
    // console.error('Error in POST /:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
