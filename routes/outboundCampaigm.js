const express = require('express');
const WebSocket = require('ws');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const {
  get3cxToken,
  makeCall,
  getCaller,
  getParticipants
} = require('../services/callControl.js');

const {
  activeCalls,
  activeCallId,
  getQueues,
  getQueuesById
} = require('../services/xApi.js');
const e = require('express');

require('dotenv').config();

const wsHost = process.env.WS_HOST_3CX
const callGapTime = parseInt(process.env.CALL_GAP_TIME) || 5; // 預設 5 秒

// 創建 WebSocket Server
const clientWs = new WebSocket.Server({ port: process.env.WS_PORT_OUTBOUND_CAMPAIGM || 3021 });
const clientWsV2 = new WebSocket.Server({ port: process.env.WS_PORT_OUTBOUND_CAMPAIGM_V2 || 3022 });

clientWs.on('connection', (ws) => {
  console.log('WebSocket Server: Client connected');

  ws.on('close', () => {
    console.log('WebSocket Server: Client disconnected');
  });
});

clientWsV2.on('connection', (ws) => {
  console.log('WebSocket Server: Client connected');

  ws.on('close', () => {
    console.log('WebSocket Server: Client disconnected');
  });
});

// 建立 WebSocket 連線 查看自動撥號狀態
function createWs (token, phones, dn, device_id, caller, client_id) {
  const phoneNumbersArray = phones.split(',');
  let nowCall = 0;

  try {
    // 建立 WebSocket 連線
    const ws = new WebSocket(`${wsHost}/callcontrol/ws`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    ws.on('open', async function open() {
      // console.log('WebSocket connection established');

      // 進行初次撥打電話
      const phoneNumbersArray = phones.split(',');
      console.log(`撥打者 ${client_id} / 準備撥給 第 ${nowCall + 1} 隻手機: ${phoneNumbersArray[nowCall]}`);
      await makeCall(token, dn, device_id, 'outbound', phoneNumbersArray[0]);
    });

    ws.on('message', async function message(data) {
      try {
        // 取得參與者資訊
        const participants = await getParticipants(token, dn);
        // console.log('參與者資訊 : ', participants);

        // 將 Buffer 轉換為字串
        const messageString = data.toString();
    
        // 如果是 JSON 格式，嘗試解析
        const messageJson = JSON.parse(messageString);
    
        // console.log('WebSocket server 接收數據 : ', messageJson);

        const { event_type } = messageJson.event;

        // 整合 參與者資訊 和 WebSocket server 接收數據
        // console.log('caller.devices:', caller.devices);
        const resultData = {
          ...messageJson,
          client_id,
          caller: {
            dn: caller.dn,
            type: caller.type,
            devices: caller.devices,
          },
          participants: participants
        }

        // if(client_id === 'leo'){
        //   console.error('整合 參與者資訊 和 WebSocket server 接收數據 : ', resultData);
        // } else {
        //   console.log('整合 參與者資訊 和 WebSocket server 接收數據 : ', resultData);
        // }

        console.log('整合 參與者資訊 和 WebSocket server 接收數據 : ', resultData);
        

        // 傳送 resultData 給 WebSocket Server 的所有連線客戶端
        clientWs.clients.forEach((client) => {
          client.send(JSON.stringify(resultData));
        });
        
        if (event_type === 1) {
          // console.log('event_type:', event_type);
          nowCall++;
          console.log('=================== 我是分隔線 ====================');
          // console.log(`撥打者 ${caller.dn} / 前一隻手機掛斷了 ${callGapTime} 秒後準備撥給 第 ${nowCall + 1} 隻手機: ${phoneNumbersArray[nowCall]}`);
          console.log(`撥打者 ${client_id} / 前一隻手機接聽分機成功或中斷了 準備 ${callGapTime} 秒後準備撥給下隻手機`);
          if (!phoneNumbersArray[nowCall]) {
            console.log('沒有更多的電話號碼可以撥打');
            nowCall = 0; // 重置計數器
            ws.close(); // 關閉 WebSocket 連線
            return;
          } else {
            // 等待 ${callGapTime} 秒後撥打下一個電話
            setTimeout(async () => {
              console.log(`撥打者 ${client_id} / 準備撥給 第 ${nowCall} 手機: ${phoneNumbersArray[nowCall]}`);
              await makeCall(token, dn, device_id, 'outbound', phoneNumbersArray[nowCall]);
            }, callGapTime * 1000); // 轉換為毫秒
          }
        }

      } catch (error) {
        // 如果不是 JSON 格式，直接輸出字串
        clientWs.close();
        console.log('Received raw message from WebSocket server:', data.toString());
      }
    });

    ws.on('close', function close() {
      // console.log('WebSocket connection closed');
    });

    ws.on('error', function error(err) {
      // console.error('WebSocket error:', err.message);
      throw new Error('WebSocket connection error');
    });

  } catch (error) {
    console.error('Error establishing WebSocket connection:', error.message);
    throw new Error('Failed to establish WebSocket connection');
  }
};

// 常規的 outboundCampaigm API
router.post('/', async function(req, res, next) {
  const { grant_type, client_id, client_secret, phones } = req.body;

  if (!grant_type || !client_id || !client_secret || !phones) {
    return res.status(400).send('Missing required fields');
  }
  try {
    // 先取得 3CX token 
    const token = await get3cxToken(grant_type, client_id, client_secret);
    // console.log(token);

    // 取得 撥號分機資訊 (需要設定 queue)
    const caller = await getCaller(token); // 取得撥號者
    const { dn, device_id } = caller.devices[0]; // TODO 這邊我只有取第一台設備資訊

    // 建立 WebSocket 連線
    try {
      createWs(token, phones, dn, device_id, caller, client_id);
    } catch (error) {
      console.error('Error establishing WebSocket connection:', error.message);
    }

    // // Log the received data (for debugging purposes)
    // console.log({ grant_type, client_id, client_secret, phones });

    res.status(200).send({
      message: 'Request outboundCampaigm successfully',
      token_3cx: token,
    });
  } catch (error) {
    console.error('Error in POST /:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

let globalToken = null;
const activeCallQueue = [];
const callStatusMap = new Map(); // 用於儲存每個 callid 的狀態

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
router.post('/v2', async function(req, res, next) {
  const requestId = uuidv4();
  const { grant_type, client_id, client_secret, phone, projectId } = req.body;

  if (!grant_type || !client_id || !client_secret || !phone || !projectId) {
    return res.status(400).send('Missing required fields');
  }
  try {
    // 先取得 3CX token 
    const token = await get3cxToken(grant_type, client_id, client_secret);
    // console.log(token);

    // 取得 撥號分機資訊 (需要設定 queue)
    const caller = await getCaller(token); // 取得撥號者
    const { dn, device_id } = caller.devices[0]; // TODO 這邊我只有取第一台設備資訊

    // console.log('撥打者資訊 : ', caller);

    // 查找 Queue 中有沒有 caller 的分機
    const queueList = await getQueues(token, dn);
    const queue = (queueList.value.find(item => item.Number === dn));
    if (!queue.Id) {
      console.error('Queue ID not found for the caller');
      return res.status(400).send('Queue ID not found for the caller');
    }
    // console.log('Queue : ', queue);

    // 有了 queueId 就可以找到 該 dn 分機 指派了哪些電話號碼
    const queuePhones = await getQueuesById(token, queue.Id);
    if(!queuePhones) {
      console.error('Queue Phones not found for the caller');
      return res.status(400).send('Queue Phones not found for the caller');
    }

    // 到這邊準備工作完成 可以開始撥打電話了
    console.log(`撥打者 ${client_id} / 準備撥給 ${phone} 手機`);
    const currentCall = await makeCall(token, dn, device_id, 'outbound', phone);
    console.log('撥打電話請求:', currentCall);

    // 撥打電話的時候 會回傳 一個 callid 我們可以利用這個 callid 來查詢當前的撥打狀態
    const { callid } = currentCall.result;

    globalToken = token; // 儲存 token 以便後續使用

    // // 將請求加入佇列
    activeCallQueue.push({ token, callid, requestId, phone, projectId });

    res.status(200).send({
      message: 'Request outboundCampaigm successfully',
      token_3cx: token,
      currentCall
    });
  } catch (error) {
    console.error('Error in POST /:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
