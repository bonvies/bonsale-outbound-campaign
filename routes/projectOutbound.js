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
const { autoOutbound } = require('../components/autoOutbound.js');

const { logWithTimestamp, warnWithTimestamp, errorWithTimestamp } = require('../util/timestamp.js');
const { projectsMatchingCallFn } = require('../components/projectsMatchingCallFn.js');

require('dotenv').config();

const CALL_GAP_TIME = parseInt(process.env.CALL_GAP_TIME) || 3; // 預設 3 秒

// 創建 WebSocket Server
const clientWsProjectOutbound = new WebSocket.Server({ noServer: true });

clientWsProjectOutbound.on('connection', (ws) => {
  logWithTimestamp('WebSocket Server - clientWsProjectOutbound: Client connected');

  ws.on('close', () => {
    logWithTimestamp('WebSocket Server - clientWsProjectOutbound: Client disconnected');
  });
});

let globalToken = null;
const projects = []; // 儲存專案資訊
const activeCallQueue = []; // 儲存活躍撥號的佇列

// 每 CALL_GAP_TIME 秒 進行自動撥號 並 檢查撥號狀態
setInterval(async () => {
  // 如果沒有專案，就不進行撥號
  if (projects.length === 0) {
    logWithTimestamp('沒有專案，跳過自動撥號');
    return;
  }
  logWithTimestamp(`開始自動撥號，總共有 ${projects.length} 個專案`);
  // console.log(projects);
  projects.forEach(async (project, projectIndex, projectArray ) => {
    const called = await autoOutbound(project, projectIndex, projectArray);
    //  console.log('測試 addInActiveCallQueue ',called);
    if (called) {
      globalToken = called.addInActiveCallQueue.token; // 更新 globalToken
      activeCallQueue.push(called.addInActiveCallQueue);
    }
  //  activeCallQueue.push(called.addInActiveCallQueue);
  });



  logWithTimestamp(`每 ${CALL_GAP_TIME} 秒檢查一次撥號狀態`);
  if (!globalToken) { // 如果沒有 token 就回傳給所有客戶端一個空陣列
    logWithTimestamp('沒有 globalToken，回傳空陣列');
    // clientWsProjectOutbound.clients.forEach((client) => {
    //   client.send(JSON.stringify([]));
    // });
    return;
  };

  try {
    // 獲取目前活躍的撥號狀態
    const fetch_getActiveCalls = await activeCalls(globalToken);
    logWithTimestamp('獲取目前活躍的撥號狀態:', fetch_getActiveCalls);

    // 如果 token 失效，清除 globalToken
    // 這邊的狀況是 token 失效了，這時候我們要清除 globalToken 讓流程持續
    if (!fetch_getActiveCalls.success && fetch_getActiveCalls.error.status === 401) {
      logWithTimestamp('token 失效，清除 globalToken 讓流程持續');
      globalToken = null; // 清除 token
      return
    }

    const activeCall = fetch_getActiveCalls.data; // 目前活躍的撥號狀態

    let matchingCallResults = []; // 儲存匹配的撥號物件

    // 遍歷 activeCallQueue，檢查是否有匹配的 callId
    for (let i = activeCallQueue.length - 1; i >= 0; i--) {
      const queueItem = activeCallQueue[i];
      const matchingCall = activeCall.value?.find(item => item.Id === queueItem.callid);

      if (matchingCall) {
        matchingCallResults.push({
          id:queueItem.id,
          phone: queueItem.phone,
          callFlowId: queueItem.callFlowId,
          projectId: queueItem.projectId,
          customerId: queueItem.customerId,
          activeCall: matchingCall
        });
        
      } else {
        // logWithTimestamp(`移除無匹配的 callId: ${queueItem.callid}`);
        activeCallQueue.splice(i, 1); // 移除無匹配的項目
      }
    }
    // logWithTimestamp('匹配的撥號物件:', matchingCallResults);
    await projectsMatchingCallFn(projects, matchingCallResults);

    // 將匹配的撥號物件傳送給 WebSocket Server 的所有連線客戶端
    clientWsProjectOutbound.clients.forEach((client) => {
      client.send(JSON.stringify(projects));
    });

  } catch (error) {
    errorWithTimestamp('Error while checking active calls:', error.message);
  }
}, CALL_GAP_TIME * 1000); // 每 CALL_GAP_TIME 秒檢查一次撥號狀態


 



// projectOutbound API
router.post('/', async function(req, res, next) {
  const { grant_type, client_id, client_secret, callFlowId, projectId, action } = req.body;
  // action 有三種狀態 active, stop, pause waiting recording
  if (!grant_type || !client_id || !client_secret || !callFlowId || !projectId || !action) {
    errorWithTimestamp('Missing required fields');
    return res.status(400).send('Missing required fields');
  }

  projects.push({ grant_type, client_id, client_secret, callFlowId, projectId, action, projectCallData: null, });

  res.status(200).send({
    message: 'Request projectOutbound successfully'
  });
});

module.exports = { router, clientWsProjectOutbound };
