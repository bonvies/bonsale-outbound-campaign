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
  getReportAgentsInQueueStatistics,
  getUsers
} = require('../services/xApi.js');

require('dotenv').config();

const CALL_GAP_TIME = parseInt(process.env.CALL_GAP_TIME) || 3; // 預設 3 秒

// 創建 WebSocket Server
const clientWsProjectOutbound = new WebSocket.Server({ port: process.env.WS_PORT_PROJECT_OUTBOUND });

clientWsProjectOutbound.on('connection', (ws) => {
  console.log('WebSocket Server: Client connected');

  ws.on('close', () => {
    console.log('WebSocket Server: Client disconnected');
  });
});

let globalToken = null;
const activeCallQueue = [];

setInterval(async () => {
  console.log(`每 ${CALL_GAP_TIME} 秒檢查一次撥號狀態`);
  if (!globalToken) { // 如果沒有 token 就回傳給所有客戶端一個空陣列
    console.log('沒有 globalToken，回傳空陣列');
    clientWsProjectOutbound.clients.forEach((client) => {
      client.send(JSON.stringify([]));
    });
    return;
  };

  try {
    // 獲取目前活躍的撥號狀態
    const fetch_getActiveCalls = await activeCalls(globalToken);
    console.log('獲取目前活躍的撥號狀態:', fetch_getActiveCalls);

    // 如果 token 失效，清除 globalToken
    // 這邊的狀況是 token 失效了，這時候我們要清除 globalToken 讓流程持續
    if (!fetch_getActiveCalls.success && fetch_getActiveCalls.error.status === 401) {
      console.log('token 失效，清除 globalToken 讓流程持續');
      globalToken = null; // 清除 token
      return
    }

    const activeCall = fetch_getActiveCalls.data; // 目前活躍的撥號狀態

    let matchingCallResult = []; // 儲存匹配的撥號物件

    // 遍歷 activeCallQueue，檢查是否有匹配的 callId
    for (let i = activeCallQueue.length - 1; i >= 0; i--) {
      const queueItem = activeCallQueue[i];
      const matchingCall = activeCall.value?.find(item => item.Id === queueItem.callid);

      if (matchingCall) {
        matchingCallResult.push({
          id:queueItem.id,
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
    clientWsProjectOutbound.clients.forEach((client) => {
      client.send(JSON.stringify(matchingCallResult));
    });

  } catch (error) {
    console.error('Error while checking active calls:', error.message);
  }
}, CALL_GAP_TIME * 1000); // 每 CALL_GAP_TIME 秒檢查一次撥號狀態

// projectOutbound API
router.post('/', async function(req, res, next) {
  const id = uuidv4();
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

    // 取得 撥號分機資訊 (需要設定 queue)
    const fetch_getCaller = await getCaller(token); // 取得撥號者
    if (!fetch_getCaller.success) return res.status(fetch_getCaller.error.status).send(fetch_getCaller.error); // 錯誤處理
    const caller = fetch_getCaller.data
    const { dn: queueDn, device_id } = caller.devices[0]; // 這邊我只有取第一台設備資訊
    // console.log('撥打者資訊 : ', caller);

    // 這邊 我們要判斷 撥打者分配的 代理人的狀態 (也就是分機人員) 他的狀態是不是空閒的
    // 如果是不是空閒的話 就可以不可以撥打電話 並回傳 res 訊息 ( 狀態碼要設 202 ) 

    // 取得 隊列 { queueDn } 的代理人資訊
    const currentDate = new Date().toISOString();
    const reportAgentsInQueueStatistics = await getReportAgentsInQueueStatistics(token, queueDn, currentDate, currentDate, '0:00:0');
    // console.log('撥打者分配的代理人狀態:', reportAgentsInQueueStatistics.data);
    const { Dn: agentDn } = reportAgentsInQueueStatistics.data.value[0]; // 這邊我只取第一個代理人資訊
    // console.log('撥打者分配的代理人狀態:', agentDn , queueDn);

    // 有了 agentDn 我可以查看這個代理人的詳細狀態 包含是否為空閒狀態 ( CurrentProfileName 的值 )
    const fetch_getUsers = await getUsers(token, agentDn);
    if (!fetch_getUsers.success) return res.status(fetch_getUsers.error.status).send(fetch_getUsers.error); // 錯誤處理
    const { CurrentProfileName, ForwardingProfiles } = fetch_getUsers.data.value[0]; // 這邊我只取第一個代理人詳細資訊

    // 我們用還需要知道 CurrentProfileName 的值 有沒有被 Log out from queues 這才是我們要的狀態
    // console.log('撥打者分配的代理人詳細狀態:', CurrentProfileName, ForwardingProfiles);

    const findForwardingProfiles = ForwardingProfiles.find(profile => profile.Name === CurrentProfileName);
    const isLogOutFromQueues = findForwardingProfiles?.OfficeHoursAutoQueueLogOut;

    // console.log('撥打者分配的代理人詳細狀態:', CurrentProfileName);

    /* NOTO 這邊的邏輯 被簡化了 變成只要 偵測 CurrentProfileName 只要不是 Available 就不要撥打電話

      // 如果不是空閒的話 就可以不可以撥打電話 並回傳 res 訊息 ( 狀態碼要設 202 )
      if (isLogOutFromQueues) {
        // console.warn('撥打者分配的代理人狀態不是空閒的', CurrentProfileName);
        console.warn(`撥打者分配的代理人狀態是 ${CurrentProfileName} 此狀態是設定不是空閒的`);
        return res.status(202).send({
          message: `撥打者分配的代理人狀態是 ${CurrentProfileName} 此狀態是設定不是空閒的`,
          status: CurrentProfileName,
          isLogOutFromQueues
        });
      }
    
    */

    // 如果不是空閒的話 就可以不可以撥打電話 並回傳 res 訊息 ( 狀態碼要設 202 )
    if (CurrentProfileName !== 'Available') {
      // console.warn('撥打者分配的代理人狀態不是空閒的', CurrentProfileName);
      console.warn(`撥打者分配的代理人狀態是 ${CurrentProfileName} 此狀態限制不能撥打電話`);
      return res.status(202).send({
        message: `撥打者分配的代理人狀態是 ${CurrentProfileName} 此狀態限制不能撥打電話`,
        status: CurrentProfileName,
        isLogOutFromQueues
      });
    }
    // 如果是空閒的話 就可以準備撥打電話
    console.log(`撥打者分配的代理人狀態是 ${CurrentProfileName} 此狀態是設定是空閒的`);

    // 到這邊準備工作完成 可以開始撥打電話了
    console.log(`撥打者 ${client_id} / 準備撥給 ${phone} 手機`);
    const fetch_makeCall = await makeCall(token, queueDn, device_id, 'outbound', phone);
    if (!fetch_makeCall.success) return res.status(fetch_makeCall.error.status).send(fetch_makeCall.error); // 錯誤處理
    const currentCall = fetch_makeCall.data;
    console.log('撥打電話請求:', currentCall);

    // 撥打電話的時候 會回傳 一個 callid 我們可以利用這個 callid 來查詢當前的撥打狀態
    const { callid } = currentCall.result;

    globalToken = token; // 儲存 token 以便後續使用

    // // 將請求加入佇列
    activeCallQueue.push({ token, callid, id, phone, projectId, customerId });

    res.status(200).send({
      message: 'Request outboundCampaigm successfully',
      token_3cx: token,
      currentCall
    });
  } catch (error) {
    console.error('Error in POST /projectOutbound:', error);
    res.status(error.status).send(`Error in POST /projectOutbound: ${error.message}`);
  }
});

module.exports = router;
